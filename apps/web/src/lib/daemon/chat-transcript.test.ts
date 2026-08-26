import { describe, expect, it } from "vitest";
import {
  MAX_CHAT_EVENTS_PER_REQUEST,
  MAX_CHAT_REPLY_BYTES,
  latestOf,
  parseChatEventBatch,
  parseChatResult,
} from "./chat-transcript";

/**
 * The chat-turn boundary's own version of transcript.test.ts's property:
 * a batch with one bad event is refused WHOLE, never stored in part.
 */

describe("parseChatEventBatch", () => {
  it("accepts a normal batch", () => {
    const result = parseChatEventBatch({ events: [{ seq: 0, replyText: "Hel" }, { seq: 1, replyText: "Hello" }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.events).toHaveLength(2);
  });

  it("rejects a non-object body", () => {
    expect(parseChatEventBatch(null).ok).toBe(false);
    expect(parseChatEventBatch("nope").ok).toBe(false);
    expect(parseChatEventBatch([]).ok).toBe(false);
  });

  it("rejects a body without an events array", () => {
    const result = parseChatEventBatch({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toBe("malformed");
  });

  it("rejects an empty batch -- a daemon sending one is looping", () => {
    const result = parseChatEventBatch({ events: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toBe("empty_batch");
  });

  it("rejects a batch over the event ceiling", () => {
    const events = Array.from({ length: MAX_CHAT_EVENTS_PER_REQUEST + 1 }, (_, i) => ({
      seq: i,
      replyText: "x",
    }));
    const result = parseChatEventBatch({ events });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toBe("batch_too_large");
  });

  it("rejects the WHOLE batch when one event is malformed -- never stores the good half", () => {
    const result = parseChatEventBatch({
      events: [{ seq: 0, replyText: "fine" }, { seq: "oops", replyText: "bad" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toBe("invalid_seq");
  });

  it("rejects a non-string replyText", () => {
    const result = parseChatEventBatch({ events: [{ seq: 0, replyText: 42 }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toBe("invalid_reply_text");
  });

  it("rejects a duplicate seq within one batch", () => {
    const result = parseChatEventBatch({
      events: [{ seq: 0, replyText: "a" }, { seq: 0, replyText: "b" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toBe("duplicate_seq");
  });

  it("rejects a reply over the byte ceiling", () => {
    const result = parseChatEventBatch({
      events: [{ seq: 0, replyText: "x".repeat(MAX_CHAT_REPLY_BYTES + 1) }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toBe("reply_too_large");
  });

  it("sorts events ascending by seq regardless of arrival order", () => {
    const result = parseChatEventBatch({
      events: [{ seq: 2, replyText: "c" }, { seq: 0, replyText: "a" }, { seq: 1, replyText: "b" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.events.map((e) => e.seq)).toEqual([0, 1, 2]);
  });
});

describe("latestOf", () => {
  it("returns the highest-seq event -- the only one that needs to be durable", () => {
    const events = [
      { seq: 0, replyText: "a" },
      { seq: 1, replyText: "ab" },
      { seq: 2, replyText: "abc" },
    ];
    expect(latestOf(events)).toEqual({ seq: 2, replyText: "abc" });
  });
});

describe("parseChatResult", () => {
  it("accepts a succeeded result", () => {
    const result = parseChatResult({ seq: 3, replyText: "done", status: "succeeded" });
    expect(result.ok).toBe(true);
  });

  it("accepts a failed result with an error", () => {
    const result = parseChatResult({ seq: 1, replyText: "", status: "failed", error: "boom" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.error).toBe("boom");
  });

  it("defaults a missing error to null", () => {
    const result = parseChatResult({ seq: 1, replyText: "", status: "failed" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.error).toBeNull();
  });

  it("rejects an unknown status", () => {
    const result = parseChatResult({ seq: 1, replyText: "x", status: "done" });
    expect(result.ok).toBe(false);
  });

  it("rejects a reply over the byte ceiling", () => {
    const result = parseChatResult({
      seq: 1,
      replyText: "x".repeat(MAX_CHAT_REPLY_BYTES + 1),
      status: "succeeded",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection).toBe("reply_too_large");
  });

  it("rejects a non-string error", () => {
    const result = parseChatResult({ seq: 1, replyText: "x", status: "failed", error: 42 });
    expect(result.ok).toBe(false);
  });
});
