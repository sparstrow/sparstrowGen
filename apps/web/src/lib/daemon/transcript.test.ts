import { describe, expect, it } from "vitest";
import {
  MAX_EVENTS_PER_REQUEST,
  approximateBodyBytes,
  parseEventBatch,
  storedThroughSeq,
  toRunEventRows,
} from "./transcript";

/**
 * The gate between a daemon and someone's permanent transcript.
 *
 * These assert the two properties the route's correctness rests on: a batch is
 * accepted whole or not at all, and nothing about the caller's scope can be
 * influenced by the body.
 */

function event(seq: number, over: Record<string, unknown> = {}) {
  return { seq, ts: "2026-08-11T10:00:00.000Z", type: "assistant", payload: { text: "hi" }, ...over };
}

describe("parseEventBatch", () => {
  it("accepts a well-formed batch", () => {
    const result = parseEventBatch({ events: [event(0), event(1)] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(2);
    expect(result.events[0].seq).toBe(0);
  });

  it("sorts by seq so the route does not depend on the daemon's ordering", () => {
    const result = parseEventBatch({ events: [event(5), event(2), event(9)] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.map((e) => e.seq)).toEqual([2, 5, 9]);
  });

  it("rejects an empty batch rather than answering 200", () => {
    // A daemon sending empty batches is looping. A 200 lets it loop forever.
    const result = parseEventBatch({ events: [] });
    expect(result).toMatchObject({ ok: false, rejection: "empty_batch" });
  });

  it.each([
    ["a non-object body", "nope"],
    ["null", null],
    ["an array", [event(0)]],
    ["a missing events key", {}],
    ["events that is not an array", { events: "no" }],
    ["a non-object event", { events: ["no"] }],
  ])("rejects %s as malformed", (_label, body) => {
    expect(parseEventBatch(body)).toMatchObject({ ok: false, rejection: "malformed" });
  });

  it.each([
    ["a negative seq", -1],
    ["a fractional seq", 1.5],
    ["a string seq", "3"],
    ["a missing seq", undefined],
    ["NaN", Number.NaN],
  ])("rejects %s", (_label, seq) => {
    const result = parseEventBatch({ events: [event(0, { seq })] });
    expect(result).toMatchObject({ ok: false, rejection: "invalid_seq" });
  });

  it("rejects the same seq twice in one batch", () => {
    // Two payloads competing for one row: the upsert would apply whichever
    // arrives last, which is not a decision anyone made.
    const result = parseEventBatch({ events: [event(1), event(2), event(1)] });
    expect(result).toMatchObject({ ok: false, rejection: "duplicate_seq" });
  });

  it("rejects an unknown event type", () => {
    const result = parseEventBatch({ events: [event(0, { type: "hallucination" })] });
    expect(result).toMatchObject({ ok: false, rejection: "invalid_type" });
  });

  it("accepts every type the provider parsers actually emit", () => {
    const types = ["system", "assistant", "user", "tool_use", "tool_result", "result", "stderr", "status", "raw"];
    const result = parseEventBatch({
      events: types.map((type, i) => event(i, { type })),
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ["a non-string ts", 1_760_000_000_000],
    ["an unparseable ts", "yesterday"],
    ["a missing ts", undefined],
  ])("rejects %s", (_label, ts) => {
    const result = parseEventBatch({ events: [event(0, { ts })] });
    expect(result).toMatchObject({ ok: false, rejection: "invalid_ts" });
  });

  it("refuses a batch that is too long", () => {
    const events = Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, (_, i) => event(i));
    expect(parseEventBatch({ events })).toMatchObject({
      ok: false,
      rejection: "batch_too_large",
    });
  });

  it("accepts a batch exactly at the ceiling", () => {
    const events = Array.from({ length: MAX_EVENTS_PER_REQUEST }, (_, i) => event(i));
    expect(parseEventBatch({ events }).ok).toBe(true);
  });

  it("refuses the whole batch when one event is bad", () => {
    // The property the route's correctness rests on. Storing the good half
    // makes corruption permanent AND lets the daemon advance its cursor past
    // the rest.
    const result = parseEventBatch({ events: [event(0), event(1, { type: "bogus" }), event(2)] });
    expect(result.ok).toBe(false);
  });

  it("leaves the payload untouched, including keys that look like scope", () => {
    // Two things at once. A provider line is opaque and must survive verbatim,
    // and a payload carrying `workspace_id` must not become a way to influence
    // one -- the return type has no field for it, which is the actual defence.
    const payload = { workspace_id: "ws_evil", nested: { snake_case_key: [1, 2, { deep: true }] } };
    const result = parseEventBatch({ events: [event(0, { payload })] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0].payload).toEqual(payload);
  });

  it("normalises an absent payload to null rather than dropping the column", () => {
    const result = parseEventBatch({ events: [event(0, { payload: undefined })] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0].payload).toBeNull();
  });

  it("keeps a payload that is legitimately false or zero", () => {
    // `?? null` and not `|| null`: an agent emitting `0` or `false` is data.
    const zero = parseEventBatch({ events: [event(0, { payload: 0 })] });
    expect(zero.ok && zero.events[0].payload).toBe(0);
    const no = parseEventBatch({ events: [event(0, { payload: false })] });
    expect(no.ok && no.events[0].payload).toBe(false);
  });
});

describe("storedThroughSeq", () => {
  it("is the highest seq in a sorted batch", () => {
    const result = parseEventBatch({ events: [event(7), event(3)] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storedThroughSeq(result.events)).toBe(7);
  });

  it("is -1 for nothing, so a cursor at 0 is not implied", () => {
    // seq starts at 0, so 0 is a real event. "Nothing stored" has to be lower.
    expect(storedThroughSeq([])).toBe(-1);
  });
});

describe("toRunEventRows", () => {
  it("stamps the caller's workspace and the path's run on every row", () => {
    const parsed = parseEventBatch({ events: [event(0), event(1)] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const rows = toRunEventRows("ws_1", "run_1", parsed.events);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.workspace_id).toBe("ws_1");
      expect(row.run_id).toBe("run_1");
    }
  });

  it("passes ts through as the string the daemon sent", () => {
    // Re-parsing and re-serialising here would shift an entire transcript by
    // the offset of whichever machine ran the route.
    const ts = "2026-08-11T10:00:00.000Z";
    const parsed = parseEventBatch({ events: [event(0, { ts })] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(toRunEventRows("ws_1", "run_1", parsed.events)[0].ts).toBe(ts);
  });

  it("cannot be told a workspace by the events", () => {
    const parsed = parseEventBatch({
      events: [event(0, { payload: { workspace_id: "ws_evil" } })],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(toRunEventRows("ws_mine", "run_1", parsed.events)[0].workspace_id).toBe("ws_mine");
  });
});

describe("approximateBodyBytes", () => {
  it("measures the encoded size, not the character count", () => {
    // A multi-byte payload that passes a `.length` check and fails a byte one.
    expect(approximateBodyBytes({ s: "🙂" })).toBeGreaterThan(JSON.stringify({ s: "🙂" }).length - 1);
  });

  it("returns 0 for something unserialisable instead of throwing", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(approximateBodyBytes(circular)).toBe(0);
  });
});
