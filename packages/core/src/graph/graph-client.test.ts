import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GraphClientError,
  GraphClientPool,
  projectStoreDir,
  sweepOrphanEngines,
  type EngineCommand,
} from "./graph-client.js";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-engine.fixture.mjs");

// Fixture is spawned via process.execPath — no PATH/cwd resolution games on
// Windows CI (spike/eng-review note: never spawn bare "node").
function engine(mode: string): EngineCommand {
  return { command: process.execPath, args: [FIXTURE, mode] };
}

const okBaseline = async () => ({ ok: true, detail: null });

function makePool(base: string, mode: string, opts: Partial<ConstructorParameters<typeof GraphClientPool>[0]> = {}) {
  return new GraphClientPool({
    baseDir: base,
    engineResolver: () => engine(mode),
    storeBaseline: okBaseline,
    idleSweep: false,
    connectTimeoutMs: 5_000,
    requestTimeoutMs: 2_000,
    ...opts,
  });
}

function textOf(result: { content?: unknown }): string {
  const content = result.content as { type: string; text: string }[];
  return content[0]?.text ?? "";
}

describe("GraphClientPool (P5 §2)", () => {
  let base: string;
  let pool: GraphClientPool | null;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-pool-"));
    pool = null;
  });
  afterEach(async () => {
    await pool?.shutdown();
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("spawns per project, forwards calls, writes+clears PID files, shuts down cleanly", async () => {
    pool = makePool(base, "echo");
    const res = await pool.callTool("proj-a", "echo", { hello: "graph" });
    expect(textOf(res)).toContain('"hello":"graph"');

    const pidPath = path.join(projectStoreDir("proj-a", base), ".engine.pid");
    expect(fs.existsSync(pidPath)).toBe(true);
    expect(pool.getStatus().running.map((r) => r.projectId)).toEqual(["proj-a"]);

    await pool.shutdown();
    expect(fs.existsSync(pidPath)).toBe(false);
    expect(pool.getStatus().running).toHaveLength(0);
  });

  it("promise-gates concurrent spawns: one child serves parallel first calls", async () => {
    pool = makePool(base, "echo");
    const [r1, r2, r3] = await Promise.all([
      pool.callTool("proj-a", "echo", { n: 1 }),
      pool.callTool("proj-a", "echo", { n: 2 }),
      pool.callTool("proj-a", "echo", { n: 3 }),
    ]);
    const pids = new Set([r1, r2, r3].map((r) => JSON.parse(textOf(r)).pid as number));
    expect(pids.size).toBe(1);
    expect(pool.getStatus().running).toHaveLength(1);
  });

  it("request timeout cancels the call but NEVER kills the child (audit #36)", async () => {
    pool = makePool(base, "echo", { requestTimeoutMs: 300 });
    await expect(pool.callTool("proj-a", "sleep", { ms: 5_000 })).rejects.toMatchObject({ kind: "timeout" });
    // Same child still serves the next call.
    const before = pool.getStatus().running[0]?.pid;
    const after = await pool.callTool("proj-a", "echo", { still: "alive" });
    expect(JSON.parse(textOf(after)).pid).toBe(before);
  });

  it("crash-loop latches the breaker after N failures; reset re-arms it (audit #40)", async () => {
    pool = makePool(base, "crash", { breakerLimit: 3, connectTimeoutMs: 2_000 });
    for (let i = 0; i < 3; i++) {
      await expect(pool.callTool("proj-a", "echo", {})).rejects.toBeInstanceOf(GraphClientError);
    }
    // Latched: no spawn attempt, typed degraded error.
    await expect(pool.callTool("proj-a", "echo", {})).rejects.toMatchObject({ kind: "engine-degraded" });

    // Other projects are unaffected by proj-a's latch.
    const healthy = makePool(base, "echo");
    try {
      await expect(healthy.callTool("proj-b", "echo", {})).resolves.toBeTruthy();
    } finally {
      await healthy.shutdown();
    }

    pool.resetBreaker("proj-a");
    // Still crashing, but the reset re-arms attempts (fails as crash, not degraded).
    await expect(pool.callTool("proj-a", "echo", {})).rejects.not.toMatchObject({ kind: "engine-degraded" });
  });

  it("LRU-evicts beyond maxChildren and idle-stops stale children (audit #30)", async () => {
    pool = makePool(base, "echo", { maxChildren: 2, idleStopMs: 100 });
    await pool.callTool("p1", "echo", {});
    await new Promise((r) => setTimeout(r, 10));
    await pool.callTool("p2", "echo", {});
    await pool.callTool("p3", "echo", {}); // evicts p1 (oldest)
    const running = pool.getStatus().running.map((r) => r.projectId).sort();
    expect(running).toEqual(["p2", "p3"]);

    await new Promise((r) => setTimeout(r, 150));
    pool.sweepIdle();
    await vi.waitFor(() => expect(pool!.getStatus().running).toHaveLength(0));
    // Lazy respawn after idle-stop works.
    await expect(pool.callTool("p2", "echo", {})).resolves.toBeTruthy();
  });

  it("engine-missing when the resolver returns null; baseline failure degrades and counts toward the breaker", async () => {
    pool = new GraphClientPool({
      baseDir: base,
      engineResolver: () => null,
      idleSweep: false,
    });
    await expect(pool.callTool("proj-a", "echo", {})).rejects.toMatchObject({ kind: "engine-missing" });
    await pool.shutdown();

    pool = makePool(base, "echo", {
      breakerLimit: 2,
      storeBaseline: async () => ({ ok: false, detail: "auto_watch assertion failed" }),
    });
    await expect(pool.callTool("proj-a", "echo", {})).rejects.toMatchObject({ kind: "engine-degraded" });
    await expect(pool.callTool("proj-a", "echo", {})).rejects.toMatchObject({ kind: "engine-degraded" });
    expect(pool.getStatus().latched).toContain("proj-a");
  });

  it("baseline runs once per store dir and its marker persists", async () => {
    const baseline = vi.fn(okBaseline);
    pool = makePool(base, "echo", { storeBaseline: baseline });
    await pool.callTool("proj-a", "echo", {});
    await pool.stopChild("proj-a");
    await pool.callTool("proj-a", "echo", {}); // respawn — marker skips baseline
    expect(baseline).toHaveBeenCalledTimes(1);
  });

  it("sanitizes hostile project ids out of store paths", () => {
    const dir = projectStoreDir("../../evil", base);
    expect(dir.startsWith(path.join(base, "code-graph"))).toBe(true);
    expect(dir).not.toContain("..");
  });
});

