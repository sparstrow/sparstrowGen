import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Agent, EffectiveTools } from "@sparstrow/shared";
import type { RunContext } from "../memory/agent-memory.js";
import { GraphClientPool } from "./graph-client.js";
import {
  GRAPH_TOOL_NAMES,
  GRAPH_TOOL_SPECS,
  applyGraphAvailabilityGate,
  forgetEngineProject,
  mcpQualifiedName,
  registerGraphTools,
  snapshotAllows,
} from "./graph-tools.js";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-engine.fixture.mjs");

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function stubServer() {
  const tools = new Map<string, Handler>();
  const server = {
    tool: (name: string, _desc: string, _params: unknown, handler: Handler) => {
      tools.set(name, handler);
    },
  } as unknown as McpServer;
  return { server, tools };
}

function ctxWith(over: Partial<RunContext> = {}): RunContext {
  return {
    runId: "run_1",
    agent: { id: "agt_1", slug: "coder", name: "Coder" } as unknown as Agent,
    projectId: "proj-x",
    projectSlug: "proj-x",
    isSandbox: false,
    taskId: null,
    parentTaskId: null,
    teamId: null,
    delegatedByAgentName: null,
    delegationDepth: 0,
    effectiveTools: null,
    ...over,
  };
}

function poolFor(base: string, mode: string): GraphClientPool {
  return new GraphClientPool({
    baseDir: base,
    engineResolver: () => ({ command: process.execPath, args: [FIXTURE, mode] }),
    storeBaseline: async () => ({ ok: true, detail: null }),
    idleSweep: false,
    connectTimeoutMs: 5_000,
    requestTimeoutMs: 3_000,
  });
}

describe("spawn-pinned availability (audit #39/#49)", () => {
  it("snapshotAllows: disallow wins in either spelling; empty allowed = unrestricted", () => {
    expect(snapshotAllows(null, "search_graph")).toBe(true);
    const eff: EffectiveTools = { allowed: [], disallowed: ["trace_path"] };
    expect(snapshotAllows(eff, "trace_path")).toBe(false);
    expect(snapshotAllows(eff, "search_graph")).toBe(true);
    const effMcp: EffectiveTools = { allowed: [], disallowed: [mcpQualifiedName("query_graph")] };
    expect(snapshotAllows(effMcp, "query_graph")).toBe(false);
    const effAllow: EffectiveTools = { allowed: [mcpQualifiedName("search_graph")], disallowed: [] };
    expect(snapshotAllows(effAllow, "search_graph")).toBe(true);
    expect(snapshotAllows(effAllow, "trace_path")).toBe(false);
  });

  it("gate pins graph tools OUT when the engine is missing or the run is projectless", () => {
    const eff: EffectiveTools = { allowed: [], disallowed: ["Bash"] };
    const untouched = applyGraphAvailabilityGate(eff, { engineInstalled: true, hasProject: true });
    expect(untouched).toBe(eff);
    const gated = applyGraphAvailabilityGate(eff, { engineInstalled: false, hasProject: true });
    for (const n of GRAPH_TOOL_NAMES) expect(gated.disallowed).toContain(n);
    expect(gated.disallowed).toContain("Bash");
    // Idempotent — no duplicate entries when gated twice.
    const twice = applyGraphAvailabilityGate(gated, { engineInstalled: false, hasProject: false });
    expect(twice.disallowed.filter((t) => t === "search_graph")).toHaveLength(1);
  });

  it("registers 7 tools for an allowed project run; 0 projectless; snapshot-disallowed tools absent", () => {
    const all = stubServer();
    registerGraphTools(all.server, ctxWith(), null as never); // pool untouched at registration
    expect([...all.tools.keys()].sort()).toEqual([...GRAPH_TOOL_NAMES].sort());

    const none = stubServer();
    registerGraphTools(none.server, ctxWith({ projectId: null }), null as never);
    expect(none.tools.size).toBe(0);

    const partial = stubServer();
    registerGraphTools(
      partial.server,
      ctxWith({ effectiveTools: { allowed: [], disallowed: [mcpQualifiedName("trace_path")] } }),
      null as never,
    );
    expect(partial.tools.has("trace_path")).toBe(false);
    expect(partial.tools.size).toBe(GRAPH_TOOL_NAMES.length - 1);
  });

  it("stray agent-supplied project param fails validation with the DX3 omit message", () => {
    const spec = GRAPH_TOOL_SPECS.find((s) => s.name === "search_graph")!;
    const parsed = z.object(spec.params).safeParse({ query: "x", project: "other-project" });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/fixed server-side/);
  });
});

