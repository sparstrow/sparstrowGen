import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import type { RunContext } from "../memory/agent-memory.js";
import { blockTaskWithQuestions } from "../taskboard/questions.js";
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
