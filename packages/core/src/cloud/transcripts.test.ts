import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRANSCRIPT_BATCH_INTERVAL_MS,
  TRANSCRIPT_BATCH_MAX_BYTES,
  TRANSCRIPT_BATCH_MAX_EVENTS,
} from "@sparstrow/shared";
import { config } from "../config.js";
import { bus } from "../events/bus.js";
import { invalidatePairingCache, savePairing } from "./client.js";
import { isDispatched, markDispatched, resetDispatched } from "./dispatched.js";
import { resetTranscriptPusher, startTranscriptPusher, stopTranscriptPusher } from "./transcripts.js";

/**
 * The core-side half of M5's durable path: subscribe to the bus, batch, push.
 *
 * These publish directly to `bus` rather than going through a real run — the
 * pusher only ever sees `run.event` / `run.completed`, and constructing a real
 * spawned process for every case here would test the orchestrator, not the
 * pusher.
 */

const now = "2026-08-11T00:00:00Z";

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function pushEvent(runId: string, seq: number, over: Record<string, unknown> = {}) {
  bus.publish({
    type: "run.event",
    runId,
    event: { id: seq, runId, seq, ts: now, type: "assistant", payload: { text: "x" }, ...over } as never,
  });
}

function completeRun(runId: string) {
  bus.publish({ type: "run.completed", run: { id: runId, status: "succeeded" } as never });
}

/** URL → the response to give. Anything unmatched is a 200 accepting the batch. */
function routeFetch(handlers: Record<string, () => Response> = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    for (const [fragment, respond] of Object.entries(handlers)) {
      if (url.includes(fragment)) return respond();
    }
    const body = JSON.parse(String((init as RequestInit)?.body ?? "{}")) as { events: Array<{ seq: number }> };
    const events = body.events ?? [];
    const storedThroughSeq = events.length > 0 ? (events[events.length - 1] as { seq: number }).seq : -1;
    return jsonResponse(200, { storedThroughSeq, stored: events.length, duplicates: 0 });
  });
}

/** The `seq` list of each batch actually sent, in call order. */
function seqsSent(fetchMock: ReturnType<typeof routeFetch>): number[][] {
  return (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)
    .filter(([url]) => String(url).includes("/events"))
    .map(([, init]) => (JSON.parse(String(init.body)) as { events: Array<{ seq: number }> }).events.map((e) => e.seq));
}