describe("graph tool forwarding (P5 §3)", () => {
  let base: string;
  let pools: GraphClientPool[];

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-tools-"));
    pools = [];
    forgetEngineProject("proj-x");
  });
  afterEach(async () => {
    await Promise.all(pools.map((p) => p.shutdown()));
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    forgetEngineProject("proj-x");
  });

  async function handlerFor(name: string, mode: string, over: Partial<RunContext> = {}) {
    const pool = poolFor(base, mode);
    pools.push(pool);
    const { server, tools } = stubServer();
    registerGraphTools(server, ctxWith(over), pool);
    const h = tools.get(name);
    expect(h, `${name} registered`).toBeTruthy();
    return h!;
  }

  it("injects the engine project server-side and applies native caps/defaults", async () => {
    const h = await handlerFor("search_graph", "echo");
    const res = await h({ name_pattern: "foo" });
    const echoed = JSON.parse(res.content[0]!.text) as { args: Record<string, unknown> };
    expect(echoed.args.project).toBe("fixture-project"); // injected from list_projects, not agent input
    expect(echoed.args.limit).toBe(25); // default injected (spike ⑤)
    expect(echoed.args.name_pattern).toBe("foo");

    const clamped = await h({ limit: 500 });
    expect((JSON.parse(clamped.content[0]!.text) as { args: { limit: number } }).args.limit).toBe(50);
  });

  it("truncates oversized results with the DX3 marker (audit #9)", async () => {
    const h = await handlerFor("search_graph", "echo");
    const res = await h({ big: true });
    expect(res.content[0]!.text.length).toBeLessThan(100_000);
    expect(res.content[0]!.text).toMatch(/truncated at 24000 chars — narrow the query/);
  });

  it("engine missing → DX3 isError naming the fallback, tool stays registered (L929)", async () => {
    const pool = new GraphClientPool({ baseDir: base, engineResolver: () => null, idleSweep: false });
    pools.push(pool);
    const { server, tools } = stubServer();
    registerGraphTools(server, ctxWith(), pool);
    expect(tools.size).toBe(GRAPH_TOOL_NAMES.length); // registration is snapshot-driven, not live-state-driven
    const res = await tools.get("get_graph_schema")!({});
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/not installed/);
    expect(res.content[0]!.text).toMatch(/Grep\/Read|file search/);
    expect(res.content[0]!.text).toMatch(/Settings/);
  });

  it("store with no index yet → 'still building' DX3 with anti-poll instruction", async () => {
    const h = await handlerFor("query_graph", "empty");
    const res = await h({ query: "MATCH (n) RETURN n" });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/still building or not built yet/);
    expect(res.content[0]!.text).toMatch(/do not poll/);
  });

  it("query_graph and get_architecture defaults: max_rows and small aspects", async () => {
    const hq = await handlerFor("query_graph", "echo");
    const rq = await hq({ query: "MATCH (n) RETURN n" });
    expect((JSON.parse(rq.content[0]!.text) as { args: { max_rows: number } }).args.max_rows).toBe(100);

    forgetEngineProject("proj-x");
    const ha = await handlerFor("get_architecture", "echo");
    const ra = await ha({});
    expect((JSON.parse(ra.content[0]!.text) as { args: { aspects: string[] } }).args.aspects).toEqual([
      "languages",
      "packages",
      "hotspots",
    ]);
  });
});
