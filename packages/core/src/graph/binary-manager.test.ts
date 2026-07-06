import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GRAPH_ENGINE_EXE_NAME,
  GRAPH_ENGINE_VERSION,
  engineExePath,
  getEngineStatus,
  graphChildEnv,
  installEngine,
  type AssetPin,
} from "./binary-manager.js";

/**
 * P5 §1 binary-manager tests. No network, no real engine: fetch is injected
 * with a locally built .tar.gz fixture (GNU tar and bsdtar both auto-detect
 * tar.gz with plain `-xf`, so one extraction code path covers CI and Windows).
 */

const okHealth = async () => ({ ok: true, detail: null });

function makeFixtureArchive(dir: string): { archive: string; sha256: string } {
  const src = path.join(dir, "fixture-src");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, GRAPH_ENGINE_EXE_NAME), "not a real exe — health check is stubbed");
  fs.writeFileSync(path.join(src, "LICENSE"), "MIT");
  const archive = path.join(dir, "fixture.tar.gz");
  const tar =
    process.platform === "win32"
      ? path.join(process.env.SYSTEMROOT ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  execFileSync(tar, ["-czf", archive, "-C", src, "."]);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  return { archive, sha256 };
}

function fetchServing(archive: string): typeof fetch {
  return (async () => new Response(new Uint8Array(fs.readFileSync(archive)))) as unknown as typeof fetch;
}

function pinsFor(sha256: string): Record<"std" | "ui", AssetPin> {
  return {
    std: { asset: "fixture.tar.gz", sha256 },
    ui: { asset: "fixture.tar.gz", sha256 },
  };
}

describe("graph engine binary-manager (P5 §1)", () => {
  let base: string;
  let fixtures: string;
  let archive: string;
  let sha256: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-base-"));
    fixtures = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-graph-fix-"));
    ({ archive, sha256 } = makeFixtureArchive(fixtures));
  });
  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(fixtures, { recursive: true, force: true });
    delete process.env.SPARSTROW_GRAPH_ENGINE_EXE;
  });

  it("installs atomically: verify → extract → health → marker; status flips installed", async () => {
    // A superseded version dir must be cleaned up after a successful install.
    const stale = path.join(base, "bin", "codebase-memory-mcp", "0.0.1");
    fs.mkdirSync(stale, { recursive: true });

    const res = await installEngine({
      baseDir: base,
      fetchImpl: fetchServing(archive),
      pins: pinsFor(sha256),
      healthCheck: okHealth,
    });
    expect(res.ok).toBe(true);
    expect(res.exePath && fs.existsSync(res.exePath)).toBe(true);

    const status = getEngineStatus(base);
    expect(status.installed).toBe(true);
    expect(status.state).toBe("installed");
    expect(status.variants.std).toBe(true);
    expect(status.pinnedVersion).toBe(GRAPH_ENGINE_VERSION);
    expect(engineExePath("std", base)).toBe(res.exePath);
    expect(fs.existsSync(stale)).toBe(false);
  });

  it("HARD-REFUSES a checksum mismatch: nothing extracted, health never runs", async () => {
    const health = vi.fn(okHealth);
    const res = await installEngine({
      baseDir: base,
      fetchImpl: fetchServing(archive),
      pins: pinsFor("0".repeat(64)), // tampered pin ⇒ downloaded bytes don't match
      healthCheck: health,
    });
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe("checksum-mismatch");
    expect(health).not.toHaveBeenCalled();
    expect(getEngineStatus(base).installed).toBe(false);
    expect(fs.existsSync(path.join(base, "bin", "codebase-memory-mcp", GRAPH_ENGINE_VERSION))).toBe(false);
  });

  it("degrades on download failure (HTTP error and network throw)", async () => {
    const res404 = await installEngine({
      baseDir: base,
      fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
      pins: pinsFor(sha256),
      healthCheck: okHealth,
    });
    expect(res404.ok).toBe(false);
    expect(res404.error?.kind).toBe("download-failed");

    const resNet = await installEngine({
      baseDir: base,
      fetchImpl: (async () => {
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch,
      pins: pinsFor(sha256),
      healthCheck: okHealth,
    });
    expect(resNet.ok).toBe(false);
    expect(resNet.error?.kind).toBe("download-failed");
    expect(resNet.error?.message).toMatch(/ECONNRESET/);
  });

  it("treats a dir without the completion marker as NOT installed, and reinstalls over it", async () => {
    const halfDir = path.join(base, "bin", "codebase-memory-mcp", GRAPH_ENGINE_VERSION, "std");
    fs.mkdirSync(halfDir, { recursive: true });
    fs.writeFileSync(path.join(halfDir, GRAPH_ENGINE_EXE_NAME), "half-extracted from a crash");
    expect(getEngineStatus(base).installed).toBe(false);
    expect(engineExePath("std", base)).toBeNull();

    const res = await installEngine({
      baseDir: base,
      fetchImpl: fetchServing(archive),
      pins: pinsFor(sha256),
      healthCheck: okHealth,
    });
    expect(res.ok).toBe(true);
    expect(getEngineStatus(base).installed).toBe(true);
  });

  it("degrades when tar is unavailable", async () => {
    const res = await installEngine({
      baseDir: base,
      fetchImpl: fetchServing(archive),
      pins: pinsFor(sha256),
      tarPath: path.join(base, "definitely-not-tar.exe"),
      healthCheck: okHealth,
    });
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe("extract-failed");
  });

  it("fails closed when the post-install health check fails: no marker, not installed", async () => {
    const res = await installEngine({
      baseDir: base,
      fetchImpl: fetchServing(archive),
      pins: pinsFor(sha256),
      healthCheck: async () => ({ ok: false, detail: "Defender quarantined the exe" }),
    });
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe("health-failed");
    expect(getEngineStatus(base).installed).toBe(false);
    // Retry after the quarantine clears succeeds over the marker-less dir.
    const retry = await installEngine({
      baseDir: base,
      fetchImpl: fetchServing(archive),
      pins: pinsFor(sha256),
      healthCheck: okHealth,
    });
    expect(retry.ok).toBe(true);
  });

  it("reports unsupported platforms as a typed failure", async () => {
    const res = await installEngine({
      baseDir: base,
      fetchImpl: fetchServing(archive),
      platformKeyOverride: "haiku-os-390x",
      healthCheck: okHealth,
    });
    expect(res.ok).toBe(false);
    expect(res.error?.kind).toBe("unsupported-platform");
  });

  it("honors the SPARSTROW_GRAPH_ENGINE_EXE escape hatch for std", () => {
    const external = path.join(fixtures, GRAPH_ENGINE_EXE_NAME);
    fs.writeFileSync(external, "external install");
    process.env.SPARSTROW_GRAPH_ENGINE_EXE = external;
    const status = getEngineStatus(base);
    expect(status.installed).toBe(true);
    expect(status.exePath).toBe(external);
    expect(engineExePath("std", base)).toBe(external);
  });

  it("child env is an explicit allowlist — no process.env spread", () => {
    process.env.SPARSTROW_SECRET_CANARY = "must-not-leak";
    try {
      const env = graphChildEnv("C:/some/store");
      expect(env.CBM_CACHE_DIR).toBe("C:/some/store");
      expect(Object.keys(env).sort()).toEqual(["CBM_CACHE_DIR", "PATH", "SYSTEMROOT", "TEMP", "TMP"]);
      expect("SPARSTROW_SECRET_CANARY" in env).toBe(false);
    } finally {
      delete process.env.SPARSTROW_SECRET_CANARY;
    }
  });
});
