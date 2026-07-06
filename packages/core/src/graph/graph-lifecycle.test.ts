import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { projects } from "../db/schema.js";
import { GRAPH_ENGINE_VERSION } from "./binary-manager.js";
import { GraphClientPool, projectStoreDir } from "./graph-client.js";
import {
  enqueueGraphIndex,
  onProjectDeleted,
  readGraphProjectStatus,
  reconcileInterruptedIndexes,
} from "./graph-lifecycle.js";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-engine.fixture.mjs");

describe("graph index lifecycle (P5 §4)", () => {
  let base: string;
  let repo: string;
  let pool: GraphClientPool;
  let exeStub: string;

  function seedProject(over: Partial<{ isSandbox: boolean; rootDir: string | null }> = {}): string {
    const id = `prj_${nanoid(8)}`;
    const ts = new Date().toISOString();
    getDb()
      .insert(projects)
      .values({
        id,
        name: id,
        slug: id,
        description: "",
        rootDir: over.rootDir === undefined ? repo : over.rootDir,
        isSandbox: over.isSandbox ?? false,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function poolFor(mode: string): GraphClientPool {
    return new GraphClientPool({
      baseDir: base,
      engineResolver: () => ({ command: process.execPath, args: [FIXTURE, mode] }),
      storeBaseline: async () => ({ ok: true, detail: null }),
      idleSweep: false,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000,
    });
  }

  async function waitForState(projectId: string, state: string): Promise<void> {
    await vi.waitFor(() => expect(readGraphProjectStatus(projectId, base).state).toBe(state), {
      timeout: 10_000,
    });
  }

  beforeEach(() => {
    closeDb();
    openDb(":memory:");
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-lc-"));
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-lc-repo-"));
    // A fake "installed engine": the status check only needs marker + exe on disk.
    const dir = path.join(base, "bin", "codebase-memory-mcp", GRAPH_ENGINE_VERSION, "std");
    fs.mkdirSync(dir, { recursive: true });
    exeStub = path.join(dir, process.platform === "win32" ? "codebase-memory-mcp.exe" : "codebase-memory-mcp");
    fs.writeFileSync(exeStub, "stub");
    fs.writeFileSync(path.join(dir, ".install-complete"), "{}");
    pool = poolFor("echo");
  });
  afterEach(async () => {
    await pool.shutdown();
    closeDb();
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("REGRESSION GUARD (#32): with no engine installed, enqueue no-ops silently — creation path unchanged", () => {
    fs.rmSync(path.join(base, "bin"), { recursive: true, force: true });
    const id = seedProject();
    const res = enqueueGraphIndex(id, { reason: "auto", baseDir: base, pool });
    expect(res).toEqual({ queued: false, reason: "engine-missing" });
    expect(readGraphProjectStatus(id, base).state).toBe("none"); // nothing written, nothing thrown
  });

  it("indexes queued→indexing→ready with counts, and writes the store version file", async () => {
    const id = seedProject();
    const res = enqueueGraphIndex(id, { reason: "auto", baseDir: base, pool });
    expect(res.queued).toBe(true);
    await waitForState(id, "ready");
    const status = readGraphProjectStatus(id, base);
    expect(status.nodes).toBe(42);
    expect(status.edges).toBe(99);
    expect(status.indexedAt).toBeTruthy();
    expect(fs.readFileSync(path.join(projectStoreDir(id, base), ".engine-version"), "utf8")).toBe(
      GRAPH_ENGINE_VERSION,
    );
  });

  it("sandboxes never auto/nightly-index; manual Reindex is the explicit opt-in (#41)", async () => {
    const id = seedProject({ isSandbox: true });
    expect(enqueueGraphIndex(id, { reason: "auto", baseDir: base, pool })).toEqual({
      queued: false,
      reason: "sandbox-no-auto",
    });
    expect(enqueueGraphIndex(id, { reason: "nightly", baseDir: base, pool })).toEqual({
      queued: false,
      reason: "sandbox-no-auto",
    });
    expect(enqueueGraphIndex(id, { reason: "manual", baseDir: base, pool }).queued).toBe(true);
    await waitForState(id, "ready");
  });

  it("global semaphore serializes indexes; per-project single-flight de-dupes", async () => {
    const a = seedProject();
    const b = seedProject();
    expect(enqueueGraphIndex(a, { reason: "auto", baseDir: base, pool }).queued).toBe(true);
    expect(enqueueGraphIndex(b, { reason: "auto", baseDir: base, pool }).queued).toBe(true);
    // Second enqueue for a queued project no-ops.
    expect(enqueueGraphIndex(a, { reason: "manual", baseDir: base, pool })).toEqual({
      queued: false,
      reason: "already-indexing",
    });
    // Depth-1: while A is indexing (fixture delays 120ms), B must still be queued.
    await vi.waitFor(() => expect(readGraphProjectStatus(a, base).state).toBe("indexing"));
    expect(readGraphProjectStatus(b, base).state).toBe("queued");
    await waitForState(a, "ready");
    await waitForState(b, "ready");
  });

  it("index failure lands in failed(detail) and a later manual retry works", async () => {
    const failing = poolFor("index-fail");
    const id = seedProject();
    try {
      expect(enqueueGraphIndex(id, { reason: "auto", baseDir: base, pool: failing }).queued).toBe(true);
      await waitForState(id, "failed");
      expect(readGraphProjectStatus(id, base).detail).toMatch(/parse crashed/);
    } finally {
      await failing.shutdown();
    }
    expect(enqueueGraphIndex(id, { reason: "manual", baseDir: base, pool }).queued).toBe(true);
    await waitForState(id, "ready");
  });

  it("no rootDir → skipped; missing project → skipped", () => {
    const id = seedProject({ rootDir: null });
    expect(enqueueGraphIndex(id, { reason: "auto", baseDir: base, pool })).toEqual({
      queued: false,
      reason: "no-rootDir",
    });
    expect(enqueueGraphIndex("prj_missing", { reason: "auto", baseDir: base, pool })).toEqual({
      queued: false,
      reason: "unknown-project",
    });
  });

  it("startup reconcile marks interrupted indexes failed with a Reindex hint (eng #5)", () => {
    const id = seedProject();
    const store = projectStoreDir(id, base);
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(
      path.join(store, ".index-status.json"),
      JSON.stringify({ state: "indexing", detail: null, indexedAt: null, nodes: null, edges: null }),
    );
    expect(reconcileInterruptedIndexes(base)).toBe(1);
    const status = readGraphProjectStatus(id, base);
    expect(status.state).toBe("failed");
    expect(status.detail).toMatch(/Reindex/);
    // Idempotent: a second reconcile finds nothing.
    expect(reconcileInterruptedIndexes(base)).toBe(0);
  });

  it("engine-version bump wipes the store and a fresh index rebuilds it (#43)", async () => {
    const id = seedProject();
    const store = projectStoreDir(id, base);
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(path.join(store, ".engine-version"), "0.0.1");
    fs.writeFileSync(path.join(store, "leftover.db"), "old data");
    expect(enqueueGraphIndex(id, { reason: "manual", baseDir: base, pool }).queued).toBe(true);
    await waitForState(id, "ready");
    expect(fs.existsSync(path.join(store, "leftover.db"))).toBe(false); // wiped
    expect(fs.readFileSync(path.join(store, ".engine-version"), "utf8")).toBe(GRAPH_ENGINE_VERSION);
  });

  it("project deletion removes the whole store dir — ghost-free (#18)", async () => {
    const id = seedProject();
    expect(enqueueGraphIndex(id, { reason: "auto", baseDir: base, pool }).queued).toBe(true);
    await waitForState(id, "ready");
    expect(fs.existsSync(projectStoreDir(id, base))).toBe(true);
    await onProjectDeleted(id, { baseDir: base, pool });
    expect(fs.existsSync(projectStoreDir(id, base))).toBe(false);
  });
});
