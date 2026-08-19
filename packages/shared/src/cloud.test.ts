import { describe, it, expect } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_STALE_AFTER_MS,
  isRuntimeOnline,
  machineState,
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

describe("machineState", () => {
  const now = Date.UTC(2026, 7, 18, 12, 0, 0);
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const fresh = ago(0);
  const stale = ago(HEARTBEAT_STALE_AFTER_MS);

  it("calls a machine that is talking and working `active`", () => {
    expect(machineState("online", fresh, now)).toBe("active");
  });

  it("calls a machine that is talking and shutting down `draining`", () => {
    expect(machineState("draining", fresh, now)).toBe("draining");
  });

  it("calls a machine that stopped talking mid-drain `unreachable`, not `draining`", () => {
    // THE ordering case. A machine that declared it was shutting down and then
    // went quiet may have finished twenty minutes ago or been unplugged
    // mid-drain, and we cannot tell which. Saying "shutting down" asserts a
    // cause we do not know -- the same rule that rejected "turned off".
    // Reversing the two branches leaves a machine reading "shutting down"
    // forever.
    expect(machineState("draining", stale, now)).toBe("unreachable");
  });

  it("does not believe a stored `online` from a machine that has gone quiet", () => {
    // `runtimes.status` is what a daemon last DECLARED. A crashed machine
    // writes nothing, so the stored value is whatever it was when it was last
    // healthy. Liveness comes from the heartbeat, never from this column.
    expect(machineState("online", stale, now)).toBe("unreachable");
  });

  it("calls a machine that has never beaten `unreachable`", () => {
    expect(machineState("online", null, now)).toBe("unreachable");
    expect(machineState("online", undefined, now)).toBe("unreachable");
  });

  it("calls a machine with a corrupt timestamp `unreachable`, not `active`", () => {
    // Inherited from isRuntimeOnline's deliberate `!(age >= X)` form.
    // Reimplementing the comparison here would reintroduce the bug.
    expect(machineState("online", "not a date", now)).toBe("unreachable");
  });

  it("puts the boundary exactly where the heartbeat constant does", () => {
    expect(machineState("online", ago(HEARTBEAT_STALE_AFTER_MS), now)).toBe("unreachable");
    expect(machineState("online", ago(HEARTBEAT_STALE_AFTER_MS - 1), now)).toBe("active");
  });

  it("treats an absent or unrecognised status as `active` while it is talking", () => {
    // A machine that is demonstrably reachable is active. An unknown status
    // string is not a reason to call it something the UI has no word for.
    for (const status of [null, undefined, "", "online", "idle", "something-new"]) {
      expect(machineState(status, fresh, now), String(status)).toBe("active");
    }
  });

  it("never returns a state the UI has no rendering for", () => {
    // FR-007: the model leaves room for `sleeping` (D-16) without reshaping.
    // Until that lands, nothing may produce a fourth value.
    const inputs = [null, undefined, "online", "draining", "sleeping", "offline"];
    for (const status of inputs) {
      for (const beat of [fresh, stale, null, "not a date"]) {
        expect(["active", "unreachable", "draining"]).toContain(
          machineState(status, beat, now),
        );
      }
    }
  });

  it("does not treat `sleeping` as its own state yet", () => {
    // D-16. Shipping a state nothing can produce is worse than its absence;
    // this fails loudly when the branch is added, which is when the renderer
    // needs updating too.
    expect(machineState("sleeping", fresh, now)).toBe("active");
  });
});
