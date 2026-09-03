import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { readChannelConfig, type ChannelConfig } from "./channel";
import { portsForChannel, setPorts } from "./ports";

/**
 * 0004 Phase 0 — the three-locations separation. In packaged mode every data
 * path points at a persistent per-user dir (userData) and every code/resource
 * path points inside the installed app (resourcesPath). The dev repo is never
 * referenced: merging to `main` cannot touch the running process or its data.
 */
export interface PackagedPaths {
  /** Persistent per-user data root (DB, tmp, logs, models, token). */
  dataDir: string;
  /** Persistent memory vault. */
  vaultPath: string;
  /** Bundled core entry (built JS, not tsx). */
  coreEntry: string;
  /** The API server bundle, supervised alongside the daemon (G-67). */
  serverEntry: string;
  /** cwd for the core process — its deployed package dir (node_modules beside it). */
  coreCwd: string;
  /**
   * Bundled plain-Node runtime — never Electron-as-Node.
   *
   * The daemon loads four native addons (`better-sqlite3`, plus `node-pty`,
   * `fastembed` and `sqlite-vec` from the parked subsystems), and a native
   * addon is compiled for one Node ABI. Electron's differs, so the daemon gets
   * its own interpreter. See `G-64` for what has to happen before this can go.
   */
  nodeBin: string;
  /** Supervisor log dir (lives under dataDir so it survives updates). */
  logDir: string;
  /** This install's baked channel config (stable vs. staging), or `null` if unresolved. See `channel.ts`. */
  channel: ChannelConfig | null;
}

/**
 * When running packaged, export the SPARSTROW_* env the core reads
 * (config.ts already honors every one of these — no core logic change) and
 * return the spawn paths for the ServiceManager. Returns null in dev, where
 * the repo layout is used unchanged.
 */
export function applyPackagedEnv(): PackagedPaths | null {
  if (!app.isPackaged) return null;
  const userData = app.getPath("userData");
  const res = process.resourcesPath;
  const coreCwd = path.join(res, "core");
  const channel = readChannelConfig(res);
  const paths: PackagedPaths = {
    dataDir: path.join(userData, "data"),
    vaultPath: path.join(userData, "memory"),
    coreEntry: path.join(coreCwd, "dist", "index.js"),
    serverEntry: path.join(coreCwd, "dist", "server.js"),
    coreCwd,
    nodeBin: path.join(res, "node-runtime", process.platform === "win32" ? "node.exe" : "node"),
    logDir: path.join(userData, "data", "logs"),
    channel,
  };
  /**
   * This install's ports, BEFORE anything resolves a URL from them.
   *
   * `applyPackagedEnv()` is called on `main.ts` line 52, after every import has
   * run — which is precisely why `ports.ts` resolves lazily and takes a setter
   * instead of reading an env var. Two installs sharing a port is not a
   * cosmetic clash: the second adopts the first one's server and starts
   * operating on its data.
   *
   * A `channel.json` from an older build carries no ports, so fall back to the
   * table for its channel, and to stable's if even the channel is unreadable —
   * an install that cannot identify itself must keep the behaviour it had.
   */
  const channelPorts = portsForChannel(channel?.channel);
  setPorts({
    core: channel?.corePort ?? channelPorts.core,
    server: channel?.serverPort ?? channelPorts.server,
  });

  process.env.SPARSTROW_PACKAGED = "1";
  // `??=` so an explicit override (e.g. pointing a packaged build at a test
  // data dir) still wins over the defaults.
  process.env.SPARSTROW_DATA_DIR ??= paths.dataDir;
  process.env.SPARSTROW_VAULT ??= paths.vaultPath;
  process.env.SPARSTROW_MEMORY_MCP ??= path.join(res, "memory-mcp", "index.cjs");
  process.env.SPARSTROW_MEMORY_CLI ??= path.join(res, "memory-cli", "index.cjs");
  process.env.SPARSTROW_NODE ??= paths.nodeBin;
  // `channel.cloudUrl` is NOT applied here any more, and the field is dead
  // alongside `appUrl`.
  //
  // It named `https://sparstrow.com`, which answers 402 to everything, so every
  // packaged install pointed its daemon at a host that could not register it —
  // half of `G-67`. Under `OQ-9`'s answer the daemon talks to THIS machine's
  // own `server/`, and `main.ts` sets `SPARSTROW_CLOUD_URL` from the supervisor
  // that actually owns that URL. Do not wire this back up; when hosting arrives
  // (`D-40`) it comes back as configuration, not as a baked constant.
  return paths;
}

/**
 * Restore the core's `node_modules` from the shipped `vendor` dir. The packaging
 * step renames deps to `vendor` because electron-builder refuses to copy a dir
 * named `node_modules` (see prepare-resources.mjs); Node still needs a real
 * `node_modules` beside dist/ to resolve them. A directory junction is instant
 * and needs no admin; the per-user install dir is writable. Idempotent, and
 * re-runs every launch because an update replaces the install dir wholesale
 * (fresh `vendor`, no `node_modules`). Falls back to a copy if the junction is
 * refused (e.g. a locked-down per-machine install on a different volume).
 */
export function ensureCoreNodeModules(paths: PackagedPaths): void {
  const nm = path.join(paths.coreCwd, "node_modules");
  const vendor = path.join(paths.coreCwd, "vendor");
  if (fs.existsSync(nm) || !fs.existsSync(vendor)) return;
  try {
    fs.symlinkSync(vendor, nm, "junction");
  } catch {
    fs.cpSync(vendor, nm, { recursive: true });
  }
}
