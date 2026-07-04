import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "../db/connection.js";
import { projects } from "../db/schema.js";
import type { RunContext } from "../memory/agent-memory.js";
import { HttpError } from "../orchestrator/run-manager.js";
import {
  createMessage,
  createTask,
  getTask,
  resolveAgentRef,
  updateTask,
} from "./service.js";
import { checkCrossTeamBreaker } from "./delegation.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

/** Registered into the /mcp server for every agent run (phase 3 tools). */
export function registerTaskboardTools(server: McpServer, ctx: RunContext): void {
  server.tool(
    "task_create",
    "Create a task on the shared task board, optionally handing it to another agent — FIRE-AND-FORGET: you will NOT get the result back and will not wait. If you need the result, need to wait, or must stay accountable for the outcome, use spawn_subtask instead. The orchestrator runs the assignee with your description — include everything they need, they have no other context.",
    {
      title: z.string(),
      description: z.string(),
      assignToAgent: z.string().optional().describe("Agent name or slug to hand the task to"),
      priority: z.number().int().min(0).max(3).optional().describe("0=low 3=urgent (default 1)"),
    },
    async (args: { title: string; description: string; assignToAgent?: string; priority?: number }) => {
      try {
        const assignee = args.assignToAgent ? resolveAgentRef(args.assignToAgent) : null;
        const projectId = ctx.projectSlug ? currentProjectId(ctx) : null;
        const task = createTask({
          title: args.title,
          description: args.description,
          projectId,
          assignedAgentId: assignee?.id ?? null,
          priority: args.priority ?? 1,
          createdByType: "agent",
          createdByAgentId: ctx.agent.id,
        });
        return textResult(
          JSON.stringify(
            { taskId: task.id, status: task.status, assignedTo: assignee?.name ?? null },
            null,
            2,
          ),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "task_update",
    "Update a task you created or were assigned: set status and/or a result summary for the requester.",
    {
      taskId: z.string(),
      status: z.enum(["in_progress", "review", "done", "failed"]).optional(),
      result: z.string().optional().describe("Outcome summary"),
    },
    async (args: { taskId: string; status?: "in_progress" | "review" | "done" | "failed"; result?: string }) => {
      try {
        const task = getTask(args.taskId);
        if (!task) throw new HttpError(404, `task not found: ${args.taskId}`);
        if (task.assignedAgentId !== ctx.agent.id && task.createdByAgentId !== ctx.agent.id) {
          throw new HttpError(403, "you may only update tasks you created or were assigned");
        }
        // P3 (EH1): a suspended lead cannot close its own task around its children.
        if (task.status === "waiting_children" && args.status) {
          throw new HttpError(
            409,
            "your task is suspended on delegated subtasks (waiting_children) — you cannot set its status now. End your run; you will be re-run with every subtask's result and can report then.",
          );
        }
        if (task.status === "pending_approval" && args.status) {
          throw new HttpError(
            409,
            "this task is awaiting the owner's cross-team approval — its status is the owner's to decide. End your run; you will be woken with the outcome.",
          );
        }
        const updated = updateTask(
          args.taskId,
          { ...(args.status ? { status: args.status } : {}), ...(args.result !== undefined ? { result: args.result } : {}) },
          { triggerRun: false },
        );
        return textResult(JSON.stringify({ taskId: updated.id, status: updated.status }, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "message_send",
    "Send a message to the user's inbox (omit 'to') or to another agent by name. Messages to agents may trigger a run for them.",
    {
      to: z.string().optional().describe("Recipient agent name/slug; omit for the user"),
      subject: z.string(),
      body: z.string(),
    },
    async (args: { to?: string; subject: string; body: string }) => {
      try {
        const recipient = args.to ? resolveAgentRef(args.to) : null;
        // C10: cross-team threads on a task are circuit-broken (settings-backed
        // limit); at the limit the send is refused and the task is blocked for
        // the owner. Same-team and user-inbox messages are never counted.
        if (recipient) {
          checkCrossTeamBreaker({
            fromAgentId: ctx.agent.id,
            fromAgentName: ctx.agent.name,
            toAgentId: recipient.id,
            toAgentName: recipient.name,
            taskId: ctx.taskId,
            runId: ctx.runId,
          });
        }
        const message = createMessage({
          fromType: "agent",
          fromAgentId: ctx.agent.id,
          toAgentId: recipient?.id ?? null,
          projectId: ctx.projectSlug ? currentProjectId(ctx) : null,
          // DX-C2: thread context — a task-triggered run's messages carry its task.
          taskId: ctx.taskId,
          subject: args.subject,
          body: args.body,
        });
        return textResult(
          JSON.stringify(
            { messageId: message.id, to: recipient?.name ?? "user inbox", spawnedRunId: message.spawnedRunId },
            null,
            2,
          ),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

export function currentProjectId(ctx: RunContext): string | null {
  if (!ctx.projectSlug) return null;
  return (
    getDb().select({ id: projects.id }).from(projects).where(eq(projects.slug, ctx.projectSlug)).get()
      ?.id ?? null
  );
}
