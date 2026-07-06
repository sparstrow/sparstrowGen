import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Agent } from "@sparstrow/shared";
import type { RunContext } from "../memory/agent-memory.js";
import { GraphClientPool, defaultStoreBaseline, projectStoreDir } from "./graph-client.js";
import { GRAPH_TOOL_NAMES, forgetEngineProject, registerGraphTools } from "./graph-tools.js";

/**
 * P5 §3 LEAKAGE PROOF (audit #16) — the sandbox boundary must not rest on the
 * vendor's project-param filtering. Runs against the REAL engine binary, so it
 * is opt-in: set SPARSTROW_GRAPH_E2E=1 and SPARSTROW_GRAPH_ENGINE_EXE=<exe>.
 * Never runs in CI (36 MB binary download); run it locally before shipping
 * engine-version bumps.
 *
 * Proof shape: two owner projects + one sandbox, each with a UNIQUE canary
 * symbol, indexed into three separate per-project stores. Every one of the 7
 * agent-facing tools, executed as project A, must never return canaries from
 * project B or the sandbox — and vice versa.
 */

const EXE = process.env.SPARSTROW_GRAPH_ENGINE_EXE;
const ENABLED = process.env.SPARSTROW_GRAPH_E2E === "1" && !!EXE && fs.existsSync(EXE);

const CANARY = {
  projA: "canaryAlphaUniqueFnZq1",
  projB: "canaryBravoUniqueFnZq2",
  sandbox: "canarySandboxHostileFnZq3",
} as const;

function writeRepo(dir: string, canaryFn: string): void {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src", "main.ts"),
    `export function ${canaryFn}(x: number): number {\n  return helper_${canaryFn}(x) + 1;\n}\nfunction helper_${canaryFn}(x: number): number {\n  return x * 2;\n}\n`,
  );
}

function ctxFor(projectId: string): RunContext {
  return {
    runId: `run_${projectId}`,
    agent: { id: "agt_1", slug: "coder", name: "Coder" } as unknown as Agent,
    projectId,
    projectSlug: projectId,
    isSandbox: projectId === "sandbox-s",
    taskId: null,
    parentTaskId: null,
    teamId: null,
    delegatedByAgentName: null,
    delegationDepth: 0,
    effectiveTools: null,
  };
}

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

describe.skipIf(!ENABLED)("REAL-ENGINE leakage proof: 2 projects + 1 sandbox, all 7 tools (audit #16)", () => {
  let base: string;
  let repos: string;
  let pool: GraphClientPool;
  const toolsByProject = new Map<string, Map<string, Handler>>();

  beforeAll(async () => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-e2e-"));
    repos = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-repos-"));
    const layout: [string, string][] = [
      ["proj-a", CANARY.projA],
      ["proj-b", CANARY.projB],
      ["sandbox-s", CANARY.sandbox],
    ];
    pool = new GraphClientPool({
      baseDir: base,
      engineResolver: () => ({ command: EXE!, args: [] }),
      storeBaseline: defaultStoreBaseline, // the REAL baseline — asserts auto_watch off per store
      idleSweep: false,
      connectTimeoutMs: 120_000,
      requestTimeoutMs: 30_000,
    });
    for (const [projectId, canary] of layout) {
      const repo = path.join(repos, projectId);
      writeRepo(repo, canary);
      forgetEngineProject(projectId);
      // Index through the pool exactly as lifecycle hooks will (core-internal call).
      const res = await pool.callTool(
        projectId,
        "index_repository",
        { repo_path: repo.replaceAll("\\", "/") },
        { timeoutMs: 120_000 },
      );
      expect(res.isError ?? false).toBe(false);
      const { server, tools } = (() => {
        const t = new Map<string, Handler>();
        const s = { tool: (n: string, _d: string, _p: unknown, h: Handler) => t.set(n, h) } as unknown as McpServer;
        return { server: s, tools: t };
      })();
      registerGraphTools(server, ctxFor(projectId), pool);
      toolsByProject.set(projectId, tools);
    }
  }, 300_000);

  afterAll(async () => {
    await pool?.shutdown();
    for (const [projectId] of toolsByProject) forgetEngineProject(projectId);
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.rmSync(repos, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  async function allToolOutput(projectId: string): Promise<string> {
    const tools = toolsByProject.get(projectId)!;
    const canary = projectId === "proj-a" ? CANARY.projA : projectId === "proj-b" ? CANARY.projB : CANARY.sandbox;
    const calls: [string, Record<string, unknown>][] = [
      ["search_graph", { name_pattern: "canary" }],
      ["search_graph", { query: "canary unique fn" }],
      ["trace_path", { function_name: canary, direction: "callees" }],
      ["query_graph", { query: "MATCH (f:Function) RETURN f.qualified_name" }],
      ["get_graph_schema", {}],
      ["get_code_snippet", { qualified_name: canary }],
      ["get_architecture", { aspects: ["languages", "packages", "hotspots", "entry_points", "file_tree"] }],
      ["detect_changes", {}],
    ];
    let out = "";
    for (const [name, args] of calls) {
      expect(GRAPH_TOOL_NAMES).toContain(name);
      const res = await tools.get(name)!(args);
      out += `\n--- ${name} ---\n${res.content.map((c) => c.text).join("\n")}`;
    }
    return out;
  }

  it("per-store config baseline held: each store has its own _config.db with watcher off", () => {
    for (const projectId of ["proj-a", "proj-b", "sandbox-s"]) {
      const store = projectStoreDir(projectId, base);
      expect(fs.existsSync(path.join(store, "_config.db")), `${projectId} store config`).toBe(true);
      expect(fs.existsSync(path.join(store, ".baseline-ok")), `${projectId} baseline marker`).toBe(true);
    }
  });

  it("project A sees its own canary and NEVER project B's or the sandbox's", async () => {
    const out = await allToolOutput("proj-a");
    expect(out).toContain(CANARY.projA);
    expect(out).not.toContain(CANARY.projB);
    expect(out).not.toContain(CANARY.sandbox);
  });

  it("project B sees its own canary and NEVER project A's or the sandbox's", async () => {
    const out = await allToolOutput("proj-b");
    expect(out).toContain(CANARY.projB);
    expect(out).not.toContain(CANARY.projA);
    expect(out).not.toContain(CANARY.sandbox);
  });

  it("the sandbox sees ONLY itself — and owner projects never see hostile-clone symbols", async () => {
    const out = await allToolOutput("sandbox-s");
    expect(out).toContain(CANARY.sandbox);
    expect(out).not.toContain(CANARY.projA);
    expect(out).not.toContain(CANARY.projB);
  });
});

describe("isolation by construction (always-on unit checks)", () => {
  it("distinct projects map to distinct store dirs under code-graph/", () => {
    const base = "C:/x";
    const a = projectStoreDir("proj-a", base);
    const b = projectStoreDir("proj-b", base);
    expect(a).not.toBe(b);
    expect(path.dirname(a)).toBe(path.dirname(b));
  });
});
