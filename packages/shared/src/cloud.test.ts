import { describe, it, expect } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_STALE_AFTER_MS,
  isRuntimeOnline,
} from "./cloud";

describe("heartbeat constants", () => {
  it("gives a machine room to miss a beat before it reads as offline", () => {
    // Two intervals would flap a machine offline on a single dropped request,
    // which on a laptop happens routinely. If someone tightens the stale
    // window to <= 2 intervals, this fails and asks them why.
    expect(HEARTBEAT_STALE_AFTER_MS).toBeGreaterThanOrEqual(HEARTBEAT_INTERVAL_MS * 3);
  });

  it("still notices a dead machine within a couple of minutes", () => {
    expect(HEARTBEAT_STALE_AFTER_MS).toBeLessThanOrEqual(120_000);
  });
});

describe("isRuntimeOnline", () => {
  const now = Date.UTC(2026, 7, 10, 12, 0, 0);
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("is online immediately after a beat", () => {
    expect(isRuntimeOnline(ago(0), now)).toBe(true);
  });

  it("survives one missed beat", () => {
    expect(isRuntimeOnline(ago(HEARTBEAT_INTERVAL_MS * 2), now)).toBe(true);
  });

  it("goes offline once the stale window passes", () => {
    expect(isRuntimeOnline(ago(HEARTBEAT_STALE_AFTER_MS + 1), now)).toBe(false);
  });

  it("treats the boundary itself as offline", () => {
    expect(isRuntimeOnline(ago(HEARTBEAT_STALE_AFTER_MS), now)).toBe(false);
  });

  it("accepts a Date as well as a string", () => {
    expect(isRuntimeOnline(new Date(now - 1000), now)).toBe(true);
  });

  it("reads a machine that has never beaten as offline", () => {
    expect(isRuntimeOnline(null, now)).toBe(false);
    expect(isRuntimeOnline(undefined, now)).toBe(false);
  });

  it("reads an unparseable timestamp as offline, not online", () => {
    // The naive `age >= STALE` form returns false for NaN, which reports a
    // machine with a corrupt timestamp as ONLINE -- exactly backwards, and
    // M4 would dispatch work to it.
    expect(isRuntimeOnline("not a date", now)).toBe(false);
  });

  it("reads a future timestamp as online rather than crashing", () => {
    // Clock skew can put a beat slightly ahead of the reader. Negative age is
    // not an error state.
    expect(isRuntimeOnline(new Date(now + 5_000), now)).toBe(true);
  });
});
