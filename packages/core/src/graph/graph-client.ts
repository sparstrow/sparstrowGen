import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ErrorCode, McpError, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { engineExePath, graphChildEnv } from "./binary-manager.js";

/**
 * P5 §2 — per-project graph-engine child pool.
 *
 * One child per project: the engine's store location is fixed by env at spawn
 * (CBM_CACHE_DIR), and per-project store dirs are the isolation-by-construction
 * decision (audit #13) — so isolation costs one process per ACTIVE project.
 * The pool bounds that honestly: max live children + LRU idle-stop, lazy
 * respawn on demand.
 *
 * Timeout policy (audit #36 — slow ≠ dead): the connect handshake gets a
 * generous timeout (Defender first-spawn); per-request timeouts use the SDK's
 * request cancellation and NEVER kill the child (a query that times out while
 * the child is busy indexing must not destroy minutes of index work). The
 * child is killed/restarted only on transport close/error.
 *
 * Crash-loop breaker (audit #40, C10 idiom): consecutive spawn/crash failures
 * latch the project into a degraded state until an explicit reset (Settings →
 * Retry). A latched project costs zero spawn attempts.
 *
 * Windows process reality (audit #38): no SIGTERM delivery from external
 * kills, `tsx watch` hard-restarts leak children. Every child's pid is written
 * to a PID file in its store dir; `sweepOrphanEngines()` runs at startup and
 * kills leftovers after verifying the pid still looks like an engine process.
 */

export type GraphErrorKind =
  | "engine-missing"
  | "engine-degraded"
  | "timeout"
  | "engine-crashed"
  | "call-failed";

export class GraphClientError extends Error {
  readonly kind: GraphErrorKind;
  constructor(kind: GraphErrorKind, message: string) {
    super(message);
    this.name = "GraphClientError";
    this.kind = kind;
  }
}

const PID_FILE = ".engine.pid";
const BASELINE_MARKER = ".baseline-ok";

/** Store-dir path segment safety: project ids are db ids, but never trust them as paths. */
function sanitizeId(id: string): string {
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : Buffer.from(id, "utf8").toString("hex");
}

export function projectStoreDir(projectId: string, baseDir = config.dataDir): string {
  return path.join(baseDir, "code-graph", sanitizeId(projectId));
}

export interface EngineCommand {
  command: string;
  args: string[];
}

export interface BaselineResult {
  ok: boolean;
  detail: string | null;
}

interface RunOut {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], env: Record<string, string>, timeoutMs: number): Promise<RunOut> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, env }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" }),
    );
  });
}

/**
 * One-time per-store config baseline. `auto_watch` (locked P5-Q4: no
 * file-watcher) and `auto_index` (lifecycle hooks own indexing) are persisted
 * into the store's own `_config.db`; the `--ui=false` run persists the UI flag
 * off (spike: `--ui` is sticky store config, and a query child must never try
 * to bind the viz port). The auto_watch assertion is a runtime guard for the
 * locked decision — a binary that ignores the setting degrades instead of
 * silently watching.
 */