describe("transcript pusher", () => {
  let dir: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;

  beforeEach(() => {
    vi.useFakeTimers();
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-transcripts-"));
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
    resetDispatched();
    resetTranscriptPusher();
  });

  afterEach(() => {
    stopTranscriptPusher();
    vi.useRealTimers();
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
    resetDispatched();
  });

  it("does nothing on an unpaired machine", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    startTranscriptPusher();
    markDispatched("run_1");
    pushEvent("run_1", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores events for a run the cloud never dispatched", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch();
    startTranscriptPusher();

    // No markDispatched() for this run — cron, a handoff, the local UI.
    pushEvent("run_local_only", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS * 2);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushes on the interval when nothing else triggers it first", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch();
    startTranscriptPusher();
    markDispatched("run_1");

    pushEvent("run_1", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seqsSent(fetchMock)).toEqual([[0]]);
  });

  it("flushes immediately once the event count hits the ceiling, without waiting for the timer", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch();
    startTranscriptPusher();
    markDispatched("run_1");

    for (let i = 0; i < TRANSCRIPT_BATCH_MAX_EVENTS; i++) pushEvent("run_1", i);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seqsSent(fetchMock)[0]).toHaveLength(TRANSCRIPT_BATCH_MAX_EVENTS);
  });

  it("flushes immediately once the byte budget is hit, without waiting for the timer — chunked, not combined", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch();
    startTranscriptPusher();
    markDispatched("run_1");

    // Two events, each individually under the budget, together over it.
    // `takeBatch` respects the per-request ceiling (same rule as `broadcast.ts`'s
    // chunking), so this is two requests sent back to back, not one oversized
    // one — and both happen without waiting for the interval.
    const big = "x".repeat(Math.ceil(TRANSCRIPT_BATCH_MAX_BYTES / 2) + 100);
    pushEvent("run_1", 0, { payload: { text: big } });
    pushEvent("run_1", 1, { payload: { text: big } });
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seqsSent(fetchMock)).toEqual([[0], [1]]);
  });

  it("sends an event that alone exceeds the byte budget as its own batch, rather than dropping it", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch();
    startTranscriptPusher();
    markDispatched("run_1");

    pushEvent("run_1", 0, { payload: { text: "x".repeat(TRANSCRIPT_BATCH_MAX_BYTES * 2) } });
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seqsSent(fetchMock)[0]).toEqual([0]);
  });

  it("serialises pushes for the SAME run — the second batch waits for the first to resolve", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    startTranscriptPusher();
    markDispatched("run_1");

    let resolveFirst!: (r: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
    );

    for (let i = 0; i < TRANSCRIPT_BATCH_MAX_EVENTS; i++) pushEvent("run_1", i);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // More events arrive while the first request is still outstanding.
    for (let i = TRANSCRIPT_BATCH_MAX_EVENTS; i < TRANSCRIPT_BATCH_MAX_EVENTS * 2; i++) pushEvent("run_1", i);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still just the one — nothing overlapped it

    fetchMock.mockImplementation(async () => jsonResponse(200, { storedThroughSeq: TRANSCRIPT_BATCH_MAX_EVENTS - 1, stored: TRANSCRIPT_BATCH_MAX_EVENTS, duplicates: 0 }));
    resolveFirst(jsonResponse(200, { storedThroughSeq: TRANSCRIPT_BATCH_MAX_EVENTS - 1, stored: TRANSCRIPT_BATCH_MAX_EVENTS, duplicates: 0 }));
    // A full interval, not 0: the resolution chains into a SECOND cloudFetch
    // call (splice, then `void flush(runId)` again), and advanceTimersByTimeAsync
    // needs enough looped ticks to drain both — matching commands.test.ts's
    // restart-mid-claim case, which resolves the same way for the same reason.
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2); // the second batch went out once the first was clear
  });

  it("pushes concurrently for two different runs", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    startTranscriptPusher();
    markDispatched("run_a");
    markDispatched("run_b");

    let resolveA!: (r: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("run_a")) {
        return new Promise<Response>((resolve) => (resolveA = resolve));
      }
      return jsonResponse(200, { storedThroughSeq: 0, stored: 1, duplicates: 0 });
    });

    for (let i = 0; i < TRANSCRIPT_BATCH_MAX_EVENTS; i++) pushEvent("run_a", i);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // run_a's request is outstanding

    // run_b must not wait behind run_a's in-flight request.
    pushEvent("run_b", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveA(jsonResponse(200, { storedThroughSeq: TRANSCRIPT_BATCH_MAX_EVENTS - 1, stored: TRANSCRIPT_BATCH_MAX_EVENTS, duplicates: 0 }));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("advances from the SERVER'S storedThroughSeq, and does not resend an accepted batch", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch();
    startTranscriptPusher();
    markDispatched("run_1");

    pushEvent("run_1", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Nothing new queued — the interval passing again must not resend.
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pushes the LAST event of a run after run.completed, even though it arrived just before", async () => {
    // The property T-M5-03 exists for. A run.completed immediately after a
    // run.event must still result in that event reaching the cloud — not "the
    // flush function was called", but the event itself present in a sent batch.
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch();
    startTranscriptPusher();
    markDispatched("run_1");

    pushEvent("run_1", 0);
    pushEvent("run_1", 1); // the final tool output / result
    completeRun("run_1");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seqsSent(fetchMock)[0]).toEqual([0, 1]);
  });

  it("releases the run from isDispatched only after the terminal flush lands", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    startTranscriptPusher();
    markDispatched("run_1");

    let resolve!: (r: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((r) => (resolve = r)),
    );

    pushEvent("run_1", 0);
    completeRun("run_1"); // reporter's half of this — releaseWhenFlushed — is exercised in dispatched.test.ts
    await vi.advanceTimersByTimeAsync(0);

    // The terminal flush is in flight. Until it resolves, the run must still
    // read as dispatched — this is exactly the window the bug shipped in.
    expect(isDispatched("run_1")).toBe(true);

    resolve(jsonResponse(200, { storedThroughSeq: 0, stored: 1, duplicates: 0 }));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("closes the loop for a run that completed with nothing ever queued", async () => {
    // A run that produced zero events (e.g. an instant cancel). No queue was
    // ever created for it; run.completed must not throw or hang.
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch();
    startTranscriptPusher();
    markDispatched("run_empty");

    expect(() => completeRun("run_empty")).not.toThrow();
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a 404 run's queue without stalling any other run", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    startTranscriptPusher();
    markDispatched("run_gone");
    markDispatched("run_ok");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("run_gone")) {
        return jsonResponse(404, { reason: "invalid_request", error: "No such run for this machine." });
      }
      return jsonResponse(200, { storedThroughSeq: 0, stored: 1, duplicates: 0 });
    });
    const warn = vi.spyOn((await import("../logger.js")).logger, "warn").mockImplementation(() => undefined as never);

    pushEvent("run_gone", 0);
    pushEvent("run_ok", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();

    // A later event for the same abandoned run must not reopen its queue.
    fetchMock.mockClear();
    pushEvent("run_gone", 1);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops permanently on 403 and does not retry", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(403, { reason: "revoked", error: "revoked" }));
    startTranscriptPusher();
    markDispatched("run_1");

    pushEvent("run_1", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Another event for a (newly) dispatched run must not restart anything —
    // the pusher is stopped, mirroring the heartbeat and the command loop.
    markDispatched("run_2");
    pushEvent("run_2", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-reads the token store on 401 and retries once still paired", async () => {
    savePairing({ token: "stale", runtimeId: "rt", workspaceId: "ws" });
    let first = true;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (first) {
        first = false;
        // Simulate `sparstrow pair` rewriting the store mid-flight.
        savePairing({ token: "fresh", runtimeId: "rt", workspaceId: "ws" });
        return jsonResponse(401, { reason: "unauthenticated", error: "rejected" });
      }
      return jsonResponse(200, { storedThroughSeq: 0, stored: 1, duplicates: 0 });
    });
    startTranscriptPusher();
    markDispatched("run_1");

    pushEvent("run_1", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("backs off and retries on a network failure without dropping the queue", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    let fail = true;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (fail) {
        fail = false;
        throw new Error("ECONNREFUSED");
      }
      return jsonResponse(200, { storedThroughSeq: 0, stored: 1, duplicates: 0 });
    });
    startTranscriptPusher();
    markDispatched("run_1");

    pushEvent("run_1", 0);
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seqsSent(fetchMock).flat()).toContain(0); // the retried batch still carries the event
  });

  it("does not hold the process open", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    routeFetch();
    const unrefs: unknown[] = [];
    const original = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((...args: Parameters<typeof setTimeout>) => {
      const timer = original(...args);
      unrefs.push(vi.spyOn(timer, "unref"));
      return timer;
    }) as typeof setTimeout);

    startTranscriptPusher();
    markDispatched("run_1");
    pushEvent("run_1", 0);
    await vi.advanceTimersByTimeAsync(0);

    expect(unrefs.length).toBeGreaterThan(0);
    for (const spy of unrefs) expect(spy).toHaveBeenCalled();
  });
});
