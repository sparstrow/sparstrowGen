import { describe, expect, it } from "vitest";
import type { RunEvent } from "@sparstrow/shared";
import { RUN_EVENTS_MAX_PAGES, fetchAllRunEvents } from "./hooks";

/**
 * `useRunEvents` used to fetch once with `limit: 500` and stop — a transcript
 * longer than that rendered incomplete with no indication anything was
 * missing. `fetchAllRunEvents` is the loop that replaced it, extracted here so
 * it is testable without React Query or a network mock.
 */

function page(seqs: number[]): RunEvent[] {
  return seqs.map((seq) => ({ runId: "run_1", seq, ts: "2026-08-12T00:00:00Z", type: "assistant", payload: {} }));
}

describe("fetchAllRunEvents", () => {
  it("returns everything in one call when the first page is already short", async () => {
    const fetchPage = async () => page([0, 1, 2]);
    const events = await fetchAllRunEvents(fetchPage, -1, 500);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it("stops on a short page — the property pagination exists for", async () => {
    let calls = 0;
    const fetchPage = async (afterSeq: number) => {
      calls++;
      if (afterSeq === -1) return page([0, 1]); // full page (limit 2) — more to fetch
      return page([2]); // short page — done
    };
    const events = await fetchAllRunEvents(fetchPage, -1, 2);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(calls).toBe(2);
  });

  it("advances the cursor to the last seq of each page, not a fixed step", async () => {
    const seenCursors: number[] = [];
    const fetchPage = async (afterSeq: number) => {
      seenCursors.push(afterSeq);
      if (afterSeq === -1) return page([0, 1]);
      if (afterSeq === 1) return page([2]); // short — stop
      throw new Error("should not be called again");
    };
    await fetchAllRunEvents(fetchPage, -1, 2);
    expect(seenCursors).toEqual([-1, 1]);
  });

  it("returns an empty array when there is nothing at all", async () => {
    const events = await fetchAllRunEvents(async () => [], -1, 500);
    expect(events).toEqual([]);
  });

  it("honours a caller-supplied starting cursor", async () => {
    const fetchPage = async (afterSeq: number) => {
      expect(afterSeq).toBe(41);
      return page([42]);
    };
    const events = await fetchAllRunEvents(fetchPage, 41, 500);
    expect(events.map((e) => e.seq)).toEqual([42]);
  });

  it("never exceeds the page ceiling, even against a response that never shrinks", async () => {
    let calls = 0;
    const fetchPage = async (afterSeq: number, limit: number) => {
      calls++;
      // Always a FULL page — a pathological server that never signals "done".
      return page(Array.from({ length: limit }, (_, i) => afterSeq + 1 + i));
    };
    const events = await fetchAllRunEvents(fetchPage, -1, 10);
    expect(calls).toBe(RUN_EVENTS_MAX_PAGES);
    expect(events).toHaveLength(RUN_EVENTS_MAX_PAGES * 10);
  });

  it("renders a transcript over 500 events in full, not truncated at the old single-page limit", async () => {
    // The concrete failure this task exists to fix: a >500-event transcript.
    const total = 1200;
    const fetchPage = async (afterSeq: number, limit: number) => {
      const start = afterSeq + 1;
      const seqs = Array.from({ length: limit }, (_, i) => start + i).filter((s) => s < total);
      return page(seqs);
    };
    const events = await fetchAllRunEvents(fetchPage, -1, 500);
    expect(events).toHaveLength(total);
    expect(events[events.length - 1]?.seq).toBe(total - 1);
  });
});
