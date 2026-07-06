import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { GraphEngineStatus } from "@sparstrow/shared";
import { bus } from "../events/bus.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * P5 §1 — code-graph engine binary manager (codebase-memory-mcp).
 *
 * Supply-chain posture: the expected SHA-256 for every release asset is PINNED
 * IN SOURCE below and reviewed at upgrade PRs. checksums.txt from the release
 * itself is never trusted at install time — a compromised release would
 * compromise its own checksums file. A download that does not hash to the pin
 * is HARD-REFUSED and deleted.
 *
 * Install is atomic: download → verify → extract to a temp dir → rename into
 * place → post-install health spawn → THEN write the completion marker. A dir
 * without the marker (crash mid-install) is treated as not installed and
 * overwritten on the next attempt.
 *
 * Windows realities (spike-verified 2026-07-05): assets are .zip; extraction
 * must use System32 tar.exe (bsdtar — handles zip), NOT Git-Bash GNU tar; the
 * exe is not Authenticode-signed, so Defender's first-scan can hold the file —
 * the health spawn gets a generous timeout and a failure degrades cleanly.
 */

export const GRAPH_ENGINE_VERSION = "0.8.1";
export const GRAPH_ENGINE_EXE_NAME =
  process.platform === "win32" ? "codebase-memory-mcp.exe" : "codebase-memory-mcp";

const RELEASE_BASE = `https://github.com/DeusData/codebase-memory-mcp/releases/download/v${GRAPH_ENGINE_VERSION}`;
const MARKER = ".install-complete";

/** `std` = query engine (no UI/HTTP code in the child); `ui` = 3D visualization variant. */
export type EngineVariant = "std" | "ui";

export interface AssetPin {
  asset: string;
  sha256: string;
}

/**
 * v0.8.1 pins. The two Windows hashes were additionally verified against the
 * exact artifacts exercised during the T1 spike on this machine.
 */
const PINNED_ASSETS: Record<string, Record<EngineVariant, AssetPin>> = {
  "win32-x64": {
    std: {
      asset: "codebase-memory-mcp-windows-amd64.zip",
      sha256: "a602ad090ed3f49d86c55472f73f27ad7055222806a82358f2e08513e027f00f",
    },
    ui: {
      asset: "codebase-memory-mcp-ui-windows-amd64.zip",
      sha256: "3219a73ef6e7907efcfa070cef88e39d2a020b6ebd98fc6a8963f704ac7a72c7",
    },
  },
  "darwin-arm64": {
    std: {
      asset: "codebase-memory-mcp-darwin-arm64.tar.gz",
      sha256: "fbd047509852021b5446a11141bcb0a3d1dcaebf6e5112460960f29f052c1c58",
    },
    ui: {
      asset: "codebase-memory-mcp-ui-darwin-arm64.tar.gz",
      sha256: "131f7de0a9691974a656502443f86c7c29cb89e62ddc43c9553134a5075b52fb",
    },
  },
  "darwin-x64": {
    std: {
      asset: "codebase-memory-mcp-darwin-amd64.tar.gz",
      sha256: "fb62da3016ea12b948351208759b5c083fb1446cf6e78d6db8b7cd28fe86fd54",
    },
    ui: {
      asset: "codebase-memory-mcp-ui-darwin-amd64.tar.gz",
      sha256: "3377e494540956bb6f9f8474efe7c7d675f7bc64ab838c96e0a63ffd74338794",
    },
  },
  "linux-x64": {
    std: {
      asset: "codebase-memory-mcp-linux-amd64.tar.gz",
      sha256: "dbd3b92ea870ef240b63059f26bda15015f76ef9978931bebc3a0f9d09470973",
    },
    ui: {
      asset: "codebase-memory-mcp-ui-linux-amd64.tar.gz",
      sha256: "1fe5efaa60bf05a04e7098e8bb491918a6de3f33dc95b77e922e023e9700d175",
    },
  },
  "linux-arm64": {
    std: {
      asset: "codebase-memory-mcp-linux-arm64.tar.gz",
      sha256: "d2f842d1365da5c35d9c5796f57a821c9745267350994346735e1e6e04d46091",
    },
    ui: {
      asset: "codebase-memory-mcp-ui-linux-arm64.tar.gz",
      sha256: "2cc5325d449f877dc4ec912fe893122c4d6d85fc1b7d4c97c6236a66dfd32aa4",
    },
  },
};

function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

