import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient } from "@supabase/realtime-js";
import { config } from "../config.js";
import { invalidatePairingCache, savePairing } from "./client.js";
import { onMachineRequest, startRealtimeConnection, stopRealtimeConnection } from "./realtime.js";

vi.mock("@supabase/realtime-js", () => ({ RealtimeClient: vi.fn() }));

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function credentialBody(expiresInMs = 600_000) {
  return {
    token: "rt-token",
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
  };
}

function makeFakeChannel() {
  const statusCbs: Array<(status: string, err?: Error) => void> = [];
  const broadcastHandlers = new Map<string, (arg: { payload: unknown }) => void>();
  const channel = {
    on: vi.fn((_type: string, filter: { event: string }, cb: (arg: { payload: unknown }) => void) => {
      broadcastHandlers.set(filter.event, cb);
      return channel;
    }),
    subscribe: vi.fn((cb?: (status: string, err?: Error) => void) => {
      if (cb) statusCbs.push(cb);
      return channel;
    }),
    send: vi.fn().mockResolvedValue("ok"),
    unsubscribe: vi.fn().mockResolvedValue("ok"),
    emitStatus: (status: string, err?: Error) => statusCbs.forEach((cb) => cb(status, err)),
    emitBroadcast: (event: string, payload: unknown) => broadcastHandlers.get(event)?.({ payload }),
  };
  return channel;
}

function makeFakeClient() {
  const client = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    setAuth: vi.fn().mockResolvedValue(undefined),
    channel: vi.fn(() => makeFakeChannel()),
  };
  return client;
}

describe("realtime connection", () => {
  let dir: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;
  let createdClients: ReturnType<typeof makeFakeClient>[];

  beforeEach(() => {
    vi.useFakeTimers();
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-rt-"));
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();

    createdClients = [];
    vi.mocked(RealtimeClient).mockImplementation(() => {
      const c = makeFakeClient();
      createdClients.push(c);
      return c as unknown as RealtimeClient;
    });
  });

  afterEach(() => {
    stopRealtimeConnection();
    vi.useRealTimers();
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
  });

  it("does not connect on an unpaired machine", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    startRealtimeConnection();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(RealtimeClient).not.toHaveBeenCalled();
  });

  it("refreshes before the credential expires, without tearing the connection down", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    // A fresh Response per call -- its body can only be read once, and a
    // shared instance would make the SECOND (refresh) mint silently fail to
    // parse, masking exactly the behaviour this test exists to prove.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(200, credentialBody(10_000)));

    startRealtimeConnection();
    await vi.advanceTimersByTimeAsync(0);
    expect(createdClients).toHaveLength(1);
    const client = createdClients[0]!;
    expect(client.setAuth).not.toHaveBeenCalled();

    // 80% of 10s = 8s.
    await vi.advanceTimersByTimeAsync(8_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(client.setAuth).toHaveBeenCalledWith("rt-token");
    // Same client instance -- a refresh must never reconnect.
    expect(RealtimeClient).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("backs off on repeated failure, retrying with increasing delay rather than a tight loop", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    startRealtimeConnection();
    await vi.advanceTimersByTimeAsync(0);
    const afterFirst = fetchMock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);
    expect(RealtimeClient).not.toHaveBeenCalled();

    // First backoff (1s) fires another attempt; a tight loop would have
    // already made many more calls than one by 1s if unbacked-off.
    await vi.advanceTimersByTimeAsync(1_000);
    const afterOneBackoff = fetchMock.mock.calls.length;
    expect(afterOneBackoff).toBeGreaterThan(afterFirst);

    // Second backoff is longer (2s); confirm the loop keeps retrying at all
    // rather than giving up after one failure.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterOneBackoff);
  });

  it("stops for good once the pairing is revoked, without retrying", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(403, { reason: "revoked", error: "revoked" }));

    startRealtimeConnection();
    await vi.advanceTimersByTimeAsync(0);
    const callsAtRevocation = fetchMock.mock.calls.length;
    expect(RealtimeClient).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock.mock.calls.length).toBe(callsAtRevocation);
  });

  it("a handler that throws is caught, not left to crash the channel callback", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, credentialBody()));

    onMachineRequest(() => {
      throw new Error("boom");
    });
    startRealtimeConnection();
    await vi.advanceTimersByTimeAsync(0);

    const channel = createdClients[0]!.channel.mock.results[0]!.value as ReturnType<typeof makeFakeChannel>;
    expect(() => channel.emitBroadcast("request", { requestId: "r1", kind: "terminal.list" })).not.toThrow();
  });

  it("is idempotent — starting twice does not open a second connection", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, credentialBody()));

    startRealtimeConnection();
    startRealtimeConnection();
    await vi.advanceTimersByTimeAsync(0);
    expect(RealtimeClient).toHaveBeenCalledTimes(1);
  });
});
