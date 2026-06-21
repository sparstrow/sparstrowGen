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
    "Create a task on the shared task board, optionally handing it to another agent. The orchestrator runs the assignee with your description — include everything they need, they have no other context.",
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
        const message = createMessage({
          fromType: "agent",
          fromAgentId: ctx.agent.id,
          toAgentId: recipient?.id ?? null,
          projectId: ctx.projectSlug ? currentProjectId(ctx) : null,
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

function currentProjectId(ctx: RunContext): string | null {
  if (!ctx.projectSlug) return null;
  return (
    getDb().select({ id: projects.id }).from(projects).where(eq(projects.slug, ctx.projectSlug)).get()
      ?.id ?? null
  );
}
