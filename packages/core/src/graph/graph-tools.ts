import { z, type ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EffectiveTools } from "@sparstrow/shared";
import type { RunContext } from "../memory/agent-memory.js";
import { logger } from "../logger.js";
import { GraphClientError, getGraphPool, type GraphClientPool } from "./graph-client.js";
import { getEngineStatus } from "./binary-manager.js";

/**
 * P5 §3 — the curated agent-facing graph tool surface (UC1: 7 read-only tools;
 * lifecycle tools stay core-internal; manage_adr/ingest_traces/search_code are
 * excluded — see the approved amendment).
 *
 * Names are upstream verbatim (models know them); descriptions are CORE-
 * AUTHORED and terse (audit #53 — upstream's query_graph description alone is
 * ~350 tokens and drifts on version bumps).
 *
 * Schema-strip (audit #44/DX-1): the exposed schemas carry NO project/repo
 * params — core injects the project server-side from RunContext, so an agent
 * cannot form a cross-project query at the schema level. A stray `project`
 * arg fails validation with a DX3 message instead of being silently rewritten
 * into a wrong belief.
 *
 * Spawn-pinned availability (audit #49, locked plan L929): whether a run has
 * graph tools is decided ONCE, at spawn, by gating the run's effective-tools
 * snapshot (applyGraphAvailabilityGate). Registration reads only the snapshot
 * — so a mid-run engine failure degrades via isError text, never a vanished
 * tool, and a mid-run install never surfaces tools the preamble didn't brief.
 */

export const GRAPH_TOOL_NAMES = [
  "search_graph",
  "trace_path",
  "query_graph",
  "get_graph_schema",
  "get_code_snippet",
  "get_architecture",
  "detect_changes",
] as const;
export type GraphToolName = (typeof GRAPH_TOOL_NAMES)[number];

/** The MCP-client-side spelling of a graph tool in CLI tool policies. */
export function mcpQualifiedName(name: string): string {
  return `mcp__sparstrow-memory__${name}`;
}

/** EffectiveTools semantics: empty allowed = unrestricted; disallow wins. Both spellings count. */
export function snapshotAllows(eff: EffectiveTools | null, name: string): boolean {
  if (!eff) return true;
  const spellings = [name, mcpQualifiedName(name)];
  if (spellings.some((s) => eff.disallowed.includes(s))) return false;
  if (eff.allowed.length === 0) return true;
  return spellings.some((s) => eff.allowed.includes(s));
}

/**
 * Run-spawn gate: when the engine isn't installed or the run has no project,
 * pin the graph tools OUT of the snapshot so surface, preamble, and P3
 * child-clamps all agree for the run's whole lifetime.
 */
export function applyGraphAvailabilityGate(
  eff: EffectiveTools,
  opts: { engineInstalled: boolean; hasProject: boolean },
): EffectiveTools {
  if (opts.engineInstalled && opts.hasProject) return eff;
  const missing = GRAPH_TOOL_NAMES.filter((n) => !eff.disallowed.includes(n));
  if (missing.length === 0) return eff;
  return { allowed: eff.allowed, disallowed: [...eff.disallowed, ...missing] };
}

/** Rejects an agent-supplied project param with a DX3 message instead of silently overriding. */
const strippedProjectParam = z
  .undefined({ invalid_type_error: "project is fixed server-side to this run's project — omit this parameter" })
  .optional();

const CAPS = {
  searchLimitDefault: 25,
  searchLimitMax: 50,
  queryMaxRowsDefault: 100,
  queryMaxRowsMax: 500,
  traceDepthDefault: 2,
  traceDepthMax: 5,
  /** ~6k tokens; oversized results truncate with a DX3 marker (audit #9). */
  resultChars: 24_000,
} as const;

interface GraphToolSpec {
  name: GraphToolName;
  description: string;
  params: ZodRawShape;
  /** Injects native caps/defaults (spike ⑤) — the engine bounds the result before stdio transit. */
  withDefaults(args: Record<string, unknown>): Record<string, unknown>;
}

const clampNum = (v: unknown, def: number, max: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : def;
  return Math.max(1, Math.min(n, max));
};

