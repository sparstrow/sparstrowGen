import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT_INTERVAL_MS } from "@sparstrow/shared";
import { config } from "../config.js";
import { invalidatePairingCache, saveConnection } from "./client.js";
import { declareDraining, startHeartbeat, stopHeartbeat } from "./heartbeat.js";

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("heartbeat", () => {
  let dir: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;

  beforeEach(() => {
    vi.useFakeTimers();
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-hb-"));
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
  });

  afterEach(() => {
    stopHeartbeat();
    vi.useRealTimers();
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
  });

  it("does not call the cloud on an unpaired machine", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    startHeartbeat();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("beats immediately and then on the interval", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));

    startHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops permanently once the pairing is revoked", async () => {
    // Retrying a revocation the owner performed deliberately turns it into a
    // request loop, and this token is never getting back in.
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(403, { reason: "revoked" }));

    startHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    const callsAtRevocation = fetchMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(callsAtRevocation);
  });

  it("keeps trying while the network is down", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    startHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    const afterFirst = fetchMock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it("is idempotent — starting twice does not double the beat rate", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));

    startHeartbeat();
    startHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("declareDraining", () => {
    it("tells the cloud, so a clean stop is not mistaken for a crash", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));

      await declareDraining();
      const call = fetchMock.mock.calls.at(-1)!;
      expect(String(call[0])).toContain("/api/daemon/status");
      expect(JSON.parse(String(call[1]?.body))).toEqual({ status: "draining" });
    });

    it("stops the heartbeat so nothing resurrects the machine after it declares", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));
      startHeartbeat();
      await vi.advanceTimersByTimeAsync(0);

      await declareDraining();
      const afterDrain = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
      expect(fetchMock.mock.calls.length).toBe(afterDrain);
    });

    it("never throws, even with the network gone", async () => {
      // This runs inside shutdown. A rejection here would be the last thing in
      // the log, and would look like the cause of a failed shutdown.
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      await expect(declareDraining()).resolves.toBeUndefined();
    });

    it("is a no-op on an unpaired machine", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      await declareDraining();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
