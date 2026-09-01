import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { readChannelConfig, type ChannelConfig } from "./channel";

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
  /** cwd for the core process — its deployed package dir (node_modules beside it). */
  coreCwd: string;
  /** Bundled plain-Node runtime (never Electron-as-Node: native-module ABI). */
  nodeBin: string;
  /** Supervisor log dir (lives under dataDir so it survives updates). */
  logDir: string;
  /** Bundled Next.js standalone entry. */
  webEntry: string;
  /** cwd for the Next.js standalone server. */
  webCwd: string;
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
    coreCwd,
    nodeBin: path.join(res, "node-runtime", process.platform === "win32" ? "node.exe" : "node"),
    logDir: path.join(userData, "data", "logs"),
    webEntry: path.join(res, "web", "apps", "web", "server.js"),
    webCwd: path.join(res, "web", "apps", "web"),
    channel,
  };
  process.env.SPARSTROW_PACKAGED = "1";
  // `??=` so an explicit override (e.g. pointing a packaged build at a test
  // data dir) still wins over the defaults.
  process.env.SPARSTROW_DATA_DIR ??= paths.dataDir;
  process.env.SPARSTROW_VAULT ??= paths.vaultPath;
  process.env.SPARSTROW_MEMORY_MCP ??= path.join(res, "memory-mcp", "index.cjs");
  process.env.SPARSTROW_MEMORY_CLI ??= path.join(res, "memory-cli", "index.cjs");
  process.env.SPARSTROW_NODE ??= paths.nodeBin;
  // The daemon reads SPARSTROW_CLOUD_URL itself (packages/core/src/config.ts);
  // `??=` here means an operator's own override — per
  // doc/runbooks/deploy-web-app.md — still wins over this install's baked
  // channel target.
  if (channel) process.env.SPARSTROW_CLOUD_URL ??= channel.cloudUrl;
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
