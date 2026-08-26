import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PackagedPaths } from "./packaged-env";
import { readApiToken } from "./core-client";

const CORE_URL = process.env.SPARSTROW_CORE_URL ?? "http://127.0.0.1:48750";
const HEALTH_URL = `${CORE_URL}/api/v1/system/health`;
const SHUTDOWN_URL = `${CORE_URL}/api/v1/system/shutdown`;

const RESTART_BACKOFF_MS = 2000;
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 5 * 60 * 1000;
const LOG_MAX_BYTES = 5 * 1024 * 1024;

export function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/**
 * `/system/health` sits behind the same per-install bearer-token gate as the
 * rest of the human/UI API surface (`requireAuth` in `api/auth.ts`, wrapping
 * `systemRoutes` — see `packages/core/src/api/server.ts`), so a probe sent
 * without the token gets a 401, not a 200, no matter how healthy the core
 * actually is. `token` should be the same per-install token `core-client.ts`
 * already reads for the tray/updater (`readApiToken`); omit it only when the
 * caller genuinely doesn't know it yet.
 */
export async function probeHealth(timeoutMs = 1500, token: string | null = null): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(HEALTH_URL, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Supervises the core Node service. If a core is already listening (dev:
 * `pnpm --filter @sparstrow/core start` in a terminal), adopts it in
 * "external" mode and never restarts or stops it.
 */
export class ServiceManager {
  private child: ChildProcess | null = null;
  private external = false;
  private stopping = false;
  private restarts: number[] = [];
  private logStream: fs.WriteStream | null = null;
  private logBytes = 0;
  private logPath: string;
  /** Same data dir `core-client.ts` reads `.api-token` from — kept in sync so
   *  the supervisor's own health probe authenticates the same way the
   *  tray/updater's `coreFetch` does. */
  private dataDir: string;

  /**
   * @param repoRoot dev-mode repo checkout (spawns core via tsx from src).
   * @param packaged packaged-mode paths (spawns the bundled dist with the
   *   bundled Node; resolves nothing from the repo). Null/undefined in dev.
   */
  constructor(
    private repoRoot: string,
    private packaged: PackagedPaths | null = null,
  ) {
    const logDir = packaged?.logDir ?? path.join(repoRoot, "data", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    this.logPath = path.join(logDir, "core-service.log");
    this.dataDir = packaged?.dataDir ?? path.join(repoRoot, "data");
  }

  get mode(): "external" | "supervised" | "stopped" {
    if (this.external) return "external";
    return this.child ? "supervised" : "stopped";
  }

  /** The per-install token, read (and cached) from the same `.api-token`
   *  file/`SPARSTROW_TOKEN` env `core-client.ts` uses. Null before core has
   *  ever written the file — probeHealth degrades to an unauthenticated
   *  request in that case, same as before this fix, rather than throwing. */
  private token(): string | null {
    return readApiToken(this.dataDir);
  }

  async start(): Promise<void> {
    if (await probeHealth(1500, this.token())) {
      this.external = true;
      console.log("[service] core already running — external mode");
      return;
    }
    this.spawnCore();
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (await probeHealth(1500, this.token())) {
        console.log("[service] core is healthy");
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`core did not become healthy; see ${this.logPath}`);
  }

  private spawnCore(): void {
    this.rotateLogIfNeeded();
    this.logStream ??= fs.createWriteStream(this.logPath, { flags: "a" });

    // The core MUST run on plain Node, never Electron-as-Node: native modules
    // (better-sqlite3, node-pty, onnxruntime) are compiled for the system Node
    // ABI. Packaged builds point SPARSTROW_NODE at the bundled runtime.
    let nodeBin: string;
    let args: string[];
    let cwd: string;
    if (this.packaged) {
      // Packaged: run the prebuilt bundle with the bundled Node from the
      // install's resources — nothing is resolved from a repo checkout.
      nodeBin = process.env.SPARSTROW_NODE ?? this.packaged.nodeBin;
      args = [this.packaged.coreEntry];
      cwd = this.packaged.coreCwd;
    } else {
      const coreDir = path.join(this.repoRoot, "packages", "core");
      const tsxCli = require.resolve("tsx/cli", { paths: [coreDir] });
      nodeBin = process.env.SPARSTROW_NODE ?? "node";
      args = [tsxCli, path.join(coreDir, "src", "index.ts")];
      cwd = coreDir;
    }
    const child = spawn(nodeBin, args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    console.log(`[service] spawned core pid=${child.pid}`);

    const sink = (chunk: Buffer) => {
      this.logBytes += chunk.length;
      this.logStream?.write(chunk);
      if (this.logBytes > LOG_MAX_BYTES) this.rotateLogIfNeeded();
    };
    child.stdout?.on("data", sink);
    child.stderr?.on("data", sink);

    child.on("exit", (code) => {
      console.log(`[service] core exited code=${code}`);
      this.child = null;
      if (this.stopping) return;
      void (async () => {
        // Another core may own the port (dev watch server, prior instance) —
        // adopt it instead of crash-looping on EADDRINUSE.
        if (await probeHealth(1500, this.token())) {
          this.external = true;
          console.log("[service] external core detected — adopting, not respawning");
          return;
        }
        const now = Date.now();
        this.restarts = this.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
        if (this.restarts.length >= MAX_RESTARTS) {
          console.error("[service] too many core crashes — giving up");
          return;
        }
        this.restarts.push(now);
        setTimeout(() => {
          if (!this.stopping) this.spawnCore();
        }, RESTART_BACKOFF_MS);
      })();
    });
  }

  private rotateLogIfNeeded(): void {
    try {
      if (fs.existsSync(this.logPath) && fs.statSync(this.logPath).size > LOG_MAX_BYTES) {
        this.logStream?.end();
        this.logStream = null;
        fs.renameSync(this.logPath, `${this.logPath}.1`);
      }
    } catch {
      // best effort
    }
    this.logBytes = 0;
  }

  /** Graceful stop: ask the core to drain, then force-kill as a fallback. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.external || !this.child) return;
    const child = this.child;
    try {
      const token = this.token();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch(SHUTDOWN_URL, { method: "POST", headers, signal: AbortSignal.timeout(2000) });
    } catch {
      // fall through to kill
    }
    const exited = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 8000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve(true);
      });
    });
    if (!exited && child.pid) {
      try {
        process.kill(child.pid);
      } catch {
        // already gone
      }
    }
    this.logStream?.end();
    this.logStream = null;
  }
}
