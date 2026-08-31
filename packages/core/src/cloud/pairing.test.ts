import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RuntimeIdentity } from "@sparstrow/shared";

/**
 * Browser-loopback pairing.
 *
 * The real HTTP listener runs for real (127.0.0.1, ephemeral port) — a real
 * `fetch()` to it is what stands in for "the browser reached the daemon's
 * callback", the actual mechanism this whole flow depends on. Everything
 * that talks to the control plane or spawns a real process is mocked.
 */

const spawnMock = vi.fn();
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const cloudFetchMock = vi.fn();
const getRuntimeIdMock = vi.fn(() => null as string | null);
const getWorkspaceIdMock = vi.fn(() => null as string | null);
const savePairingMock = vi.fn();
vi.mock("./client.js", () => ({
  cloudFetch: (...args: unknown[]) => cloudFetchMock(...args),
  getRuntimeId: () => getRuntimeIdMock(),
  getWorkspaceId: () => getWorkspaceIdMock(),
  savePairing: (...args: unknown[]) => savePairingMock(...args),
}));

const describeMachineMock = vi.fn(
  async (_name?: string | null): Promise<RuntimeIdentity> => ({
    name: "test-machine",
    hostname: "test-machine",
    os: "linux",
    isElectron: false,
    capabilities: [],
    coreVersion: "0.1.0",
  }),
);
vi.mock("./registration.js", () => ({
  describeMachine: (name?: string | null) => describeMachineMock(name),
}));

const clearCloudLinksMock = vi.fn();
vi.mock("./resolve.js", () => ({
  clearCloudLinks: (...args: unknown[]) => clearCloudLinksMock(...args),
}));

const { pairViaBrowser } = await import("./pairing.js");

/** A fake browser confirming: fetch the confirmUrl's callback address. */
async function simulateBrowserConfirm(confirmUrl: string): Promise<Response> {
  // confirmUrl in these tests is the *callback* URL directly — see
  // startsResponse() below, which stands in for the control plane handing
  // back {attemptId, confirmUrl}. Real confirmUrl points at /pair on the web
  // app; what matters for this unit is only that the daemon's own listener
  // gets a request at the callback it registered.
  return fetch(confirmUrl);
}

function startsResponse(callbackUrl: string) {
  return { attemptId: "att_test", confirmUrl: callbackUrl };
}

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockReturnValue({ on: vi.fn(), unref: vi.fn() });
  cloudFetchMock.mockReset();
  getRuntimeIdMock.mockReset().mockReturnValue(null);
  getWorkspaceIdMock.mockReset().mockReturnValue(null);
  savePairingMock.mockReset();
  describeMachineMock.mockClear();
  clearCloudLinksMock.mockReset();
});

describe("pairViaBrowser", () => {
  it("registers an attempt, opens a browser, and saves the token once the callback fires", async () => {
    let callbackUrl = "";
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string } }) => {
      if (path === "/pair") {
        callbackUrl = opts.body!.callback!;
        return startsResponse(callbackUrl);
      }
      if (path === "/pair/exchange") {
        return { token: "tok_abc", runtimeId: "rt_1", workspaceId: "ws_1" };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const pairPromise = pairViaBrowser("test-machine", {
      onListening: (url) => {
        // Fire the "browser" once the listener is actually up — mirrors how
        // a real browser only reaches the callback after the confirm page
        // (which embeds the same URL the CLI just registered) is opened.
        void simulateBrowserConfirm(url).catch(() => {});
      },
    });

    const result = await pairPromise;
    expect(result).toEqual({ token: "tok_abc", runtimeId: "rt_1", workspaceId: "ws_1" });
    expect(savePairingMock).toHaveBeenCalledWith({
      token: "tok_abc",
      runtimeId: "rt_1",
      workspaceId: "ws_1",
    });
    // The confirm URL IS the callback URL in this test harness (see
    // simulateBrowserConfirm's note); a real browser instead opens the web
    // app's /pair page, which is what actually issues the GET to callbackUrl.
    expect(callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the stored runtime id across a re-pair, instead of minting a new one", async () => {
    getRuntimeIdMock.mockReturnValue("rt_existing");
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string; runtimeId?: string } }) => {
      if (path === "/pair") {
        expect(opts.body!.runtimeId).toBe("rt_existing");
        return startsResponse(opts.body!.callback!);
      }
      return { token: "tok", runtimeId: "rt_existing", workspaceId: "ws_1" };
    });

    await pairViaBrowser(undefined, {
      onListening: (url) => void simulateBrowserConfirm(url).catch(() => {}),
    });
  });

  it("clears cloud links when the workspace changes on re-pair", async () => {
    getWorkspaceIdMock.mockReturnValue("ws_old");
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string } }) => {
      if (path === "/pair") return startsResponse(opts.body!.callback!);
      return { token: "tok", runtimeId: "rt_1", workspaceId: "ws_new" };
    });

    await pairViaBrowser(undefined, {
      onListening: (url) => void simulateBrowserConfirm(url).catch(() => {}),
    });

    expect(clearCloudLinksMock).toHaveBeenCalledOnce();
  });

  it("maps a rejected exchange (e.g. an expired attempt) to a typed PairError", async () => {
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string } }) => {
      if (path === "/pair") return startsResponse(opts.body!.callback!);
      const err = new Error("That pairing attempt has expired.") as Error & { reason?: string };
      err.reason = "attempt_expired";
      throw err;
    });

    await expect(
      pairViaBrowser(undefined, {
        onListening: (url) => void simulateBrowserConfirm(url).catch(() => {}),
      }),
    ).rejects.toMatchObject({ failure: "attempt_expired" });
  });

  it("times out if the callback never fires, without hanging forever", async () => {
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string } }) => {
      if (path === "/pair") return startsResponse(opts.body!.callback!);
      throw new Error("exchange should never be called in this test");
    });

    // No onListening handler — nothing ever fetches the callback, so this
    // exercises the real timeout path with a short override rather than
    // racing an unrelated guard against the production 5-minute constant.
    await expect(pairViaBrowser(undefined, {}, 50)).rejects.toMatchObject({ failure: "timeout" });
  });

  it("does not throw when the browser can't be opened — reports via onBrowserOpenFailed instead", async () => {
    spawnMock.mockImplementation(() => {
      throw new Error("no display");
    });
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string } }) => {
      if (path === "/pair") return startsResponse(opts.body!.callback!);
      return { token: "tok", runtimeId: "rt_1", workspaceId: "ws_1" };
    });

    let reportedFailedOpen = false;
    await pairViaBrowser(undefined, {
      onBrowserOpenFailed: () => {
        reportedFailedOpen = true;
      },
      onListening: (url) => void simulateBrowserConfirm(url).catch(() => {}),
    });

    expect(reportedFailedOpen).toBe(true);
  });
});
