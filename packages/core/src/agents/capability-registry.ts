import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import type { EffectiveTools } from "@sparstrow/shared";
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

// ── P8: the SAME registry drives the direct-API tool-loop (rule 20) ──
//
// The MCP surface (Claude Code CLI) and the native-tool-schema surface (direct-
// API) both derive from AGENT_CAPABILITIES: registerCapabilities feeds MCP;
// nativeToolSchemas + dispatchCapability feed the in-process loop. A capability
// added once is available on both — divergence is impossible, which is the whole
// point of a single registry.

/** JSON Schema object shape a provider embeds as a tool's `input_schema`. */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: readonly string[];
  description?: string;
  additionalProperties?: boolean;
}

/** One tool the direct-API loop advertises to a provider (provider-neutral). */
export interface NativeToolSchema {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/**
 * Convert one zod field into JSON Schema. Purpose-built for the shapes the
 * registry actually uses (string/number/boolean/array/object/enum + optional/
 * default/nullable wrappers), with a parity test guarding it. A dependency-free
 * converter keeps the trust boundary small — no third-party schema emitter walks
 * agent-facing tool definitions.
 */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName?: string; description?: string };
  const describe = (js: JsonSchema): JsonSchema => {
    const d = schema.description ?? def.description;
    return d ? { ...js, description: d } : js;
  };
  switch (def.typeName) {
    case "ZodString":
      return describe({ type: "string" });
    case "ZodNumber": {
      const checks = (def as { checks?: { kind: string }[] }).checks ?? [];
      return describe({ type: checks.some((c) => c.kind === "int") ? "integer" : "number" });
    }
    case "ZodBoolean":
      return describe({ type: "boolean" });
    case "ZodEnum":
      return describe({ type: "string", enum: (def as { values: string[] }).values });
    case "ZodArray":
      return describe({ type: "array", items: zodToJsonSchema((def as { type: ZodTypeAny }).type) });
    case "ZodObject": {
      const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
      return describe(objectSchema(shape));
    }
    case "ZodOptional":
    case "ZodNullable":
    case "ZodDefault": {
      const inner = zodToJsonSchema((def as { innerType: ZodTypeAny }).innerType);
      const d = schema.description ?? def.description;
      return d && !inner.description ? { ...inner, description: d } : inner;
    }
    default:
      // Unknown wrapper — degrade to a permissive object rather than throwing so a
      // future capability never crashes the whole tool surface.
      return describe({ type: "object" });
  }
}

function objectSchema(shape: ZodRawShape): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    const f = field as ZodTypeAny;
    properties[key] = zodToJsonSchema(f);
    const tn = (f._def as { typeName?: string }).typeName;
    if (tn !== "ZodOptional" && tn !== "ZodDefault") required.push(key);
  }
  const js: JsonSchema = { type: "object", properties, additionalProperties: false };
  if (required.length > 0) js.required = required;
  return js;
}

/** True when a capability is permitted under a run's effective-tools snapshot. */
function capabilityAllowed(name: string, effective: EffectiveTools | null): boolean {
  if (!effective) return true;
  if (effective.disallowed.includes(name)) return false; // deny-wins (P2)
  // Empty allow-list ⇒ inherit the provider default (all registry tools). A non-
  // empty list restricts to explicitly-granted names.
  return effective.allowed.length === 0 || effective.allowed.includes(name);
}

/**
 * The native tool schemas a direct-API agent gets — the registry-owned
 * capabilities, filtered by the run's immutable effective-tools snapshot so the
 * P2/P3 clamps apply identically to CLI runs (EH5). This is the direct-API mirror
 * of the CLI's MCP tool list.
 */
export function nativeToolSchemas(effective: EffectiveTools | null): NativeToolSchema[] {
  return AGENT_CAPABILITIES.filter((c) => capabilityAllowed(c.name, effective)).map((c) => ({
    name: c.name,
    description: c.description,
    inputSchema: objectSchema(c.params),
  }));
}

/**
 * Dispatch one native tool call in-process (no MCP transport). Unknown or
 * clamped-away tools return an isError result the loop feeds back to the model,
 * exactly like the MCP surface degrades — never a hard throw the agent can't see.
 */
export async function dispatchCapability(
  name: string,
  args: Record<string, unknown>,
  ctx: RunContext,
  effective: EffectiveTools | null = ctx.effectiveTools,
): Promise<ToolTextResult> {
  const cap = AGENT_CAPABILITIES.find((c) => c.name === name);
  if (!cap) return errorResult(new Error(`unknown tool: ${name}`));
  if (!capabilityAllowed(name, effective)) {
    return errorResult(new Error(`tool not permitted for this run: ${name}`));
  }
  try {
    const parsed = z.object(cap.params).parse(args);
    return await cap.handler(parsed as Record<string, unknown>, ctx);
  } catch (err) {
    return errorResult(err);
  }
}

/** Flatten a ToolTextResult into the plain string a tool_result block carries. */
export function toolResultText(result: ToolTextResult): string {
  return result.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
