import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

export async function probeHealth(timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(timeoutMs) });
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

  constructor(private repoRoot: string) {
    const logDir = path.join(repoRoot, "data", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    this.logPath = path.join(logDir, "core-service.log");
  }

  get mode(): "external" | "supervised" | "stopped" {
    if (this.external) return "external";
    return this.child ? "supervised" : "stopped";
  }

  async start(): Promise<void> {
    if (await probeHealth()) {
      this.external = true;
      console.log("[service] core already running — external mode");
      return;
    }
    this.spawnCore();
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (await probeHealth()) {
        console.log("[service] core is healthy");
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`core did not become healthy; see ${this.logPath}`);
  }

  private spawnCore(): void {
    const coreDir = path.join(this.repoRoot, "packages", "core");
    const tsxCli = require.resolve("tsx/cli", { paths: [coreDir] });
    const entry = path.join(coreDir, "src", "index.ts");

    this.rotateLogIfNeeded();
    this.logStream ??= fs.createWriteStream(this.logPath, { flags: "a" });

    // The core MUST run on plain Node, never Electron-as-Node: native modules
    // (better-sqlite3, node-pty, onnxruntime) are compiled for the system Node
    // ABI. Packaged builds point SPARSTROW_NODE at the bundled runtime.
    const nodeBin = process.env.SPARSTROW_NODE ?? "node";
    const child = spawn(nodeBin, [tsxCli, entry], {
      cwd: coreDir,
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
        if (await probeHealth()) {
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
      await fetch(SHUTDOWN_URL, { method: "POST", signal: AbortSignal.timeout(2000) });
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