function systemTarPath(): string {
  // Git-Bash puts GNU tar on PATH, which cannot read zip — always use bsdtar.
  if (process.platform === "win32") {
    return path.join(process.env.SYSTEMROOT ?? "C:\\Windows", "System32", "tar.exe");
  }
  return "tar";
}

function engineRootDir(baseDir: string): string {
  return path.join(baseDir, "bin", "codebase-memory-mcp");
}
function variantDir(baseDir: string, version: string, variant: EngineVariant): string {
  return path.join(engineRootDir(baseDir), version, variant);
}
function markerPath(dir: string): string {
  return path.join(dir, MARKER);
}

/**
 * The explicit-allowlist child env every engine spawn uses. Never spread
 * process.env into the child (P1 exfiltration lesson — run-manager's legacy
 * spread is scheduled for its P7 fix; this module never copies it).
 */
export function graphChildEnv(storeDir: string): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows",
    TEMP: process.env.TEMP ?? "",
    TMP: process.env.TMP ?? "",
    CBM_CACHE_DIR: storeDir,
  };
}

function variantInstalled(baseDir: string, variant: EngineVariant): boolean {
  const dir = variantDir(baseDir, GRAPH_ENGINE_VERSION, variant);
  return fs.existsSync(markerPath(dir)) && fs.existsSync(path.join(dir, GRAPH_ENGINE_EXE_NAME));
}

/** Marker-gated exe path for a variant; null when not (fully) installed. */
export function engineExePath(variant: EngineVariant = "std", baseDir = config.dataDir): string | null {
  const override = process.env.SPARSTROW_GRAPH_ENGINE_EXE;
  if (variant === "std" && override && fs.existsSync(override)) return override;
  const dir = variantDir(baseDir, GRAPH_ENGINE_VERSION, variant);
  return variantInstalled(baseDir, variant) ? path.join(dir, GRAPH_ENGINE_EXE_NAME) : null;
}

export function getEngineStatus(baseDir = config.dataDir): GraphEngineStatus {
  const override = process.env.SPARSTROW_GRAPH_ENGINE_EXE;
  if (override && fs.existsSync(override)) {
    return {
      state: "installed",
      installed: true,
      pinnedVersion: GRAPH_ENGINE_VERSION,
      variants: { std: true, ui: false },
      exePath: override,
      detail: "external binary via SPARSTROW_GRAPH_ENGINE_EXE",
    };
  }
  const std = variantInstalled(baseDir, "std");
  const ui = variantInstalled(baseDir, "ui");
  return {
    state: std ? "installed" : "not-installed",
    installed: std,
    pinnedVersion: GRAPH_ENGINE_VERSION,
    variants: { std, ui },
    exePath: std ? path.join(variantDir(baseDir, GRAPH_ENGINE_VERSION, "std"), GRAPH_ENGINE_EXE_NAME) : null,
    detail: null,
  };
}

function publishStatus(baseDir: string, state: GraphEngineStatus["state"], detail: string | null): void {
  const status: GraphEngineStatus = { ...getEngineStatus(baseDir), state, detail };
  bus.publish({ type: "graph.engine.status", status });
}

export type InstallErrorKind =
  | "unsupported-platform"
  | "download-failed"
  | "checksum-mismatch"
  | "extract-failed"
  | "health-failed";

export interface InstallResult {
  ok: boolean;
  exePath?: string;
  error?: { kind: InstallErrorKind; message: string };
}

export interface HealthResult {
  ok: boolean;
  detail: string | null;
}

export interface InstallOptions {
  variant?: EngineVariant;
  baseDir?: string;
  /** Test seams — production callers pass none of these. */
  fetchImpl?: typeof fetch;
  pins?: Record<EngineVariant, AssetPin>;
  releaseBase?: string;
  tarPath?: string;
  healthCheck?: (exePath: string) => Promise<HealthResult>;
  platformKeyOverride?: string;
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], timeoutMs: number, env?: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env },
      (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
  });
}

/**
 * Defender's real-time scan can hold a freshly extracted unsigned exe (EBUSY)
 * or block it outright — the generous timeout absorbs the scan; a hard block
 * degrades to `health-failed` and the marker is never written.
 */
