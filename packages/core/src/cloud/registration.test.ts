import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config.js";
import * as providers from "../providers/index.js";
import type { ModelProvider } from "../providers/types.js";
import { invalidatePairingCache, savePairing } from "./client.js";
import { describeMachine, probeCapabilities, register } from "./registration.js";

function fakeProvider(id: string, health: { ok: boolean } | "hang" | "throw"): ModelProvider {
  return {
    id,
    kind: "cli",
    healthCheck: () => {
      if (health === "hang") return new Promise(() => {});
      if (health === "throw") return Promise.reject(new Error("boom"));
      return Promise.resolve({
        id,
        ok: health.ok,
        version: null,
        authenticated: null,
        detail: null,
      });
    },
  } as unknown as ModelProvider;
}

describe("capability probe", () => {
  let dir: string;
  let originalSecretsDir: string;

  beforeEach(() => {
    originalSecretsDir = config.secretsDir;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-reg-"));
    config.secretsDir = dir;
    invalidatePairingCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
  });

  it("reports only what the machine can actually run", async () => {
    // The bug this exists to prevent: reporting the static registry would
    // claim a provider whose binary is absent, and M4 dispatches on this.
    vi.spyOn(providers, "listProviders").mockReturnValue([
      fakeProvider("claude-code", { ok: true }),
      fakeProvider("antigravity", { ok: false }),
      fakeProvider("ollama", { ok: true }),
    ]);

    await expect(probeCapabilities()).resolves.toEqual(["claude-code", "ollama"]);
  });

  it("treats a probe that throws as unavailable, not as a failure", async () => {
    vi.spyOn(providers, "listProviders").mockReturnValue([
      fakeProvider("claude-code", { ok: true }),
      fakeProvider("antigravity", "throw"),
    ]);

    await expect(probeCapabilities()).resolves.toEqual(["claude-code"]);
  });

  it("does not wait forever on a probe that never settles", async () => {
    // A configured binary path on a disconnected network drive blocks in
    // uninterruptible I/O, where execFile's own timeout cannot help. Boot must
    // not hang on it.
    vi.useFakeTimers();
    vi.spyOn(providers, "listProviders").mockReturnValue([
      fakeProvider("claude-code", { ok: true }),
      fakeProvider("antigravity", "hang"),
    ]);

    const pending = probeCapabilities();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual(["claude-code"]);
    vi.useRealTimers();
  });

  it("returns an empty list rather than throwing when nothing is available", async () => {
    vi.spyOn(providers, "listProviders").mockReturnValue([
      fakeProvider("claude-code", { ok: false }),
    ]);
    await expect(probeCapabilities()).resolves.toEqual([]);
  });
});

describe("describeMachine", () => {
  it("reports hostname, platform and version", async () => {
    vi.spyOn(providers, "listProviders").mockReturnValue([]);
    const identity = await describeMachine();
    expect(identity.hostname).toBe(os.hostname());
    expect(identity.os).toBe(process.platform);
    expect(identity.coreVersion).toBe("0.1.0");
  });

  it("leaves name null when not supplied, so the server picks the hostname", async () => {
    vi.spyOn(providers, "listProviders").mockReturnValue([]);
    await expect(describeMachine()).resolves.toMatchObject({ name: null });
    await expect(describeMachine("   ")).resolves.toMatchObject({ name: null });
    await expect(describeMachine(" desk ")).resolves.toMatchObject({ name: "desk" });
  });
});

describe("register", () => {
  let dir: string;
  let originalSecretsDir: string;

  beforeEach(() => {
    originalSecretsDir = config.secretsDir;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-reg2-"));
    config.secretsDir = dir;
    invalidatePairingCache();
    vi.spyOn(providers, "listProviders").mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
  });

  it("does nothing on an unpaired machine", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(register()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends a name, so the owner's chosen label survives a reboot", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await register();
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.name).toBeNull();
  });

  it("swallows a cloud failure rather than taking startup with it", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(register()).resolves.toBe(false);
  });
});