export async function defaultStoreBaseline(engine: EngineCommand, storeDir: string): Promise<BaselineResult> {
  const env = graphChildEnv(storeDir);
  const setWatch = await run(engine.command, [...engine.args, "config", "set", "auto_watch", "false"], env, 30_000);
  if (!setWatch.ok) return { ok: false, detail: `config set auto_watch failed: ${setWatch.stderr.slice(0, 160)}` };
  const setIndex = await run(engine.command, [...engine.args, "config", "set", "auto_index", "false"], env, 30_000);
  if (!setIndex.ok) return { ok: false, detail: `config set auto_index failed: ${setIndex.stderr.slice(0, 160)}` };

  // Persist ui=false: the flag writes at startup; stdin is closed so the
  // server exits on EOF immediately after. Belt-and-suspenders kill timer.
  await new Promise<void>((resolve) => {
    const child = spawn(engine.command, [...engine.args, "--ui=false"], {
      env,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timer = setTimeout(() => child.kill(), 10_000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  const gotWatch = await run(engine.command, [...engine.args, "config", "get", "auto_watch"], env, 30_000);
  const value = gotWatch.stdout.trim().split(/\s+/).pop();
  if (!gotWatch.ok || value !== "false") {
    return { ok: false, detail: `auto_watch assertion failed (got "${gotWatch.stdout.trim().slice(0, 60)}")` };
  }
  return { ok: true, detail: null };
}

interface PoolEntry {
  projectId: string;
  client: Client;
  transport: StdioClientTransport;
  lastUsedAt: number;
  pid: number | null;
  /** Set before a deliberate close so onclose doesn't count it as a crash. */
  closing: boolean;
}

export interface GraphPoolOptions {
  baseDir?: string;
  /** Resolves the engine command; null = not installed. Test seam. */
  engineResolver?: () => EngineCommand | null;
  maxChildren?: number;
  idleStopMs?: number;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  breakerLimit?: number;
  storeBaseline?: (engine: EngineCommand, storeDir: string) => Promise<BaselineResult>;
  /** Disable the periodic idle sweep (tests call sweepIdle() directly). */
  idleSweep?: boolean;
}

export interface PoolProjectStatus {
  projectId: string;
  pid: number | null;
  lastUsedAt: number;
}

export interface PoolStatus {
  running: PoolProjectStatus[];
  latched: string[];
}

export class GraphClientPool {
  private readonly baseDir: string;
  private readonly resolver: () => EngineCommand | null;
  private readonly maxChildren: number;
  private readonly idleStopMs: number;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly breakerLimit: number;
  private readonly baseline: (engine: EngineCommand, storeDir: string) => Promise<BaselineResult>;

  private readonly entries = new Map<string, PoolEntry>();
  private readonly spawning = new Map<string, Promise<PoolEntry>>();
  private readonly failureCounts = new Map<string, number>();
  private readonly latchedDetail = new Map<string, string>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private shutdownRequested = false;

  constructor(opts: GraphPoolOptions = {}) {
    this.baseDir = opts.baseDir ?? config.dataDir;
    this.resolver =
      opts.engineResolver ??
      (() => {
        const exe = engineExePath("std", this.baseDir);
        return exe ? { command: exe, args: [] } : null;
      });
    this.maxChildren = opts.maxChildren ?? 3;
    this.idleStopMs = opts.idleStopMs ?? 10 * 60_000;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 60_000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 10_000;
    this.breakerLimit = opts.breakerLimit ?? 5;
    this.baseline = opts.storeBaseline ?? defaultStoreBaseline;
    if (opts.idleSweep !== false) {
      this.sweepTimer = setInterval(() => this.sweepIdle(), 60_000);
      this.sweepTimer.unref();
    }
  }

  /**
   * Forward one tool call to the project's engine child. Never kills the
   * child on timeout — the SDK cancels the request only.
   */
  async callTool(
    projectId: string,
    name: string,
    args: Record<string, unknown>,
    opts: { timeoutMs?: number } = {},
  ): Promise<CallToolResult> {
    if (this.latchedDetail.has(projectId)) {
      throw new GraphClientError(
        "engine-degraded",
        `graph engine for this project is degraded (${this.latchedDetail.get(projectId)}); retry from Settings`,
      );
    }
    const engine = this.resolver();
    if (!engine) throw new GraphClientError("engine-missing", "graph engine is not installed");

    const entry = await this.acquire(projectId, engine);
    entry.lastUsedAt = Date.now();
    try {
      const result = await entry.client.callTool({ name, arguments: args }, undefined, {
        timeout: opts.timeoutMs ?? this.requestTimeoutMs,
      });
      return result as CallToolResult;
    } catch (err) {
      if (err instanceof McpError && err.code === ErrorCode.RequestTimeout) {
        throw new GraphClientError("timeout", `graph tool ${name} timed out; the engine keeps running`);
      }
      if (!this.entries.has(projectId)) {
        throw new GraphClientError("engine-crashed", `graph engine exited during ${name}`);
      }
      throw new GraphClientError("call-failed", err instanceof Error ? err.message : String(err));
    }
  }

  /** Promise-gated spawn: concurrent callers for one project share one spawn. */
  private acquire(projectId: string, engine: EngineCommand): Promise<PoolEntry> {
    const existing = this.entries.get(projectId);
    if (existing) return Promise.resolve(existing);
    const inflight = this.spawning.get(projectId);
    if (inflight) return inflight;
    const p = this.spawnEntry(projectId, engine).finally(() => this.spawning.delete(projectId));
    this.spawning.set(projectId, p);
    return p;
  }

  private async spawnEntry(projectId: string, engine: EngineCommand): Promise<PoolEntry> {
    while (this.entries.size >= this.maxChildren) {
      let oldest: PoolEntry | null = null;
      for (const e of this.entries.values()) {
        if (!oldest || e.lastUsedAt < oldest.lastUsedAt) oldest = e;
      }
      if (!oldest) break;
      await this.stopChild(oldest.projectId);
    }

    const storeDir = projectStoreDir(projectId, this.baseDir);
    fs.mkdirSync(storeDir, { recursive: true });
    try {
      if (!fs.existsSync(path.join(storeDir, BASELINE_MARKER))) {
        const base = await this.baseline(engine, storeDir);
        if (!base.ok) {
          throw new GraphClientError("engine-degraded", base.detail ?? "store baseline failed");
        }
        fs.writeFileSync(path.join(storeDir, BASELINE_MARKER), "ok");
      }

      const transport = new StdioClientTransport({
        command: engine.command,
        args: engine.args,
        env: graphChildEnv(storeDir),
        cwd: storeDir,
        stderr: "pipe",
      });
      const client = new Client({ name: "sparstrow-graph", version: "0.1.0" });
      transport.onclose = () => this.handleClose(projectId);

      await client.connect(transport, { timeout: this.connectTimeoutMs });

      transport.stderr?.on("data", (chunk: Buffer) => {
        logger.debug({ projectId, engine: chunk.toString().slice(0, 300) }, "graph-engine stderr");
      });

      const entry: PoolEntry = {
        projectId,
        client,
        transport,
        lastUsedAt: Date.now(),
        pid: transport.pid ?? null,
        closing: false,
      };
      if (entry.pid !== null) {
        fs.writeFileSync(path.join(storeDir, PID_FILE), String(entry.pid));
      }
      this.entries.set(projectId, entry);
      this.failureCounts.delete(projectId);
      logger.info({ projectId, pid: entry.pid }, "graph-engine child started");
      return entry;
    } catch (err) {
      this.recordFailure(projectId, err instanceof Error ? err.message : String(err));
      if (err instanceof GraphClientError) throw err;
      throw new GraphClientError(
        "engine-crashed",
        `failed to start graph engine: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private recordFailure(projectId: string, detail: string): void {
    const count = (this.failureCounts.get(projectId) ?? 0) + 1;
    this.failureCounts.set(projectId, count);
    logger.warn({ projectId, count, detail }, "graph-engine failure");
    if (count >= this.breakerLimit) {
      this.latchedDetail.set(projectId, `${count} consecutive failures; last: ${detail.slice(0, 160)}`);
      logger.warn({ projectId }, "graph-engine breaker LATCHED — manual retry required");
    }
  }

  private handleClose(projectId: string): void {
    const entry = this.entries.get(projectId);
    if (!entry) return;
    this.entries.delete(projectId);
    this.rmPidFile(projectId);
    if (!entry.closing && !this.shutdownRequested) {
      this.recordFailure(projectId, "child exited unexpectedly");
    }
  }

  private rmPidFile(projectId: string): void {
    fs.rmSync(path.join(projectStoreDir(projectId, this.baseDir), PID_FILE), { force: true });
  }

  async stopChild(projectId: string): Promise<void> {
    const entry = this.entries.get(projectId);
    if (!entry) return;
    entry.closing = true;
    this.entries.delete(projectId);
    try {
      await entry.client.close();
    } catch {
      /* child already gone */
    }
    this.rmPidFile(projectId);
  }

  sweepIdle(): void {
    const now = Date.now();
    for (const entry of [...this.entries.values()]) {
      if (now - entry.lastUsedAt > this.idleStopMs) {
        logger.info({ projectId: entry.projectId }, "graph-engine idle-stop");
        void this.stopChild(entry.projectId);
      }
    }
  }

  /** Settings → Retry. Clears the breaker latch and failure counts. */
  resetBreaker(projectId?: string): void {
    if (projectId) {
      this.latchedDetail.delete(projectId);
      this.failureCounts.delete(projectId);
    } else {
      this.latchedDetail.clear();
      this.failureCounts.clear();
    }
  }

  getStatus(): PoolStatus {
    return {
      running: [...this.entries.values()].map((e) => ({
        projectId: e.projectId,
        pid: e.pid,
        lastUsedAt: e.lastUsedAt,
      })),
      latched: [...this.latchedDetail.keys()],
    };
  }

  /** Wired into core's shutdown() (Fastify onClose) — every child dies with core. */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await Promise.all([...this.entries.keys()].map((id) => this.stopChild(id)));
  }
}

/** Singleton pool used by the tool registrar / lifecycle hooks; tests build their own. */
let pool: GraphClientPool | null = null;
export function getGraphPool(): GraphClientPool {
  if (!pool) pool = new GraphClientPool();
  return pool;
}
export async function shutdownGraphPool(): Promise<void> {
  if (pool) {
    await pool.shutdown();
    pool = null;
  }
}

/**
 * Best-effort process-exit guard: Windows delivers no SIGTERM from external
 * kills and `tsx watch` restarts skip graceful shutdown — synchronously kill
 * whatever children are still alive when the process dies.
 */
process.on("exit", () => {
  if (!pool) return;
  for (const { pid } of pool.getStatus().running) {
    if (pid !== null) {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
  }
});

async function defaultIsEngineProcess(pid: number): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const res = await run(
        path.join(process.env.SYSTEMROOT ?? "C:\\Windows", "System32", "tasklist.exe"),
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows" },
        10_000,
      );
      return res.ok && res.stdout.toLowerCase().includes("codebase-memory-mcp");
    }
    if (process.platform === "linux") {
      const exe = fs.readlinkSync(`/proc/${pid}/exe`);
      return exe.includes("codebase-memory-mcp");
    }
    const res = await run("ps", ["-p", String(pid), "-o", "comm="], { PATH: process.env.PATH ?? "" }, 10_000);
    return res.ok && res.stdout.includes("codebase-memory-mcp");
  } catch {
    return false;
  }
}

/**
 * Startup reconcile (mirrors run-manager's sweepOrphans): kill engine children
 * leaked by a crashed/hard-restarted previous core. The exe identity check
 * prevents killing an unrelated process that recycled the pid.
 */
export async function sweepOrphanEngines(
  baseDir = config.dataDir,
  isEngineProcess: (pid: number) => Promise<boolean> = defaultIsEngineProcess,
): Promise<number> {
  const root = path.join(baseDir, "code-graph");
  if (!fs.existsSync(root)) return 0;
  let killed = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pidPath = path.join(root, entry.name, PID_FILE);
    if (!fs.existsSync(pidPath)) continue;
    const pid = Number.parseInt(fs.readFileSync(pidPath, "utf8").trim(), 10);
    if (Number.isFinite(pid) && (await isEngineProcess(pid))) {
      try {
        process.kill(pid);
        killed += 1;
        logger.warn({ pid, store: entry.name }, "graph-engine orphan killed at startup");
      } catch {
        /* died between check and kill */
      }
    }
    fs.rmSync(pidPath, { force: true });
  }
  return killed;
}
