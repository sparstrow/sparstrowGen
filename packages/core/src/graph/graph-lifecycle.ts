import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { GraphProjectStatus } from "@sparstrow/shared";
import { bus } from "../events/bus.js";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { projects } from "../db/schema.js";
import { logger } from "../logger.js";
import { GRAPH_ENGINE_VERSION, getEngineStatus } from "./binary-manager.js";
import { getGraphPool, projectStoreDir, type GraphClientPool } from "./graph-client.js";
import { forgetEngineProject } from "./graph-tools.js";

/**
 * P5 §4 — graph index lifecycle. Honors locked P5-Q4: indexing happens on
 * project create (auto), the Reindex button (manual), and a nightly sweep —
 * never a file-watcher (auto_watch is asserted off per store by the baseline).
 *
 * Concurrency (audit #37): indexing is RAM-spiky, and `index_repository` is a
 * DIRECT stdio call — the run-scheduler's lanes never see it, so they protect
 * nothing here. A dedicated GLOBAL semaphore (queue depth 1) serializes every
 * index across all projects; per-project single-flight de-dupes repeat clicks.
 *
 * Status is derived data persisted as `.index-status.json` INSIDE the store
 * dir (no DB migration in the swap scope); every transition is pushed over
 * the existing ws bus for the project page's Code-graph panel.
 *
 * Sandboxes NEVER auto-index (audit #41/#13): hostile clones are parsed by a
 * C binary only when the owner explicitly clicks Reindex on that sandbox.
 */

const STATUS_FILE = ".index-status.json";
const VERSION_FILE = ".engine-version";
const INDEX_TIMEOUT_MS = 10 * 60_000;

const NONE: GraphProjectStatus = { state: "none", detail: null, indexedAt: null, nodes: null, edges: null };

export function readGraphProjectStatus(projectId: string, baseDir = config.dataDir): GraphProjectStatus {
  const file = path.join(projectStoreDir(projectId, baseDir), STATUS_FILE);
  try {
    return { ...NONE, ...(JSON.parse(fs.readFileSync(file, "utf8")) as Partial<GraphProjectStatus>) };
  } catch {
    return NONE;
  }
}

function writeStatus(projectId: string, baseDir: string, status: GraphProjectStatus): void {
  const dir = projectStoreDir(projectId, baseDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, STATUS_FILE), JSON.stringify(status));
  bus.publish({ type: "graph.project.status", projectId, status });
}

/** Audit #43: an engine-version bump invalidates every store — wipe, rebuild on demand. */
function ensureStoreVersion(projectId: string, baseDir: string): void {
  const dir = projectStoreDir(projectId, baseDir);
  const file = path.join(dir, VERSION_FILE);
  if (!fs.existsSync(dir)) return;
  const recorded = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : null;
  if (recorded !== null && recorded !== GRAPH_ENGINE_VERSION) {
    logger.info({ projectId, recorded, now: GRAPH_ENGINE_VERSION }, "graph store wiped (engine version bump)");
    fs.rmSync(dir, { recursive: true, force: true });
    forgetEngineProject(projectId);
  }
}

// Global depth-1 semaphore: a promise chain every index appends to.
let indexChain: Promise<void> = Promise.resolve();
/** Projects currently queued or indexing (per-project single-flight). */
const inFlight = new Set<string>();

export interface EnqueueResult {
  queued: boolean;
  reason?: "engine-missing" | "no-rootDir" | "sandbox-no-auto" | "already-indexing" | "unknown-project";
}

export interface GraphLifecycleOpts {
  baseDir?: string;
  pool?: GraphClientPool;
}

/**
 * Queue a graph index for a project. Returns immediately; the index runs
 * through the global semaphore. Never throws — graph is additive and a
 * failure to index must never block project lifecycle (regression guard #32).
 */
export function enqueueGraphIndex(
  projectId: string,
  opts: { reason: "auto" | "manual" | "nightly" } & GraphLifecycleOpts,
): EnqueueResult {
  const baseDir = opts.baseDir ?? config.dataDir;
  if (!getEngineStatus(baseDir).installed) return { queued: false, reason: "engine-missing" };
  const row = getDb().select().from(projects).where(eq(projects.id, projectId)).get();
  if (!row) return { queued: false, reason: "unknown-project" };
  if (!row.rootDir) return { queued: false, reason: "no-rootDir" };
  if (row.isSandbox && opts.reason !== "manual") return { queued: false, reason: "sandbox-no-auto" };
  if (inFlight.has(projectId)) return { queued: false, reason: "already-indexing" };

  inFlight.add(projectId);
  ensureStoreVersion(projectId, baseDir);
  writeStatus(projectId, baseDir, { ...readGraphProjectStatus(projectId, baseDir), state: "queued", detail: null });
  const pool = opts.pool ?? getGraphPool();
  const rootDir = row.rootDir;
  indexChain = indexChain
    .then(() => runIndex(projectId, rootDir, baseDir, pool))
    .catch(() => {
      /* runIndex reports its own failures via status */
    });
  return { queued: true };
}

