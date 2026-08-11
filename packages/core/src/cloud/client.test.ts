import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config.js";
import {
  CloudAuthError,
  CloudRequestError,
  cloudFetch,
  clearPairing,
  getRuntimeId,
  invalidatePairingCache,
  isPaired,
  savePairing,
} from "./client.js";

const TOKEN = "test-daemon-token-abcdefghijklmnop";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("cloud client", () => {
  let dir: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;

  beforeEach(() => {
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-cloud-"));
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
  });

  describe("pairing state", () => {
    it("reports unpaired when nothing is stored", () => {
      expect(isPaired()).toBe(false);
      expect(getRuntimeId()).toBeNull();
    });

    it("round-trips a pairing", () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      invalidatePairingCache();
      expect(isPaired()).toBe(true);
      expect(getRuntimeId()).toBe("rt-1");
    });

    it("treats a half-written pairing as unpaired", () => {
      // A token with no runtime id would authenticate but never identify
      // itself. Reporting it as paired hides the problem behind requests that
      // half-work; reporting unpaired makes `sparstrow pair` the fix.
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      clearPairing();
      savePairing({ token: TOKEN, runtimeId: "", workspaceId: "" });
      invalidatePairingCache();
      expect(isPaired()).toBe(false);
    });

    it("clears every part of the pairing", () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      clearPairing();
      expect(isPaired()).toBe(false);
      expect(getRuntimeId()).toBeNull();
    });
  });

  describe("cloudFetch", () => {
    it("refuses to send an authenticated request while unpaired", async () => {
      await expect(cloudFetch("/heartbeat")).rejects.toBeInstanceOf(CloudAuthError);
    });

    it("attaches the bearer token and returns the parsed body", async () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(200, { ok: true }));

      const result = await cloudFetch<{ ok: boolean }>("/heartbeat");
      expect(result).toEqual({ ok: true });

      const call = fetchMock.mock.calls[0]!;
      expect(call[0]).toBe("http://cloud.test/api/daemon/heartbeat");
      expect((call[1]?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("omits the token for an anonymous call", async () => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(200, { token: "x" }));

      await cloudFetch("/pair", { anonymous: true, body: { code: "T-1" } });
      const headers = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
      expect(headers.authorization).toBeUndefined();
    });

    it("throws CloudAuthError on 401 and does not retry", async () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(401, { reason: "unauthenticated", error: "nope" }));

      await expect(cloudFetch("/heartbeat")).rejects.toMatchObject({
        name: "CloudAuthError",
        revoked: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws CloudAuthError with revoked=true on 403, and does not retry", async () => {
      // Retrying a revocation turns a deliberate owner action into a request
      // loop against the control plane. It will never start working.
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(403, { reason: "revoked", error: "revoked" }));

      await expect(cloudFetch("/heartbeat")).rejects.toMatchObject({ revoked: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("drops the cached token when auth fails", async () => {
      // Holding a rejected token in memory means re-pairing has no effect
      // until the process restarts.
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(403, { error: "revoked" }));
      await expect(cloudFetch("/heartbeat")).rejects.toBeInstanceOf(CloudAuthError);

      // Re-reading picks up whatever is on disk now, not the rejected copy.
      clearPairing();
      expect(isPaired()).toBe(false);
    });

    it("does not retry a 4xx that is not an auth failure", async () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(400, { reason: "invalid_request", error: "bad" }));

      await expect(cloudFetch("/register")).rejects.toMatchObject({
        name: "CloudRequestError",
        status: 400,
        reason: "invalid_request",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries a 5xx and succeeds", async () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(503, {}))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      await expect(cloudFetch("/heartbeat", { retries: 1 })).resolves.toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries a network error and gives up as CloudRequestError", async () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(cloudFetch("/heartbeat", { retries: 1 })).rejects.toBeInstanceOf(
        CloudRequestError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("passes an abort signal so an unreachable host cannot hang forever", async () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(200, {}));

      await cloudFetch("/heartbeat", { timeoutMs: 5_000 });
      expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    });

    it("never puts the token in an error message", async () => {
      savePairing({ token: TOKEN, runtimeId: "rt-1", workspaceId: "ws-1" });
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

      const error = await cloudFetch("/heartbeat", { retries: 0 }).catch((e: unknown) => e);
      expect((error as Error).message).not.toContain(TOKEN);
    });
  });
});
