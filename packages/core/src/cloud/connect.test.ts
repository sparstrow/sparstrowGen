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
const getMachineIdMock = vi.fn(() => "mach_test");
const getWorkspaceIdMock = vi.fn(() => null as string | null);
const saveConnectionMock = vi.fn();
vi.mock("./client.js", () => ({
  cloudFetch: (...args: unknown[]) => cloudFetchMock(...args),
  getOrCreateMachineId: () => getMachineIdMock(),
  getWorkspaceId: () => getWorkspaceIdMock(),
  saveConnection: (...args: unknown[]) => saveConnectionMock(...args),
}));

const claimMachineMock = vi.fn(async (_name?: string) => ({ machineId: "mach_test", runtimes: [] }));
vi.mock("./claim.js", () => ({
  claimMachine: (name?: string) => claimMachineMock(name),
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

const { pairViaBrowser } = await import("./connect.js");

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
  getMachineIdMock.mockReset().mockReturnValue("mach_test");
  claimMachineMock.mockClear();
  getWorkspaceIdMock.mockReset().mockReturnValue(null);
  saveConnectionMock.mockReset();
  describeMachineMock.mockClear();
  clearCloudLinksMock.mockReset();
});

describe("pairViaBrowser", () => {
  it("registers an attempt, opens a browser, and saves the token once the callback fires", async () => {
    let callbackUrl = "";
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string } }) => {
      if (path === "/connect") {
        callbackUrl = opts.body!.callback!;
        return startsResponse(callbackUrl);
      }
      if (path === "/connect/exchange") {
        return { token: "tok_abc", tokenId: "at_1", machineId: "mach_test" };
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
    expect(result).toEqual({ token: "tok_abc", tokenId: "at_1", machineId: "mach_test" });
    // Saved with an EMPTY runtime map: which workspaces this computer serves is
    // not known until the claim below answers it. Saving the credential first
    // is what makes a failed claim retryable without redoing the browser dance.
    expect(saveConnectionMock).toHaveBeenCalledWith({
      token: "tok_abc",
      machineId: "mach_test",
      runtimes: [],
    });
    expect(claimMachineMock).toHaveBeenCalledOnce();
    // The confirm URL IS the callback URL in this test harness (see
    // simulateBrowserConfirm's note); a real browser instead opens the web
    // app's /connect page, which is what actually issues the GET to callbackUrl.
    expect(callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the stored machine id across a reconnect, instead of minting a new one", async () => {
    // The whole reason `getOrCreateMachineId` persists: without it, every
    // reconnect would leave a duplicate computer behind in the owner's list.
    getMachineIdMock.mockReturnValue("mach_existing");
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string; machineId?: string } }) => {
      if (path === "/connect") {
        expect(opts.body!.machineId).toBe("mach_existing");
        return startsResponse(opts.body!.callback!);
      }
      return { token: "tok", tokenId: "at_1", machineId: "mach_existing" };
    });

    await pairViaBrowser(undefined, {
      onListening: (url) => void simulateBrowserConfirm(url).catch(() => {}),
    });
  });

  it("clears cloud links when reconnecting a computer that was connected before", async () => {
    getWorkspaceIdMock.mockReturnValue("ws_old");
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string } }) => {
      if (path === "/connect") return startsResponse(opts.body!.callback!);
      return { token: "tok", tokenId: "at_1", machineId: "mach_test" };
    });

    await pairViaBrowser(undefined, {
      onListening: (url) => void simulateBrowserConfirm(url).catch(() => {}),
    });

    expect(clearCloudLinksMock).toHaveBeenCalledOnce();
  });

  it("maps a rejected exchange (e.g. an expired attempt) to a typed PairError", async () => {
    cloudFetchMock.mockImplementation(async (path: string, opts: { body?: { callback?: string } }) => {
      if (path === "/connect") return startsResponse(opts.body!.callback!);
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
      if (path === "/connect") return startsResponse(opts.body!.callback!);
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
      if (path === "/connect") return startsResponse(opts.body!.callback!);
      return { token: "tok", tokenId: "at_1", machineId: "mach_test" };
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