async function runIndex(projectId: string, rootDir: string, baseDir: string, pool: GraphClientPool): Promise<void> {
  const prev = readGraphProjectStatus(projectId, baseDir);
  writeStatus(projectId, baseDir, { ...prev, state: "indexing", detail: null });
  try {
    const res = await pool.callTool(
      projectId,
      "index_repository",
      { repo_path: rootDir.replaceAll("\\", "/") },
      { timeoutMs: INDEX_TIMEOUT_MS },
    );
    if (res.isError) {
      throw new Error(
        (res.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text?.slice(0, 200) ??
          "index_repository returned an error",
      );
    }
    forgetEngineProject(projectId); // first index creates the engine-side project name
    let nodes: number | null = null;
    let edges: number | null = null;
    try {
      const list = await pool.callTool(projectId, "list_projects", {});
      const raw = (list.content as { type: string; text?: string }[]).find((c) => c.type === "text")?.text ?? "{}";
      const first = (JSON.parse(raw) as { projects?: { nodes?: number; edges?: number }[] }).projects?.[0];
      nodes = first?.nodes ?? null;
      edges = first?.edges ?? null;
    } catch {
      /* counts are cosmetic */
    }
    fs.writeFileSync(path.join(projectStoreDir(projectId, baseDir), VERSION_FILE), GRAPH_ENGINE_VERSION);
    writeStatus(projectId, baseDir, {
      state: "ready",
      detail: null,
      indexedAt: new Date().toISOString(),
      nodes,
      edges,
    });
    logger.info({ projectId, nodes, edges }, "graph index ready");
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 200) : String(err);
    writeStatus(projectId, baseDir, { ...prev, state: "failed", detail });
    logger.warn({ projectId, detail }, "graph index failed");
  } finally {
    inFlight.delete(projectId);
  }
}

/**
 * Startup reconcile (audit — eng #5, P1 wake-reconcile idiom): a status stuck
 * at queued/indexing means core died mid-index; the store may be semantically
 * half-written even though WAL recovered the file. Mark it failed(stale).
 */
export function reconcileInterruptedIndexes(baseDir = config.dataDir): number {
  const root = path.join(baseDir, "code-graph");
  if (!fs.existsSync(root)) return 0;
  let fixed = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, STATUS_FILE);
    if (!fs.existsSync(file)) continue;
    try {
      const status = JSON.parse(fs.readFileSync(file, "utf8")) as GraphProjectStatus;
      if (status.state === "queued" || status.state === "indexing") {
        fs.writeFileSync(
          file,
          JSON.stringify({ ...status, state: "failed", detail: "interrupted by a core restart — Reindex to rebuild" }),
        );
        fixed += 1;
      }
    } catch {
      /* unreadable status → leave for next index to overwrite */
    }
  }
  return fixed;
}

/**
 * Project deletion: stop the engine child and remove the WHOLE store dir.
 * With per-project stores this is strictly stronger than the engine's own
 * delete_project — ghost-free by construction, nothing to forget.
 */
export async function onProjectDeleted(projectId: string, opts: GraphLifecycleOpts = {}): Promise<void> {
  const baseDir = opts.baseDir ?? config.dataDir;
  try {
    await (opts.pool ?? getGraphPool()).stopChild(projectId);
  } catch {
    /* child not running */
  }
  fs.rmSync(projectStoreDir(projectId, baseDir), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  forgetEngineProject(projectId);
}

/**
 * Nightly refresh (locked P5-Q4): a 24h sweep enqueues every indexable
 * project; the global semaphore serializes the actual work so N projects
 * never index simultaneously at 3am (eng #3). Sandboxes are skipped by the
 * auto rule inside enqueueGraphIndex.
 */
export function startNightlyGraphRefresh(opts: GraphLifecycleOpts & { intervalMs?: number } = {}): () => void {
  const intervalMs = opts.intervalMs ?? 24 * 60 * 60_000;
  const sweep = () => {
    try {
      for (const row of getDb().select().from(projects).all()) {
        if (row.rootDir) enqueueGraphIndex(row.id, { reason: "nightly", ...opts });
      }
    } catch (err) {
      logger.warn({ err }, "nightly graph refresh sweep failed");
    }
  };
  const timer = setInterval(sweep, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