async function defaultHealthCheck(exePath: string): Promise<HealthResult> {
  const tmpStore = fs.mkdtempSync(path.join(path.dirname(exePath), "health-"));
  try {
    const res = await run(exePath, ["--version"], 120_000, graphChildEnv(tmpStore));
    if (!res.ok) {
      return { ok: false, detail: `--version failed: ${res.stderr.slice(0, 200) || "no output"}` };
    }
    const out = `${res.stdout}\n${res.stderr}`;
    if (!/\d+\.\d+\.\d+/.test(out)) {
      return { ok: false, detail: `unexpected --version output: ${out.slice(0, 120)}` };
    }
    return { ok: true, detail: null };
  } finally {
    fs.rmSync(tmpStore, { recursive: true, force: true });
  }
}

function cleanupSupersededVersions(baseDir: string, keepVersion: string): void {
  const root = engineRootDir(baseDir);
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== keepVersion) {
      fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
      logger.info({ version: entry.name }, "graph-engine: removed superseded version");
    }
  }
}

export async function installEngine(opts: InstallOptions = {}): Promise<InstallResult> {
  const variant = opts.variant ?? "std";
  const baseDir = opts.baseDir ?? config.dataDir;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const key = opts.platformKeyOverride ?? platformKey();
  const pins = opts.pins ?? PINNED_ASSETS[key];
  const health = opts.healthCheck ?? defaultHealthCheck;

  const fail = (kind: InstallErrorKind, message: string): InstallResult => {
    logger.warn({ kind, message, variant }, "graph-engine: install failed");
    publishStatus(baseDir, "error", message);
    return { ok: false, error: { kind, message } };
  };

  if (!pins) {
    return fail("unsupported-platform", `no pinned engine build for ${key}`);
  }
  const pin = pins[variant];

  const workDir = path.join(baseDir, "tmp");
  fs.mkdirSync(workDir, { recursive: true });
  const archivePath = path.join(workDir, `graph-engine-${crypto.randomBytes(6).toString("hex")}-${pin.asset}`);
  const extractDir = path.join(workDir, `graph-engine-extract-${crypto.randomBytes(6).toString("hex")}`);

  try {
    publishStatus(baseDir, "installing", `downloading ${pin.asset}`);
    const url = `${opts.releaseBase ?? RELEASE_BASE}/${pin.asset}`;
    let body: Buffer;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) return fail("download-failed", `HTTP ${res.status} for ${pin.asset}`);
      body = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      return fail("download-failed", `network error: ${err instanceof Error ? err.message : String(err)}`);
    }
    fs.writeFileSync(archivePath, body);

    publishStatus(baseDir, "verifying", `verifying SHA-256 of ${pin.asset}`);
    const actual = sha256File(archivePath);
    if (actual !== pin.sha256) {
      fs.rmSync(archivePath, { force: true });
      // HARD REFUSE — never extract or execute unverified bytes.
      return fail(
        "checksum-mismatch",
        `SHA-256 mismatch for ${pin.asset}: expected ${pin.sha256}, got ${actual}. Refusing to install.`,
      );
    }

    fs.mkdirSync(extractDir, { recursive: true });
    const tar = opts.tarPath ?? systemTarPath();
    const extracted = await run(tar, ["-xf", archivePath, "-C", extractDir], 120_000);
    if (!extracted.ok) {
      return fail("extract-failed", `tar extraction failed: ${extracted.stderr.slice(0, 200) || "unknown error"}`);
    }
    const extractedExe = path.join(extractDir, GRAPH_ENGINE_EXE_NAME);
    if (!fs.existsSync(extractedExe)) {
      return fail("extract-failed", `archive did not contain ${GRAPH_ENGINE_EXE_NAME}`);
    }

    const finalDir = variantDir(baseDir, GRAPH_ENGINE_VERSION, variant);
    fs.mkdirSync(path.dirname(finalDir), { recursive: true });
    // A dir without the completion marker is a crashed prior install — replace it.
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.renameSync(extractDir, finalDir);

    const exePath = path.join(finalDir, GRAPH_ENGINE_EXE_NAME);
    const healthRes = await health(exePath);
    if (!healthRes.ok) {
      // No marker: status stays not-installed; the dir is replaced on retry.
      return fail("health-failed", healthRes.detail ?? "post-install health check failed");
    }

    fs.writeFileSync(markerPath(finalDir), JSON.stringify({ version: GRAPH_ENGINE_VERSION, variant }));
    cleanupSupersededVersions(baseDir, GRAPH_ENGINE_VERSION);
    logger.info({ variant, exePath }, "graph-engine: installed and verified");
    publishStatus(baseDir, "installed", null);
    return { ok: true, exePath };
  } finally {
    fs.rmSync(archivePath, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}
