import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PackagedPaths } from "./packaged-env";
import { readServerConfig } from "./server-config";
import { serverBaseUrl, serverPort } from "./ports";

/**
 * Supervises `server/` — the API both halves of this app talk to.
 *
 * ## Why the desktop app runs it at all
 *
 * `G-67`. A packaged install used to ship only the daemon, so the renderer
 * pointed at `127.0.0.1:8080` where nothing listened, and the daemon pointed at
 * a public host that answers 402. The app worked on exactly one machine in the
 * world — the developer's, and only while a checkout happened to be running
 * beside it.
 *
 * `OQ-9`'s answer was "`server/` runs locally, one per machine". This is that,
 * built. Hosting it instead is `D-40`, and deliberately later: it needs TLS and
 * a viewer role that does not exist yet (`G-35`).
 *
 * ## Why it is a separate supervisor from `ServiceManager`
 *
 * They look similar and are not. The daemon runs on plain Node because of four
 * native addons, is deliberately allowed to outlive the window, and has a
 * graceful-shutdown endpoint. `server/` has no native modules, must never
 * outlive the app (nothing else uses it), and is disposable — killing and
 * respawning it costs nothing. Sharing one class would mean a flag on every
 * one of those differences.
 */

/** See `ServiceManager`'s note: adoption is a judgement that must be re-made. */
const ADOPTED_CHECK_MS = 15_000;

const RESTART_BACKOFF_MS = 2000;
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 5 * 60 * 1000;
const LOG_MAX_BYTES = 5 * 1024 * 1024;

/**
 * This install's API port, resolved per call.
 *
 * Was a module constant, which meant every install of this app on a machine
 * listened on 8080 — so a second install adopted the first one's server and
 * operated on its data. `ports.ts` holds the per-channel table and explains
 * why capturing the value at import time could never have worked.
 */
export function serverUrl(): string {
  return serverBaseUrl();
}

/** Is anything serving the API at this URL? Unauthenticated by design. */
export async function probeServer(timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl()}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export type ServerState =
  | { state: "stopped" }
  /** Someone else's server is on the port — a dev checkout, usually. */
  | { state: "external" }
  | { state: "starting" }
  | { state: "running" }
  /** No Supabase credentials stored, so there is nothing to start. */
  | { state: "unconfigured" }
  | { state: "failed"; message: string };

export class ServerManager {
  private child: ChildProcess | null = null;
  private external = false;
  private stopping = false;
  private restarts: number[] = [];
  private watchdog: NodeJS.Timeout | null = null;
  private logStream: fs.WriteStream | null = null;
  private logBytes = 0;
  private logPath: string;
  private status: ServerState = { state: "stopped" };
  private onChange: (state: ServerState) => void = () => {};

