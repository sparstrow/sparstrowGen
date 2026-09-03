import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These exist because the thing they cover was missing for months in a way no
 * test could have caught: `sparstrow:claim-machine` was a complete, working
 * handler that nothing ever called. Every part passed; the composition did not
 * exist. So what is pinned here is the *trigger* — that a claim happens at all,
 * and under which conditions — not the endpoint, which Phase 4 proved live.
 */

const coreFetch = vi.fn();
const probeHealth = vi.fn();
const readToken = vi.fn();

vi.mock("./core-client", () => ({ coreFetch: (...a: unknown[]) => coreFetch(...a) }));
vi.mock("./service-manager", () => ({ probeHealth: (...a: unknown[]) => probeHealth(...a) }));
vi.mock("./session", () => ({ readToken: () => readToken() }));

const { claimThisComputer, setClaimListener } = await import("./claim");

function jsonRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  setClaimListener(() => {});
});

/** Runs the claim while letting its internal backoff timers fire. */
async function run(reason = "test") {
  const promise = claimThisComputer(reason);
  await vi.runAllTimersAsync();
  return promise;
}

describe("claimThisComputer", () => {
  it("claims once the runtime is healthy", async () => {
    readToken.mockReturnValue("pat_abc");
    probeHealth.mockResolvedValue(true);
    coreFetch.mockResolvedValue(jsonRes(200, { machineId: "mach_1", workspaces: 2 }));

    await expect(run()).resolves.toEqual({ ok: true, machineId: "mach_1", workspaces: 2 });
    expect(coreFetch).toHaveBeenCalledWith(
      "/system/cloud-token",
      expect.objectContaining({ method: "POST", body: { token: "pat_abc" } }),
    );
  });

  it("does nothing, and reports no error, when signed out", async () => {
    // Signed out is a normal state, not a fault. The sign-in flow calls this
    // again the moment it stops being true, so a claim here would be noise.
    readToken.mockReturnValue(null);

    await expect(run()).resolves.toEqual({ ok: false, error: "not signed in" });
    expect(probeHealth).not.toHaveBeenCalled();
    expect(coreFetch).not.toHaveBeenCalled();
  });

  it("waits for a runtime that is not up yet, rather than giving up on it", async () => {
    // The window and the runtime now start together, so at launch this races a
    // service that is usually seconds from healthy. Failing fast here would
    // fail on nearly every cold start.
    readToken.mockReturnValue("pat_abc");
    probeHealth
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    coreFetch.mockResolvedValue(jsonRes(200, { machineId: "mach_1", workspaces: 1 }));

    await expect(run()).resolves.toMatchObject({ ok: true });
    expect(probeHealth).toHaveBeenCalledTimes(3);
    expect(coreFetch).toHaveBeenCalledTimes(1);
  });

  it("stops on a refusal instead of retrying it for a minute", async () => {
    // A 400 is an answer. Retrying it on the poll interval would turn one clear
    // failure into thirty identical log lines and a 60-second wait for a result
    // that was known immediately.
    readToken.mockReturnValue("pat_abc");
    probeHealth.mockResolvedValue(true);
    coreFetch.mockResolvedValue(jsonRes(400, { error: "a token is required" }));

    await expect(run()).resolves.toEqual({ ok: false, error: "a token is required" });
    expect(coreFetch).toHaveBeenCalledTimes(1);
  });

  it("notifies the window so a list fetched too early gets refetched", async () => {
    // At launch the window renders before the claim finishes. Without this the
    // machine list shows "No machines yet" and keeps saying it — correctly,
    // about data fetched a second too early.
    readToken.mockReturnValue("pat_abc");
    probeHealth.mockResolvedValue(true);
    coreFetch.mockResolvedValue(jsonRes(200, { machineId: "mach_1", workspaces: 1 }));
    const listener = vi.fn();
    setClaimListener(listener);

    await run();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify the window when the claim failed", async () => {
    readToken.mockReturnValue("pat_abc");
    probeHealth.mockResolvedValue(true);
    coreFetch.mockRejectedValue(new Error("connection refused"));
    const listener = vi.fn();
    setClaimListener(listener);

    await expect(run()).resolves.toEqual({ ok: false, error: "connection refused" });
    expect(listener).not.toHaveBeenCalled();
  });
});
