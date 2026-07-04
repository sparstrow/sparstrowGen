import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import type { RunContext } from "../memory/agent-memory.js";
import { blockTaskWithQuestions } from "../taskboard/questions.js";
import { spawnSubtask } from "../taskboard/delegation.js";
import { resolveAgentRef } from "../taskboard/service.js";
import { currentProjectId } from "../taskboard/agent-tools.js";
export { renderCapabilityDocs } from "./capability-docs.js";

/**
 * The capability registry (cross-cutting rule 20 / DX-C3): ONE source for every
 * agent-facing tool. It drives the MCP tool surface (Claude Code CLI) and the
 * preamble "tools by intent" docs; when the direct-API tool-loop lands (P8) it
 * also emits native tool schemas from these same entries. A capability missing
 * from a required surface is a build error — the surfaces cannot drift, and the
 * retired Gemini-CLI fenced-directive grammar is gone (§0.1).
 *
 * Entries with a `handler` are registry-OWNED (registered into MCP here). Entries
 * marked `declaredElsewhere` keep their handler in legacy modules for now (agent-
 * tools.ts / http-mcp.ts) and contribute only their docs; later phases migrate
 * those handlers in. task_block is the first fully-owned capability.
 */

export interface ToolTextResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  // MCP's CallToolResult carries an index signature; mirror it so handlers are
  // assignable to server.tool without a cast.
  [key: string]: unknown;
}

/**
 * A registry-OWNED capability: the registry provides its MCP handler. Its docs
 * (intent + when-to-use) live in CAPABILITY_DOCS (capability-docs.ts) so the
 * preamble/native-schema surfaces stay decoupled from the handler code. A test
 * asserts every owned capability is documented — the single source can't drift.
 */
export interface AgentCapability {
  name: string;
  description: string;
  params: ZodRawShape;
  handler: (args: Record<string, unknown>, ctx: RunContext) => Promise<ToolTextResult> | ToolTextResult;
}

function textResult(text: string): ToolTextResult {
  return { content: [{ type: "text", text }] };
}
function errorResult(err: unknown): ToolTextResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

const taskBlockQuestionShape = z.object({
  question: z.string().describe("A specific, one-line-answerable question. Prefer yes/no or multiple-choice."),
  whyBlocked: z.string().optional().describe("One line on what you tried and why you're stuck"),
  options: z.array(z.string()).min(1).optional().describe("Concrete choices the human can pick in one click"),
  recommendation: z.string().optional().describe("Your recommended option, if you have one"),
  defaultIfNoAnswer: z.string().optional().describe("What you'll assume if the human doesn't answer"),
});

export const AGENT_CAPABILITIES: AgentCapability[] = [
  {
    name: "task_block",
    description:
      "Declare a dead end on a task you own. Records your question(s) for the human, saves your partial progress, and ends your run — you will be re-run with the answer. Ask SPECIFIC, one-line-answerable questions with options where possible.",
    params: {
      taskId: z.string().optional().describe("The task you are blocked on (defaults to your current task)"),
      questions: z.array(taskBlockQuestionShape).min(1),
      progressNote: z.string().optional().describe("What you completed before blocking — shown to the human and to your next run"),
    },
    handler: (args, ctx) => {
      try {
        // DX-C2: auto-scope to the run's task when the agent omits taskId.
        const taskId = (args.taskId as string | undefined) ?? ctx.taskId;
        if (!taskId) {
          return errorResult(new Error("no taskId — you are not running a task; pass taskId explicitly"));
        }
        const { task, questions } = blockTaskWithQuestions({
          taskId,
          agentId: ctx.agent.id,
          runId: ctx.runId,
          // zod on the MCP boundary has already validated the shape.
          questions: args.questions as never,
          progressNote: (args.progressNote as string | undefined) ?? null,
        });
        return textResult(
          JSON.stringify(
            {
              outcome: "blocked",
              taskId: task?.id,
              questionsRaised: questions.length,
              whatToDoNext: "Stop now. You will be re-run once the human answers.",
            },
            null,
            2,
          ),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  },
  {
    name: "spawn_subtask",
    description:
      "Delegate part of YOUR current task to another agent and suspend until it finishes (delegate-and-wait). Your task moves to waiting_children; end your run after spawning — you will be re-run with every subtask's result. Same-team agents start immediately; agents outside your teams need the owner's approval first. The subtask can never use tools you can't (least-privilege). For fire-and-forget hand-offs with no result back, use task_create instead.",
    params: {
      title: z.string().describe("Short subtask title"),
      description: z
        .string()
        .describe(
          "Complete work brief for the subtask — the assignee has NO other context. Include the goal, constraints, and what a good result looks like.",
        ),
      assignToAgent: z.string().describe("Agent name or slug to delegate to"),
      priority: z.number().int().min(0).max(3).optional().describe("0=low 3=urgent (default 1)"),
    },
    handler: (args, ctx) => {
      try {
        if (!ctx.taskId) {
          return errorResult(
            new Error(
              "spawn_subtask requires a task context (you are not running a task). Use task_create to hand off work fire-and-forget.",
            ),
          );
        }
        const assignee = resolveAgentRef(args.assignToAgent as string);
        const result = spawnSubtask({
          callerAgentId: ctx.agent.id,
          callerAgentName: ctx.agent.name,
          callerRunId: ctx.runId,
          parentTaskId: ctx.taskId,
          title: args.title as string,
          description: args.description as string,
          assigneeId: assignee.id,
          assigneeName: assignee.name,
          projectId: currentProjectId(ctx),
          priority: (args.priority as number | undefined) ?? 1,
        });
        return textResult(JSON.stringify(result, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  },
];

/** Register every registry-owned capability into an MCP server for one run. */
export function registerCapabilities(server: McpServer, ctx: RunContext): void {
  for (const cap of AGENT_CAPABILITIES) {
    server.tool(cap.name, cap.description, cap.params, (args: Record<string, unknown>) =>
      cap.handler(args, ctx),
    );
  }
}

/** Names of the tools the registry owns the handler for — cross-checked vs docs. */
export const OWNED_CAPABILITY_NAMES = AGENT_CAPABILITIES.map((c) => c.name);