  constructor(
    private repoRoot: string,
    private packaged: PackagedPaths | null = null,
  ) {
    const logDir = packaged?.logDir ?? path.join(repoRoot, "data", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    this.logPath = path.join(logDir, "server.log");
  }

  get state(): ServerState {
    return this.status;
  }

  onStateChange(fn: (state: ServerState) => void): void {
    this.onChange = fn;
  }

  private setState(next: ServerState): void {
    this.status = next;
    this.onChange(next);
  }

  /**
   * Start, or adopt what is already there.
   *
   * Adoption is checked first and unauthenticated, unlike the daemon's:
   * `/healthz` is deliberately open (see `app.ts`), so "is a server there" has a
   * real answer without a credential. That matters — a developer running
   * `pnpm dev` must not have the desktop app fight them for port 8080.
   */
  async start(): Promise<void> {
    this.stopping = false;

    if (await probeServer()) {
      this.external = true;
      console.log("[server] already running — adopting it");
      this.setState({ state: "external" });
      this.startWatchdog();
      return;
    }

    const config = readServerConfig();
    if (!config) {
      // Not an error, and deliberately not a crash loop. A fresh install has
      // nowhere to point yet; Settings is where that gets answered.
      console.log("[server] no Supabase configuration stored — not starting");
      this.setState({ state: "unconfigured" });
      return;
    }

    this.setState({ state: "starting" });
    this.spawnServer(config);

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (await probeServer()) {
        console.log("[server] healthy");
        this.setState({ state: "running" });
        return;
      }
      if (this.stopping) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    const message = `the server did not become healthy; see ${this.logPath}`;
    console.error(`[server] ${message}`);
    this.setState({ state: "failed", message });
  }

  /**
   * Keep watching a server we did not start.
   *
   * Adopting one and never looking again is how the app ends up with no server
   * and no intention of getting one: a developer stops their checkout, and the
   * app that decided to use it never notices. A server we spawned is covered by
   * its own `exit` handler; this is the other half.
   */
  private startWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      void (async () => {
        if (this.stopping || !this.external) return;
        if (await probeServer()) return;
        console.log("[server] the adopted server is gone — starting our own");
        this.external = false;
        this.restarts = [];
        const config = readServerConfig();
        if (config) {
          this.setState({ state: "starting" });
          this.spawnServer(config);
        } else {
          this.setState({ state: "unconfigured" });
        }
      })();
    }, ADOPTED_CHECK_MS);
    this.watchdog.unref?.();
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private spawnServer(config: ReturnType<typeof readServerConfig> & object): void {
    this.rotateLogIfNeeded();
    if (!this.logStream) {
      const stream = fs.createWriteStream(this.logPath, { flags: "a" });
      // See log-file.ts's identical fix: an async open failure with no
      // 'error' listener is fatal to the process, not something this
      // object's own try/catch (there is none here) could ever see.
      stream.on("error", () => {
        if (this.logStream === stream) this.logStream = null;
      });
      this.logStream = stream;
    }

    let nodeBin: string;
    let args: string[];
    let cwd: string;
    if (this.packaged) {
      nodeBin = process.env.SPARSTROW_NODE ?? this.packaged.nodeBin;
      args = [this.packaged.serverEntry];
      cwd = this.packaged.coreCwd;
    } else {
      const serverDir = path.join(this.repoRoot, "server");
      const tsxCli = require.resolve("tsx/cli", { paths: [serverDir] });
      nodeBin = process.env.SPARSTROW_NODE ?? "node";
      args = [tsxCli, path.join(serverDir, "cmd", "server.ts")];
      cwd = serverDir;
    }

    // NOT detached, unlike the daemon. Nothing but this app talks to `server/`,
    // so a copy of it surviving the app is pure harm: it holds the port, and
    // the next launch adopts a server built from the previous version's code.
    // That exact shape — a survivor holding a port with credentials the new
    // process could not reproduce — is what broke updating in v0.3.1.
    const child = spawn(nodeBin, args, {
      cwd,
      env: {
        ...process.env,
        SUPABASE_URL: config.supabaseUrl,
        SUPABASE_ANON_KEY: config.supabaseAnonKey,
        ...(config.supabaseServiceRoleKey
          ? { SUPABASE_SERVICE_ROLE_KEY: config.supabaseServiceRoleKey }
          : {}),
        ...(config.supabaseJwtSecret ? { SUPABASE_JWT_SECRET: config.supabaseJwtSecret } : {}),
        SPARSTROW_SERVER_PORT: String(serverPort()),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    console.log(`[server] spawned pid=${child.pid}`);

    const sink = (chunk: Buffer) => {
      this.logBytes += chunk.length;
      this.logStream?.write(chunk);
      if (this.logBytes > LOG_MAX_BYTES) this.rotateLogIfNeeded();
    };
    child.stdout?.on("data", sink);
    child.stderr?.on("data", sink);

    child.on("exit", (code) => {
      console.log(`[server] exited code=${code}`);
      this.child = null;
      if (this.stopping) return;

      const now = Date.now();
      this.restarts = this.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
      this.restarts.push(now);
      if (this.restarts.length > MAX_RESTARTS) {
        // A server that dies five times in five minutes is misconfigured, not
        // unlucky. Restarting forever would bury the reason under identical
        // log lines and keep the port churning.
        const message = `the server crashed repeatedly; see ${this.logPath}`;
        console.error(`[server] ${message}`);
        this.setState({ state: "failed", message });
        return;
      }
      setTimeout(() => {
        if (this.stopping) return;
        const current = readServerConfig();
        if (current) this.spawnServer(current);
      }, RESTART_BACKOFF_MS);
    });
  }

  /** Stop and restart, for when the configuration changed underneath it. */
  async restart(): Promise<void> {
    await this.stop();
    this.restarts = [];
    await this.start();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.stopWatchdog();
    this.logStream?.end();
    this.logStream = null;

    // An adopted server belongs to whoever started it. Killing a developer's
    // `pnpm dev` because the app quit would be a genuinely infuriating bug.
    if (this.external || !this.child) {
      this.external = false;
      this.setState({ state: "stopped" });
      return;
    }

    const child = this.child;
    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
      child.kill();
    });
    if (!exited) child.kill("SIGKILL");
    this.child = null;
    this.setState({ state: "stopped" });
  }

  private rotateLogIfNeeded(): void {
    try {
      const size = fs.statSync(this.logPath).size;
      if (size < LOG_MAX_BYTES) {
        this.logBytes = size;
        return;
      }
      this.logStream?.end();
      this.logStream = null;
      fs.renameSync(this.logPath, `${this.logPath}.1`);
    } catch {
      // No log yet, or a rename that lost a race. Either is fine.
    }
    this.logBytes = 0;
  }
}