export const GRAPH_TOOL_SPECS: GraphToolSpec[] = [
  {
    name: "search_graph",
    description:
      "Find symbols/nodes in this project's code graph by name, qualified-name, or file pattern (optionally by label or relationship). Start here to locate a symbol; results carry the qualified_name other graph tools take.",
    params: {
      query: z.string().optional().describe("Free-text search"),
      name_pattern: z.string().optional().describe("Symbol name pattern"),
      qn_pattern: z.string().optional().describe("Qualified-name pattern"),
      file_pattern: z.string().optional().describe("File path pattern"),
      label: z.string().optional().describe("Node label, e.g. Function, Class, Route"),
      relationship: z.string().optional().describe("Edge type filter, e.g. CALLS, IMPORTS"),
      semantic_query: z.string().optional().describe("Semantic similarity search"),
      limit: z.number().int().min(1).max(CAPS.searchLimitMax).optional().describe(`Max results (default ${CAPS.searchLimitDefault})`),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
      project: strippedProjectParam,
    },
    withDefaults: (args) => ({ ...args, limit: clampNum(args.limit, CAPS.searchLimitDefault, CAPS.searchLimitMax) }),
  },
  {
    name: "trace_path",
    description:
      "Who calls a function / what it calls — traversal over CALLS edges. Pass the qualified_name from search_graph. Use for 'what breaks if I change X' questions.",
    params: {
      function_name: z.string().describe("Function name or qualified_name (prefer qualified)"),
      direction: z.enum(["callers", "callees", "both"]).optional().describe("Default callers"),
      depth: z.number().int().min(1).max(CAPS.traceDepthMax).optional().describe(`Hops (default ${CAPS.traceDepthDefault})`),
      project: strippedProjectParam,
    },
    withDefaults: (args) => ({ ...args, depth: clampNum(args.depth, CAPS.traceDepthDefault, CAPS.traceDepthMax) }),
  },
  {
    name: "query_graph",
    description:
      "Read-only Cypher over the code graph for multi-hop or aggregate questions. Call get_graph_schema once first. Function nodes carry complexity properties (complexity, transitive_loop_depth, linear_scan_in_loop, …). Example: MATCH (a)-[:CALLS]->(f:Function) WHERE f.name = 'agentMemorySave' RETURN a.qualified_name LIMIT 10",
    params: {
      query: z.string().describe("Cypher query (add LIMIT for broad matches)"),
      max_rows: z.number().int().min(1).max(CAPS.queryMaxRowsMax).optional().describe(`Row cap (default ${CAPS.queryMaxRowsDefault})`),
      project: strippedProjectParam,
    },
    withDefaults: (args) => ({ ...args, max_rows: clampNum(args.max_rows, CAPS.queryMaxRowsDefault, CAPS.queryMaxRowsMax) }),
  },
  {
    name: "get_graph_schema",
    description: "Node labels, edge types, and property names in this project's graph — call once before your first query_graph.",
    params: { project: strippedProjectParam },
    withDefaults: (args) => args,
  },
  {
    name: "get_code_snippet",
    description: "Exact source of a symbol by qualified_name (from search_graph / trace_path results), with lines and complexity data.",
    params: {
      qualified_name: z.string().describe("Fully qualified symbol name"),
      include_neighbors: z.boolean().optional().describe("Also return direct callers/callees"),
      project: strippedProjectParam,
    },
    withDefaults: (args) => args,
  },
  {
    name: "get_architecture",
    description:
      "Project orientation: languages, packages, hotspots, routes, clusters. Request ONLY the aspects you need — the full dump is very large. Use once per run at most.",
    params: {
      aspects: z
        .array(z.string())
        .optional()
        .describe('Subset to return, e.g. ["languages","packages","hotspots"] (default). Others: routes, entry_points, clusters, file_tree'),
      project: strippedProjectParam,
    },
    withDefaults: (args) => ({ ...args, aspects: args.aspects ?? ["languages", "packages", "hotspots"] }),
  },
  {
    name: "detect_changes",
    description:
      "Map the current git diff to affected symbols with risk classification — 'what does this change touch'. Optionally diff against a base branch or a timestamp.",
    params: {
      scope: z.string().optional().describe("Restrict to a path prefix"),
      depth: z.number().int().min(1).max(CAPS.traceDepthMax).optional().describe("Impact hops (default 2)"),
      base_branch: z.string().optional().describe("Diff base (default: working tree vs HEAD)"),
      since: z.string().optional().describe("ISO timestamp alternative to base_branch"),
      project: strippedProjectParam,
    },
    withDefaults: (args) => ({ ...args, depth: clampNum(args.depth, CAPS.traceDepthDefault, CAPS.traceDepthMax) }),
  },
];

