import { afterEach, describe, expect, it } from "vitest";
import { confirmFlushed, isDispatched, markDispatched, releaseWhenFlushed, resetDispatched } from "./dispatched.js";

/**
 * The property this module exists for: `releaseWhenFlushed` (the reporter, on
 * terminal) and `confirmFlushed` (the pusher, once drained) are called from two
 * independent `bus.subscribe` listeners reacting to the SAME event, and which
 * one runs first is a wiring detail of `index.ts`, not a contract. A "move
 * between two sets" design loses the release if they arrive out of order —
 * these tests assert both orders converge to the same, correct state.
 */

afterEach(() => {
  resetDispatched();
});

describe("the ordinary lifecycle", () => {
  it("is dispatched once marked, and not before", () => {
    expect(isDispatched("run_1")).toBe(false);
    markDispatched("run_1");
    expect(isDispatched("run_1")).toBe(true);
  });

  it("stays dispatched between terminal and flush confirmation", () => {
    markDispatched("run_1");
    releaseWhenFlushed("run_1");
    // This is the window the bug lived in: terminal reported, but the pusher's
    // queue for this run may still hold unsent events.
    expect(isDispatched("run_1")).toBe(true);
  });

  it("is released once both terminal and flush-confirmed have happened", () => {
    markDispatched("run_1");
    releaseWhenFlushed("run_1");
    confirmFlushed("run_1");
    expect(isDispatched("run_1")).toBe(false);
  });
});

describe("order independence", () => {
  it("releases correctly when the reporter calls first", () => {
    markDispatched("run_1");
    releaseWhenFlushed("run_1");
    confirmFlushed("run_1");
    expect(isDispatched("run_1")).toBe(false);
  });

  it("releases correctly when the pusher calls first", () => {
    // The race this module was rewritten for: an async flush with nothing to
    // await can complete, and call confirmFlushed, before the reporter's own
    // (separately registered) bus listener even runs for the same event.
    markDispatched("run_1");
    confirmFlushed("run_1");
    // Not yet reported terminal — still dispatched, correctly, even though the
    // pusher has nothing left to send.
    expect(isDispatched("run_1")).toBe(true);
    releaseWhenFlushed("run_1");
    expect(isDispatched("run_1")).toBe(false);
  });

  it("does not leak state across many out-of-order interleavings", () => {
    for (let i = 0; i < 50; i++) {
      const runId = `run_${i}`;
      markDispatched(runId);
      if (i % 2 === 0) {
        confirmFlushed(runId);
        releaseWhenFlushed(runId);
      } else {
        releaseWhenFlushed(runId);
        confirmFlushed(runId);
      }
      expect(isDispatched(runId)).toBe(false);
    }
  });
});

describe("edge cases", () => {
  it("confirmFlushed for a run never marked dispatched is a harmless no-op", () => {
    expect(() => confirmFlushed("run_never_seen")).not.toThrow();
    expect(isDispatched("run_never_seen")).toBe(false);
  });

  it("releaseWhenFlushed for a run never marked dispatched still enters draining", () => {
    // A run.completed can arrive for a run this process never saw markDispatched
    // for (e.g. it was dispatched by a PREVIOUS process lifetime, per the
    // module header's note on this being process-lifetime-only state). The
    // reporter's call must not throw, and the run should not be treated as
    // actively dispatched from nothing.
    releaseWhenFlushed("run_1");
    expect(isDispatched("run_1")).toBe(true); // terminal reported, awaiting flush confirmation
    confirmFlushed("run_1");
    expect(isDispatched("run_1")).toBe(false);
  });

  it("a second markDispatched before release does not desynchronise the pair", () => {
    // A replayed run.start (T-M4-04) calls markDispatched again for a run that
    // is already dispatched.
    markDispatched("run_1");
    markDispatched("run_1");
    releaseWhenFlushed("run_1");
    confirmFlushed("run_1");
    expect(isDispatched("run_1")).toBe(false);
  });

  it("resetDispatched clears every set, not just the visible one", () => {
    markDispatched("run_1");
    releaseWhenFlushed("run_1"); // now only in the terminal/flush pair, not `dispatched`
    resetDispatched();
    expect(isDispatched("run_1")).toBe(false);
    // If the reset had missed the internal sets, a stray confirmFlushed here
    // would still find state to react to.
    confirmFlushed("run_1");
    expect(isDispatched("run_1")).toBe(false);
  });

  it("runs do not interfere with each other", () => {
    markDispatched("run_a");
    markDispatched("run_b");
    releaseWhenFlushed("run_a");
    confirmFlushed("run_a");
    expect(isDispatched("run_a")).toBe(false);
    expect(isDispatched("run_b")).toBe(true);
  });
});
