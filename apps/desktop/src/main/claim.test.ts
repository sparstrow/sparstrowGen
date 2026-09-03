import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These exist because the thing they cover was missing for months in a way no
 * test could have caught: `sparstrow:claim-machine` was a complete, working
 * handler that nothing ever called. Every part passed; the composition did not
 * exist.
 *
 * The first version of these tests then repeated the mistake one layer down.
 * They mocked `probeHealth`, so it returned `true` regardless of its arguments
 * — while the real call passed `null` for the token, and `/system/health` sits
 * behind a bearer-token gate that answers 401 to an unauthenticated probe no
 * matter how healthy the runtime is. The claim could never see a ready runtime.
 * Green tests, and v0.3.1 still showed "No machines yet".
 *
 * **So `coreFetch` is now the ONLY thing mocked here.** That is the point, not
 * a convenience: if a second way to reach the runtime is ever introduced, these
 * tests stop passing rather than mocking the mistake into invisibility. One
 * mocked boundary means one real auth path.
 */

const coreFetch = vi.fn();
const readToken = vi.fn();
const probeServer = vi.fn();

vi.mock("./core-client", () => ({ coreFetch: (...a: unknown[]) => coreFetch(...a) }));
vi.mock("./session", () => ({ readToken: () => readToken() }));
// The claim needs `server/` up as well as the runtime — the runtime receives
// the claim, the server is what it then calls to register. Stubbed as ready by
// default; one test below covers the cold-start race where it is not.
vi.mock("./server-manager", () => ({ probeServer: () => probeServer() }));

const { claimThisComputer, setClaimListener } = await import("./claim");

function jsonRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** The runtime answering "healthy" on the authenticated health route. */
const HEALTHY = jsonRes(200, { ok: true });
/** The runtime running, but refusing us — the 401 that broke v0.3.1. */
const UNAUTHORIZED = jsonRes(401, { error: "unauthorized" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  probeServer.mockResolvedValue(true);
  setClaimListener(() => {});
});

async function run(reason = "test") {
  const promise = claimThisComputer(reason);
  await vi.runAllTimersAsync();
  return promise;
}

describe("claimThisComputer", () => {
  it("checks readiness through the same authenticated path it claims with", async () => {
    // The regression test for v0.3.1. Both calls go through `coreFetch`, which
    // attaches the per-install token itself — so a claim can never authenticate
    // for the check and then fail on the call, or vice versa.
    readToken.mockReturnValue("pat_abc");
    coreFetch
      .mockResolvedValueOnce(HEALTHY)
      .mockResolvedValueOnce(jsonRes(200, { machineId: "mach_1", workspaces: 2 }));

    await expect(run()).resolves.toEqual({ ok: true, machineId: "mach_1", workspaces: 2 });

    expect(coreFetch).toHaveBeenNthCalledWith(1, "/system/health", expect.anything());
    expect(coreFetch).toHaveBeenNthCalledWith(
      2,
      "/system/cloud-token",
      expect.objectContaining({ method: "POST", body: { token: "pat_abc" } }),
    );
  });

  it("treats a 401 from the runtime as not-ready, and keeps waiting", async () => {
    // A runtime that is up but will not talk to us is exactly as useless as one
    // that is down, and it is the state an interrupted update leaves behind: a
    // pre-update runtime holding the port with a credential the new app cannot
    // reproduce. It must not be mistaken for readiness.
    readToken.mockReturnValue("pat_abc");
    coreFetch.mockResolvedValue(UNAUTHORIZED);

    const result = await run();
    expect(result).toEqual({
      ok: false,
      error: "the local runtime and server never both became reachable",
    });
    // Never attempted the claim against a runtime that had already refused it.
    for (const call of coreFetch.mock.calls) expect(call[0]).toBe("/system/health");
  });

  it("waits for server/ too, not just the runtime", async () => {
    // The cold-start race, found by running with nothing pre-started: the
    // runtime comes up first, the claim goes out, and the daemon fails with
    // "Could not reach the control plane" about a server that becomes healthy a
    // second later. Readiness means BOTH.
    readToken.mockReturnValue("pat_abc");
    probeServer.mockResolvedValueOnce(false).mockResolvedValue(true);
    coreFetch
      .mockResolvedValueOnce(HEALTHY)
      .mockResolvedValueOnce(jsonRes(200, { machineId: "mach_1", workspaces: 1 }));

    await expect(run()).resolves.toMatchObject({ ok: true });
    // Nothing was sent while the server was still down.
    expect(coreFetch).toHaveBeenCalledTimes(2);
  });

  it("does nothing, and reports no error, when signed out", async () => {
    readToken.mockReturnValue(null);
    await expect(run()).resolves.toEqual({ ok: false, error: "not signed in" });
    expect(coreFetch).not.toHaveBeenCalled();
  });

  it("waits for a runtime that is not up yet, rather than giving up on it", async () => {
    // The window and the runtime start together, so at launch this races a
    // service seconds from healthy. Failing fast would fail on most cold starts.
    readToken.mockReturnValue("pat_abc");
    coreFetch
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(HEALTHY)
      .mockResolvedValueOnce(jsonRes(200, { machineId: "mach_1", workspaces: 1 }));

    await expect(run()).resolves.toMatchObject({ ok: true });
    expect(coreFetch).toHaveBeenCalledTimes(4);
  });

  it("stops on a refusal instead of retrying it for a minute", async () => {
    // A 400 from the claim is an answer. Retrying it on the poll interval turns
    // one clear failure into thirty identical log lines and a 60-second wait.
    readToken.mockReturnValue("pat_abc");
    coreFetch
      .mockResolvedValueOnce(HEALTHY)
      .mockResolvedValueOnce(jsonRes(400, { error: "a token is required" }));

    await expect(run()).resolves.toEqual({ ok: false, error: "a token is required" });
    expect(coreFetch).toHaveBeenCalledTimes(2);
  });

  it("notifies the window so a list fetched too early gets refetched", async () => {
    readToken.mockReturnValue("pat_abc");
    coreFetch
      .mockResolvedValueOnce(HEALTHY)
      .mockResolvedValueOnce(jsonRes(200, { machineId: "mach_1", workspaces: 1 }));
    const listener = vi.fn();
    setClaimListener(listener);

    await run();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify the window when the claim failed", async () => {
    readToken.mockReturnValue("pat_abc");
    coreFetch.mockResolvedValueOnce(HEALTHY).mockRejectedValueOnce(new Error("connection refused"));
    const listener = vi.fn();
    setClaimListener(listener);

    await expect(run()).resolves.toEqual({ ok: false, error: "connection refused" });
    expect(listener).not.toHaveBeenCalled();
  });
});
