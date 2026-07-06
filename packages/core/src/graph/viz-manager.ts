import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { engineExePath, graphChildEnv } from "./binary-manager.js";
import { projectStoreDir } from "./graph-client.js";

/**
 * P5 §5 (UC2, owner gate) — 3D graph visualization: default-OFF, launched on
 * demand, opened in a NEW TAB (the unauthenticated origin never lives inside
 * the factory UI), auto-stopped after an idle window.
 *
 * Lifecycle (spike ⑥): the engine's UI thread runs alongside its stdio MCP
 * server, and the process exits on stdin EOF — so core HOLDS THE STDIN PIPE
 * open to keep the viz alive and simply closes it to stop. The binary binds
 * 127.0.0.1 explicitly (spike-verified). One UI child per project (its store
 * is fixed by env), randomized free port per launch.
 *
 * Sticky-flag reset (spike ⑥ catch): `--ui=true` PERSISTS into the store's
 * config — without a reset, the next QUERY child on that store would try to
 * bind the port. stopViz always runs a `--ui=false` reset pass.
 */

const IDLE_STOP_MS = 15 * 60_000;

interface VizEntry {
  child: ChildProcess;
  port: number;
  startedAt: string;
  timer: NodeJS.Timeout;
}

const running = new Map<string, VizEntry>();

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForHttp(url: string, attempts = 40): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Persist ui=false back into the store config (std variant, stdin closed → exits on EOF). */
function resetUiFlag(projectId: string, baseDir: string): void {
  const std = engineExePath("std", baseDir);
  if (!std) return;
  const child = spawn(std, ["--ui=false"], {
    env: graphChildEnv(projectStoreDir(projectId, baseDir)),
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  const timer = setTimeout(() => child.kill(), 10_000);
  child.on("exit", () => clearTimeout(timer));
  child.on("error", () => clearTimeout(timer));
}

export interface VizState {
  running: boolean;
  url: string | null;
  startedAt: string | null;
  idleStopMs: number;
}

export function vizStatus(projectId: string): VizState {
  const entry = running.get(projectId);
  return {
    running: Boolean(entry),
    url: entry ? `http://127.0.0.1:${entry.port}/` : null,
    startedAt: entry?.startedAt ?? null,
    idleStopMs: IDLE_STOP_MS,
  };
}

export type LaunchResult =
  | { ok: true; url: string }
  | { ok: false; reason: "ui-not-installed" | "spawn-failed"; detail: string | null };

export interface VizCommand {
  command: string;
  args: string[];
}

export async function launchViz(
  projectId: string,
  baseDir = config.dataDir,
  /** Test seam (same DI idiom as GraphClientPool.engineResolver). */
  uiCommand?: VizCommand,
): Promise<LaunchResult> {
  const existing = running.get(projectId);
  if (existing) {
    // Relaunch refreshes the idle window (design F2: honest idle policy).
    existing.timer.refresh();
    return { ok: true, url: `http://127.0.0.1:${existing.port}/` };
  }
  const uiExe = uiCommand ?? (() => {
    const exe = engineExePath("ui", baseDir);
    return exe ? { command: exe, args: [] } : null;
  })();
  if (!uiExe) return { ok: false, reason: "ui-not-installed", detail: null };

  try {
    const port = await freePort();
    const child = spawn(uiExe.command, [...uiExe.args, `--ui=true`, `--port=${port}`], {
      env: graphChildEnv(projectStoreDir(projectId, baseDir)),
      windowsHide: true,
      // Hold stdin open — closing it is how we stop the child (spike ⑥).
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("exit", () => {
      const entry = running.get(projectId);
      if (entry?.child === child) {
        clearTimeout(entry.timer);
        running.delete(projectId);
        resetUiFlag(projectId, baseDir);
      }
    });
    const url = `http://127.0.0.1:${port}/`;
    if (!(await waitForHttp(url))) {
      child.kill();
      return { ok: false, reason: "spawn-failed", detail: "visualization server did not come up" };
    }
    const timer = setTimeout(() => {
      logger.info({ projectId }, "graph viz idle-stop");
      void stopViz(projectId, baseDir);
    }, IDLE_STOP_MS);
    timer.unref();
    running.set(projectId, { child, port, startedAt: new Date().toISOString(), timer });
    logger.info({ projectId, port }, "graph viz launched");
    return { ok: true, url };
  } catch (err) {
    return { ok: false, reason: "spawn-failed", detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function stopViz(projectId: string, baseDir = config.dataDir): Promise<void> {
  const entry = running.get(projectId);
  if (!entry) return;
  running.delete(projectId);
  clearTimeout(entry.timer);
  await new Promise<void>((resolve) => {
    const force = setTimeout(() => {
      entry.child.kill();
      resolve();
    }, 5_000);
    entry.child.on("exit", () => {
      clearTimeout(force);
      resolve();
    });
    entry.child.stdin?.end(); // EOF → clean exit (spike ⑥)
  });
  resetUiFlag(projectId, baseDir);
}

export async function stopAllViz(baseDir = config.dataDir): Promise<void> {
  await Promise.all([...running.keys()].map((id) => stopViz(id, baseDir)));
}