/** DX3 strings: every failure names the fallback the agent should take THIS run. */
function dx3(kind: GraphClientError["kind"] | "no-index", detail?: string): string {
  switch (kind) {
    case "engine-missing":
      return "graph engine is not installed — proceed with file search (Grep/Read); the owner can install it in Settings.";
    case "engine-degraded":
      return `graph engine for this project is degraded — proceed with file search (Grep/Read); the owner can retry from Settings.${detail ? ` (${detail})` : ""}`;
    case "timeout":
      return "graph query timed out — try a narrower query (limit / name_pattern), or proceed with file search; do not poll.";
    case "engine-crashed":
      return "graph engine crashed during the call — proceed with file search this run; it restarts on a later call.";
    case "no-index":
      return "graph index for this project is still building or not built yet — answer structure questions with Grep/Read this run; do not poll. It will be ready on a later run.";
    default:
      return `graph call failed — proceed with file search this run.${detail ? ` (${detail})` : ""}`;
  }
}

interface ToolText {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}
const text = (t: string, isError = false): ToolText => ({ content: [{ type: "text", text: t }], isError });

/**
 * The engine derives its internal project name from the indexed repo path;
 * with one store per project there is exactly one. Resolved via the core-
 * internal list_projects call and cached (stable per store).
 */
const engineProjectNames = new Map<string, string>();
export async function resolveEngineProject(pool: GraphClientPool, projectId: string): Promise<string | null> {
  const cached = engineProjectNames.get(projectId);
  if (cached) return cached;
  const res = await pool.callTool(projectId, "list_projects", {});
  const raw = (res.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text ?? "{}";
  let name: string | null = null;
  try {
    const parsed = JSON.parse(raw) as { projects?: { name?: string }[] };
    name = parsed.projects?.[0]?.name ?? null;
  } catch {
    name = null;
  }
  if (name) engineProjectNames.set(projectId, name);
  return name;
}
/** Test/lifecycle seam: a reindex or store wipe invalidates the cached name. */
export function forgetEngineProject(projectId: string): void {
  engineProjectNames.delete(projectId);
}

async function forward(
  pool: GraphClientPool,
  ctx: RunContext,
  spec: GraphToolSpec,
  args: Record<string, unknown>,
): Promise<ToolText> {
  const projectId = ctx.projectId;
  if (!projectId) return text(dx3("call-failed", "run has no project"), true);
  try {
    const engineProject = await resolveEngineProject(pool, projectId);
    if (!engineProject) return text(dx3("no-index"), true);
    const { project: _stripped, ...rest } = args;
    const result = await pool.callTool(projectId, spec.name, {
      ...spec.withDefaults(rest),
      project: engineProject,
    });
    let out = (result.content as { type: string; text?: string }[])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    if (out.length > CAPS.resultChars) {
      out =
        out.slice(0, CAPS.resultChars) +
        `\n[truncated at ${CAPS.resultChars} chars — narrow the query (limit / name_pattern / aspects) or paginate with offset]`;
    }
    return { content: [{ type: "text", text: out }], isError: result.isError === true };
  } catch (err) {
    if (err instanceof GraphClientError) {
      logger.debug({ tool: spec.name, projectId, kind: err.kind }, "graph tool degraded");
      return text(dx3(err.kind, err.message), true);
    }
    return text(dx3("call-failed", err instanceof Error ? err.message : String(err)), true);
  }
}

/**
 * extraToolRegistrars entry. Registration is decided ONLY by the spawn-pinned
 * snapshot + project presence — never by live engine state (see module doc).
 */
export function registerGraphTools(server: McpServer, ctx: RunContext, pool: GraphClientPool = getGraphPool()): void {
  if (!ctx.projectId) return;
  for (const spec of GRAPH_TOOL_SPECS) {
    if (!snapshotAllows(ctx.effectiveTools, spec.name)) continue;
    server.tool(spec.name, spec.description, spec.params, (args: Record<string, unknown>) =>
      forward(pool, ctx, spec, args),
    );
  }
}

/** Registrar with the singleton pool — what index.ts pushes into extraToolRegistrars. */
export function graphToolRegistrar(server: McpServer, ctx: RunContext): void {
  registerGraphTools(server, ctx, getGraphPool());
}

/** Convenience for run-manager's spawn-time gate. */
export function graphEngineInstalled(): boolean {
  return getEngineStatus().installed;
}
