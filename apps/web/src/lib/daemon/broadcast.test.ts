import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSCRIPT_BROADCAST_EVENT, runTranscriptTopic, type RunEventPush } from "@sparstrow/shared";
import { broadcastRunEvents, planBroadcast } from "./broadcast";

/**
 * The live half. Two properties matter here and neither is about latency:
 *
 *   - a batch too big for one message is CHUNKED, never truncated, and an event
 *     too big for any message is named rather than dropped;
 *   - nothing this module does can fail the request that called it, because the
 *     transcript is already durable by then.
 */

function event(seq: number, size = 10): RunEventPush {
  return {
    seq,
    ts: "2026-08-11T10:00:00.000Z",
    type: "assistant",
    payload: { text: "x".repeat(size) },
  };
}

describe("planBroadcast", () => {
  it("keeps a small batch in one message", () => {
    const plan = planBroadcast([event(0), event(1), event(2)], 64 * 1024);
    expect(plan.chunks).toHaveLength(1);
    expect(plan.chunks[0]).toHaveLength(3);
    expect(plan.oversized).toEqual([]);
  });

  it("splits a batch that exceeds the budget", () => {
    // Four events of ~500 bytes against a 1200-byte budget.
    const plan = planBroadcast([event(0, 500), event(1, 500), event(2, 500), event(3, 500)], 1200);
    expect(plan.chunks.length).toBeGreaterThan(1);
    expect(plan.oversized).toEqual([]);
  });

  it("loses nothing when it splits", () => {
    // The assertion that makes chunking safe rather than merely present.
    const events = Array.from({ length: 20 }, (_, i) => event(i, 300));
    const plan = planBroadcast(events, 1000);
    const carried = plan.chunks.flat().map((e) => e.seq);
    expect([...carried, ...plan.oversized].sort((a, b) => a - b)).toEqual(events.map((e) => e.seq));
  });

  it("keeps every chunk under the budget", () => {
    const events = Array.from({ length: 20 }, (_, i) => event(i, 300));
    for (const chunk of planBroadcast(events, 1000).chunks) {
      expect(Buffer.byteLength(JSON.stringify(chunk), "utf8")).toBeLessThanOrEqual(1000);
    }
  });

  it("preserves order across chunks", () => {
    const events = Array.from({ length: 12 }, (_, i) => event(i, 300));
    const seqs = planBroadcast(events, 900).chunks.flat().map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it("names an event too large for any message instead of dropping it", () => {
    // It IS stored. Only the live delivery is skipped, and the client refetches
    // the seq rather than believing the transcript ended.
    const plan = planBroadcast([event(0, 10), event(1, 5000), event(2, 10)], 1000);
    expect(plan.oversized).toEqual([1]);
    expect(plan.chunks.flat().map((e) => e.seq)).toEqual([0, 2]);
  });

  it("handles a batch where everything is oversized", () => {
    const plan = planBroadcast([event(0, 5000), event(1, 5000)], 1000);
    expect(plan.chunks).toEqual([]);
    expect(plan.oversized).toEqual([0, 1]);
  });

  it("does not emit an empty chunk", () => {
    // The `flush current before an oversized event` path is where this hides.
    const plan = planBroadcast([event(0, 5000), event(1, 10)], 1000);
    for (const chunk of plan.chunks) expect(chunk.length).toBeGreaterThan(0);
  });

  it("handles an empty batch", () => {
    expect(planBroadcast([], 1000)).toEqual({ chunks: [], oversized: [] });
  });
});

describe("broadcastRunEvents", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 202 });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends to the run's private topic with the shared event name", async () => {
    await broadcastRunEvents("ws_1", "run_1", [event(0)]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/realtime/v1/api/broadcast");

    const body = JSON.parse(init.body as string);
    expect(body.messages[0].topic).toBe(runTranscriptTopic("ws_1", "run_1"));
    expect(body.messages[0].event).toBe(TRANSCRIPT_BROADCAST_EVENT);
    expect(body.messages[0].private).toBe(true);
  });

  it("marks the message private, which is what makes the policy apply", async () => {
    // Without `private: true` the RLS policy in 010 is not consulted and the
    // channel is readable by anyone who knows the topic.
    await broadcastRunEvents("ws_1", "run_1", [event(0)]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].private).toBe(true);
  });

  it("builds the topic from the caller's workspace, not from anything in the events", async () => {
    await broadcastRunEvents("ws_mine", "run_1", [
      { ...event(0), payload: { workspace_id: "ws_evil" } },
    ]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].topic).toBe("run:ws_mine:run_1");
  });

  it("sends one request per chunk", async () => {
    const events = Array.from({ length: 40 }, (_, i) => event(i, 8_000));
    await broadcastRunEvents("ws_1", "run_1", events);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("attaches the oversized marker to the first message", async () => {
    // On the first, so a subscriber learns about the gap even if a later chunk
    // is lost.
    await broadcastRunEvents("ws_1", "run_1", [event(0, 10), event(1, 200_000)]);
    const first = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(first.messages[0].payload.oversized).toEqual([1]);
  });

  it("still tells subscribers when every event was oversized", async () => {
    await broadcastRunEvents("ws_1", "run_1", [event(0, 200_000)]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].payload.events).toEqual([]);
    expect(body.messages[0].payload.oversized).toEqual([0]);
  });

  it("does not throw when Realtime rejects the message", async () => {
    // The transcript is already durable. Propagating would make the daemon
    // resend rows it has already stored.
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(broadcastRunEvents("ws_1", "run_1", [event(0)])).resolves.toBeUndefined();
  });

  it("does not throw when the network is down", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(broadcastRunEvents("ws_1", "run_1", [event(0)])).resolves.toBeUndefined();
  });

  it("does not throw when the service role key is absent", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(broadcastRunEvents("ws_1", "run_1", [event(0)])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never logs the events", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await broadcastRunEvents("ws_1", "run_1", [
      { ...event(0), payload: { secret: "sk-do-not-log-me" } },
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk-do-not-log-me");
  });
});