describe("sweepOrphanEngines (P5 §2, audit #38)", () => {
  let base: string;
  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-sweep-"));
  });
  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  it("kills a live orphan whose exe identity matches, and clears every PID file", async () => {
    // A real live process stands in for a leaked engine child.
    const orphan = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const storeA = projectStoreDir("proj-a", base);
    fs.mkdirSync(storeA, { recursive: true });
    fs.writeFileSync(path.join(storeA, ".engine.pid"), String(orphan.pid));

    // A PID file whose process is NOT an engine must be left alive but the file removed.
    const bystander = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const storeB = projectStoreDir("proj-b", base);
    fs.mkdirSync(storeB, { recursive: true });
    fs.writeFileSync(path.join(storeB, ".engine.pid"), String(bystander.pid));

    try {
      const killed = await sweepOrphanEngines(base, async (pid) => pid === orphan.pid);
      expect(killed).toBe(1);
      expect(fs.existsSync(path.join(storeA, ".engine.pid"))).toBe(false);
      expect(fs.existsSync(path.join(storeB, ".engine.pid"))).toBe(false);
      await vi.waitFor(() => {
        expect(() => process.kill(orphan.pid!, 0)).toThrow(); // orphan is dead
      });
      expect(() => process.kill(bystander.pid!, 0)).not.toThrow(); // bystander lives
    } finally {
      try {
        bystander.kill();
      } catch {
        /* already gone */
      }
      try {
        orphan.kill();
      } catch {
        /* already gone */
      }
    }
  });

  it("is a no-op on stores without PID files and tolerates garbage pid content", async () => {
    const store = projectStoreDir("proj-c", base);
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(path.join(store, ".engine.pid"), "not-a-pid");
    const killed = await sweepOrphanEngines(base, async () => true);
    expect(killed).toBe(0);
    expect(fs.existsSync(path.join(store, ".engine.pid"))).toBe(false);
  });
});
