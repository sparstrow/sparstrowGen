import { describe, expect, it } from "vitest";
import type { RunEvent } from "@sparstrow/shared";
import { mergeRunEvents } from "./merge-run-events";

function event(seq: number, over: Partial<RunEvent> = {}): RunEvent {
  return { runId: "run_1", seq, ts: "2026-08-12T00:00:00Z", type: "assistant", payload: {}, ...over };
}

describe("mergeRunEvents", () => {
  it("merges fetched and live into one seq-ordered list", () => {
    const merged = mergeRunEvents([event(0), event(2)], [event(1)]);
    expect(merged.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it("dedupes by seq — the same seq from both sides is one event", () => {
    const merged = mergeRunEvents([event(0)], [event(0)]);
    expect(merged).toHaveLength(1);
  });

  it("a live event wins over a fetched one at the same seq", () => {
    const fetched = event(0, { payload: { text: "stale" } });
    const live = event(0, { payload: { text: "fresh" } });
    const merged = mergeRunEvents([fetched], [live]);
    expect(merged[0]?.payload).toEqual({ text: "fresh" });
  });

  it("a live delta arriving before the fetch resolves is not lost", () => {
    // The scenario the useMemo exists for: fetchedEvents.data is still
    // undefined/empty (query pending) while liveEvents already has something.
    const merged = mergeRunEvents([], [event(5)]);
    expect(merged.map((e) => e.seq)).toEqual([5]);
  });

  it("returns nothing for two empty inputs, not undefined or a throw", () => {
    expect(mergeRunEvents([], [])).toEqual([]);
  });

  it("sorts out-of-order input from either side", () => {
    const merged = mergeRunEvents([event(3), event(1)], [event(4), event(0)]);
    expect(merged.map((e) => e.seq)).toEqual([0, 1, 3, 4]);
  });
});
