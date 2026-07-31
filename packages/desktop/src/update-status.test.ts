import { describe, expect, it } from "vitest";
import { FEED_FAILURE_THRESHOLD, shouldSurfaceCheckError } from "./update-status";

/**
 * The packaged app checks for updates on launch and every 30 minutes. Two very
 * different situations both arrive as an autoUpdater "error" event:
 *
 *   - a machine that is offline right now — routine, must stay silent
 *   - a feed that has never worked (no release published, or a 404 on
 *     latest.yml) — a misconfiguration the owner needs told about
 *
 * Before this predicate the shell suppressed every error while idle, so the
 * second case was indistinguishable from "you are up to date". A release
 * pipeline that had never once run looked exactly like a healthy one, which is
 * precisely how it went unnoticed.
 */
describe("shouldSurfaceCheckError", () => {
  it("surfaces a failure that interrupts an in-flight download", () => {
    expect(
      shouldSurfaceCheckError({ state: "downloading", consecutiveFailures: 1, everReachedFeed: true }),
    ).toBe(true);
  });

  it("surfaces a failure while an update is waiting to install", () => {
    expect(
      shouldSurfaceCheckError({ state: "waiting", consecutiveFailures: 1, everReachedFeed: true }),
    ).toBe(true);
  });

  it("stays silent when a working feed becomes unreachable — routine offline", () => {
    expect(
      shouldSurfaceCheckError({ state: "idle", consecutiveFailures: 12, everReachedFeed: true }),
    ).toBe(false);
  });

  it("stays silent on the first failures of a feed never reached — may just be offline at launch", () => {
    expect(
      shouldSurfaceCheckError({
        state: "idle",
        consecutiveFailures: FEED_FAILURE_THRESHOLD - 1,
        everReachedFeed: false,
      }),
    ).toBe(false);
  });

  it("surfaces once a never-reached feed has failed the threshold number of times", () => {
    expect(
      shouldSurfaceCheckError({
        state: "idle",
        consecutiveFailures: FEED_FAILURE_THRESHOLD,
        everReachedFeed: false,
      }),
    ).toBe(true);
  });

  it("keeps surfacing a never-reached feed past the threshold", () => {
    expect(
      shouldSurfaceCheckError({
        state: "idle",
        consecutiveFailures: FEED_FAILURE_THRESHOLD + 40,
        everReachedFeed: false,
      }),
    ).toBe(true);
  });

  it("does not nag over an already-announced update when a later check fails", () => {
    expect(
      shouldSurfaceCheckError({ state: "available", consecutiveFailures: 3, everReachedFeed: true }),
    ).toBe(false);
  });

  it("treats a never-reached feed as reportable even in the available state", () => {
    // Reaching "available" without ever reaching the feed is not a real state,
    // but the predicate must not depend on that invariant to stay correct.
    expect(
      shouldSurfaceCheckError({
        state: "available",
        consecutiveFailures: FEED_FAILURE_THRESHOLD,
        everReachedFeed: false,
      }),
    ).toBe(true);
  });
});
