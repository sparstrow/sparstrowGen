import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import type { RunContext } from "../memory/agent-memory.js";
import { blockTaskWithQuestions } from "../taskboard/questions.js";

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

export type CapabilityIntent = "do-work" | "delegate" | "escalate" | "remember" | "look-up";

export interface ToolTextResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  // MCP's CallToolResult carries an index signature; mirror it so handlers are
  // assignable to server.tool without a cast.
  [key: string]: unknown;
}

export interface AgentCapability {
  name: string;
  intent: CapabilityIntent;
  /** One-line WHEN, shown in the preamble tools-by-intent list. */
  whenToUse: string;
  description: string;
  /** Present when the registry owns the MCP handler. */
  params?: ZodRawShape;
  handler?: (args: Record<string, unknown>, ctx: RunContext) => Promise<ToolTextResult> | ToolTextResult;
  /** True when the handler lives in a legacy module (docs-only entry for now). */
  declaredElsewhere?: boolean;
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
  // ── escalate ──────────────────────────────────────────────────────────────
  {
    name: "task_block",
    intent: "escalate",
    whenToUse: "You are stuck and only a human can unblock you (a missing decision, credentials, or an ambiguous requirement).",
    description:
      "Declare a dead end on a task you own. Records your question(s) for the human, saves your partial progress, and ends your run — you will be re-run with the answer. Ask SPECIFIC, one-line-answerable questions with options where possible.",
    params: {
      taskId: z.string().describe("The task you are blocked on"),
      questions: z.array(taskBlockQuestionShape).min(1),
      progressNote: z.string().optional().describe("What you completed before blocking — shown to the human and to your next run"),
    },
    handler: (args, ctx) => {
      try {
        const { task, questions } = blockTaskWithQuestions({
          taskId: String(args.taskId),
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
    name: "message_send",
    intent: "escalate",
    whenToUse: "Your lead or a peer can likely answer — ask them before escalating to a human.",
    description: "Send a message to the user's inbox or another agent by name.",
    declaredElsewhere: true,
  },
  // ── delegate ──────────────────────────────────────────────────────────────
  {
    name: "task_create",
    intent: "delegate",
    whenToUse: "Fire-and-forget hand-off; use spawn_subtask (P3) if you need the result back, to wait, or to stay accountable.",
    description: "Create a task on the shared board, optionally handing it to another agent.",
    declaredElsewhere: true,
  },
  // ── do-work ───────────────────────────────────────────────────────────────
  {
    name: "task_update",
    intent: "do-work",
    whenToUse: "Report your own task's status — done, failed (work itself impossible, not a question), or in_progress.",
    description: "Update a task you created or were assigned: set status and/or a result summary.",
    declaredElsewhere: true,
  },
  // ── remember ──────────────────────────────────────────────────────────────
  {
    name: "memory_save",
    intent: "remember",
    whenToUse: "You learned something durable worth keeping across runs. One topic per note.",
    description: "Save a markdown memory note into your allowed scope.",
    declaredElsewhere: true,
  },
  // ── look-up ───────────────────────────────────────────────────────────────
  {
    name: "memory_search",
    intent: "look-up",
    whenToUse: "You need knowledge you don't have in context — search before guessing.",
    description: "Search your long-term memory (semantic + keyword) over your allowed scopes.",
    declaredElsewhere: true,
  },
];

/** Register every registry-owned capability into an MCP server for one run. */
export function registerCapabilities(server: McpServer, ctx: RunContext): void {
  for (const cap of AGENT_CAPABILITIES) {
    if (!cap.handler || !cap.params) continue;
    server.tool(cap.name, cap.description, cap.params, (args: Record<string, unknown>) =>
      cap.handler!(args, ctx),
    );
  }
}

const INTENT_ORDER: CapabilityIntent[] = ["do-work", "delegate", "escalate", "remember", "look-up"];
const INTENT_LABEL: Record<CapabilityIntent, string> = {
  "do-work": "Do the work",
  delegate: "Delegate",
  escalate: "Escalate",
  remember: "Remember",
  "look-up": "Look up",
};

/**
 * The preamble "tools by intent" section (DX2/DX-H2). Optionally filter to the
 * names an agent actually has; default renders the full registry. Ends with the
 * escalation ladder so a fresh agent knows message_send→lead vs task_block→human
 * vs task_update(failed)→impossible-work.
 */
export function renderCapabilityDocs(available?: string[]): string {
  const caps = available
    ? AGENT_CAPABILITIES.filter((c) => available.includes(c.name))
    : AGENT_CAPABILITIES;
  const lines: string[] = ["## Your tools, by intent"];
  for (const intent of INTENT_ORDER) {
    const group = caps.filter((c) => c.intent === intent);
    if (group.length === 0) continue;
    lines.push(`**${INTENT_LABEL[intent]}**`);
    for (const c of group) lines.push(`- \`${c.name}\` — ${c.whenToUse}`);
  }
  lines.push(
    "",
    "Escalation ladder when you can't proceed: ask your lead via `message_send` first (a peer can often answer); use `task_block` only when a human must decide (missing decision, credentials, ambiguous requirement); use `task_update(failed)` when the work itself is impossible, not when you have a question.",
  );
  return lines.join("\n");
}
