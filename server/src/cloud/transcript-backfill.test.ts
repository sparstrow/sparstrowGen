import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRANSCRIPT_BACKFILL_SWEEP_MS,
  TRANSCRIPT_BACKLOG_MAX_AGE_DAYS,
  TRANSCRIPT_BACKLOG_MAX_RUNS,
  TRANSCRIPT_BATCH_INTERVAL_MS,
} from "@sparstrow/shared";
import { closeDb, getSqlite, openDb } from "../db/connection.js";
import { config } from "../config.js";
import { invalidatePairingCache, saveConnection } from "./client.js";
import { resetDispatched } from "./dispatched.js";
import { resetTranscriptPusher, startTranscriptPusher, stopTranscriptPusher } from "./transcripts.js";

/**
 * T-M5-04 — the property the phase is judged on: a 60-second outage, a
 * process crash, and a laptop shut for a week are the SAME query.
 *
 * These seed `run_events` and `cloud_event_cursors` directly rather than going
 * through the live push path — that path is T-M5-03's, already covered; what
 * is new here is what happens when the process restarts and finds a durable
 * local transcript with a cursor that lags behind it.
 */

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * The age ceiling compares against the REAL clock (`Date.now()`), not a
 * frozen fixture date — a hardcoded calendar string old enough to read as
 * "not now" is also old enough to trip `TRANSCRIPT_BACKLOG_MAX_AGE_DAYS`
 * against whatever today actually is. Tests that are not specifically about
 * staleness use this instead.
 */
function recentTimestamp(): string {
  return new Date().toISOString();
}

function seedAgent(sqlite: ReturnType<typeof getSqlite>) {
  sqlite
    .prepare(
      "INSERT INTO agents (id, name, slug, provider, model, created_at, updated_at) VALUES ('agt_1','A','a','claude-code','sonnet','t','t')",
    )
    .run();
}

function seedRun(sqlite: ReturnType<typeof getSqlite>, runId: string, status: string) {
  sqlite
    .prepare(
      "INSERT INTO runs (id, agent_id, trigger, mode, prompt, status, created_at) VALUES (?, 'agt_1', 'manual', 'headless', 'hi', ?, '2026-01-01T00:00:00Z')",
    )
    .run(runId, status);
}

function seedEvents(sqlite: ReturnType<typeof getSqlite>, runId: string, seqs: number[]) {
  const insert = sqlite.prepare("INSERT INTO run_events (run_id, seq, ts, type, payload) VALUES (?, ?, ?, 'assistant', ?)");
  for (const seq of seqs) insert.run(runId, seq, `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`, JSON.stringify({ n: seq }));
}

function seedCursor(sqlite: ReturnType<typeof getSqlite>, runId: string, pushedThroughSeq: number, updatedAt: string) {
  sqlite
    .prepare("INSERT INTO cloud_event_cursors (run_id, pushed_through_seq, updated_at) VALUES (?, ?, ?)")
    .run(runId, pushedThroughSeq, updatedAt);
}

function cursorRow(sqlite: ReturnType<typeof getSqlite>, runId: string) {
  return sqlite
    .prepare(
      "SELECT run_id AS runId, pushed_through_seq AS pushedThroughSeq, updated_at AS updatedAt FROM cloud_event_cursors WHERE run_id = ?",
    )
    .get(runId) as { runId: string; pushedThroughSeq: number; updatedAt: string } | undefined;
}

/** Structural rather than `MockInstance<...>` — see `run-reporter.test.ts`'s `postedBodies` for why. */
function seqsSent(fetchMock: { mock: { calls: unknown[][] } }): number[][] {
  return (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)
    .filter(([url]) => String(url).includes("/events"))
    .map(([, init]) => (JSON.parse(String(init.body)) as { events: Array<{ seq: number }> }).events.map((e) => e.seq));
}

/** Always accepts, echoing back the last seq sent as `storedThroughSeq`. */
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

describe("transcript backfill", () => {
  let dir: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;

  beforeEach(() => {
    vi.useFakeTimers();
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-backfill-"));
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
    resetDispatched();
    resetTranscriptPusher();
    closeDb();
    openDb(":memory:");
    seedAgent(getSqlite());
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
    closeDb();
  });

  it("resumes from the cursor after a simulated restart — no gaps, no duplicates", async () => {
    // Local run_events already has 0..9 (this "process" wrote them before it
    // crashed); the cursor says only 0..4 were ever confirmed durable in the
    // cloud. sweepOrphans() has already marked the run terminal, as it always
    // does before the pusher starts.
    const sqlite = getSqlite();
    seedRun(sqlite, "run_1", "failed");
    seedEvents(sqlite, "run_1", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    seedCursor(sqlite, "run_1", 4, recentTimestamp());

    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch();

    startTranscriptPusher(); // startup is one of the three backfill triggers
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    // Only the outstanding events — never 0..4 again.
    expect(seqsSent(fetchMock).flat()).toEqual([5, 6, 7, 8, 9]);
  });

  it("removes the cursor once a backfilled run is both terminal and fully caught up", async () => {
    const sqlite = getSqlite();
    seedRun(sqlite, "run_1", "succeeded");
    seedEvents(sqlite, "run_1", [0, 1, 2]);
    seedCursor(sqlite, "run_1", 0, recentTimestamp());

    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    routeFetch();

    startTranscriptPusher();
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    expect(cursorRow(sqlite, "run_1")).toBeUndefined();
  });

  it("leaves the cursor in place for a run that is not locally terminal", async () => {
    // Defensive case: a cursor lagging behind for a run this process believes
    // is still queued/running must not be treated as abandoned or complete —
    // it is caught up, not closed out.
    const sqlite = getSqlite();
    seedRun(sqlite, "run_1", "running");
    seedEvents(sqlite, "run_1", [0, 1]);
    seedCursor(sqlite, "run_1", 0, recentTimestamp());

    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    routeFetch();

    startTranscriptPusher();
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    // Caught up (pushed_through_seq now matches local max), but not deleted —
    // there was never a terminal signal to close the loop on.
    expect(cursorRow(sqlite, "run_1")?.pushedThroughSeq).toBe(1);
  });

  it("does nothing when the backlog is empty — no candidates, no fetch calls, no throw", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch();

    expect(() => startTranscriptPusher()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();

    // The periodic sweep too, not just the startup one.
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BACKFILL_SWEEP_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sweeps periodically, not only at startup", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch();
    startTranscriptPusher();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing yet at startup

    // A gap appears after startup — e.g. a run this process never touched at
    // all whose cursor row got written by some other means. Simulated here by
    // seeding directly, since the periodic sweep must find it independent of
    // any bus event.
    const sqlite = getSqlite();
    seedRun(sqlite, "run_late", "failed");
    seedEvents(sqlite, "run_late", [0, 1]);
    seedCursor(sqlite, "run_late", -1, recentTimestamp());

    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BACKFILL_SWEEP_MS);
    expect(seqsSent(fetchMock).flat()).toEqual([0, 1]);
  });

  it("orders candidates by their oldest unpushed event, not by run id", async () => {
    const sqlite = getSqlite();
    seedRun(sqlite, "run_newer_gap", "failed");
    seedEvents(sqlite, "run_newer_gap", [0]);
    sqlite
      .prepare("INSERT INTO run_events (run_id, seq, ts, type, payload) VALUES (?, ?, ?, 'assistant', ?)")
      .run("run_newer_gap", 0, "2026-01-02T00:00:00Z", "{}");
    seedCursor(sqlite, "run_newer_gap", -1, recentTimestamp());

    seedRun(sqlite, "run_older_gap", "failed");
    sqlite
      .prepare("INSERT INTO run_events (run_id, seq, ts, type, payload) VALUES (?, ?, ?, 'assistant', ?)")
      .run("run_older_gap", 0, "2025-01-01T00:00:00Z", "{}");
    seedCursor(sqlite, "run_older_gap", -1, recentTimestamp());

    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch();

    startTranscriptPusher();
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    const runIdsInOrder = (fetchMock.mock.calls as unknown as Array<[string]>)
      .filter(([url]) => String(url).includes("/events"))
      .map(([url]) => (String(url).includes("run_older_gap") ? "run_older_gap" : "run_newer_gap"));
    expect(runIdsInOrder).toEqual(["run_older_gap", "run_newer_gap"]);
  });

  it("skips a run whose in-memory queue is already active when the sweep considers it", async () => {
    // If a run is being live-pushed RIGHT NOW (a queue already exists for it),
    // the sweep must not also enqueue backfill for it — that would be a second
    // producer racing the first, which the task's own trap forbids.
    const sqlite = getSqlite();
    seedRun(sqlite, "run_1", "running");
    seedEvents(sqlite, "run_1", [0]);
    // No cursor yet — added below, AFTER the live push is already in flight,
    // so the periodic sweep sees a "candidate" that is simultaneously active.

    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    let resolveLive!: (r: Response) => void;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>((resolve) => (resolveLive = resolve)));

    const { markDispatched } = await import("./dispatched.js");
    const { bus } = await import("../events/bus.js");
    startTranscriptPusher(); // empty backlog — the startup sweep is a no-op
    await vi.advanceTimersByTimeAsync(0);

    markDispatched("run_1");
    bus.publish({
      type: "run.event",
      runId: "run_1",
      event: { id: 0, runId: "run_1", seq: 0, ts: "2026-01-01T00:00:00Z", type: "assistant", payload: {} } as never,
    });
    // A single event under the batch thresholds only ARMS a timer — it does
    // not flush immediately. Advance past TRANSCRIPT_BATCH_INTERVAL_MS to let
    // it actually fire.
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the live push, now genuinely in flight

    seedCursor(sqlite, "run_1", -1, recentTimestamp());

    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BACKFILL_SWEEP_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the sweep did not open a second request for run_1

    resolveLive(jsonResponse(200, { storedThroughSeq: 0, stored: 1, duplicates: 0 }));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("drops a backlog entry past the age ceiling, logs once, and leaves a marker", async () => {
    const sqlite = getSqlite();
    seedRun(sqlite, "run_ancient", "failed");
    seedEvents(sqlite, "run_ancient", [0, 1, 2]);
    const longAgo = new Date(Date.now() - (TRANSCRIPT_BACKLOG_MAX_AGE_DAYS + 1) * 86_400_000).toISOString();
    seedCursor(sqlite, "run_ancient", 0, longAgo);

    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch();
    const warn = vi.spyOn((await import("../logger.js")).logger, "warn").mockImplementation(() => undefined as never);

    startTranscriptPusher();
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    expect(cursorRow(sqlite, "run_ancient")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1, oldestRunId: "run_ancient" }),
      expect.stringContaining("age ceiling"),
    );
    // The marker: one small system event recording the loss, not the original backlog.
    const marker = seqsSent(fetchMock);
    expect(marker.flat().length).toBe(1);
  });

  it("drops the oldest entries once the run ceiling is exceeded, in one aggregate log line", async () => {
    const sqlite = getSqlite();
    const insertCursor = sqlite.prepare(
      "INSERT INTO cloud_event_cursors (run_id, pushed_through_seq, updated_at) VALUES (?, 0, ?)",
    );
    // Ascending from "now", one second apart — well inside the age ceiling's
    // window, so only the COUNT ceiling is under test here. Oldest first, so
    // the ones dropped are deterministic.
    const base = Date.now();
    for (let i = 0; i < TRANSCRIPT_BACKLOG_MAX_RUNS + 5; i++) {
      insertCursor.run(`run_${i}`, new Date(base + i * 1000).toISOString());
    }

    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    routeFetch();
    const warn = vi.spyOn((await import("../logger.js")).logger, "warn").mockImplementation(() => undefined as never);

    startTranscriptPusher();
    await vi.advanceTimersByTimeAsync(TRANSCRIPT_BATCH_INTERVAL_MS);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ count: 5, oldestRunId: "run_0" }),
      expect.stringContaining("run ceiling"),
    );
    const total = (sqlite.prepare("SELECT COUNT(*) AS n FROM cloud_event_cursors").get() as { n: number }).n;
    expect(total).toBe(TRANSCRIPT_BACKLOG_MAX_RUNS);
  });

  it("cleans up an old but already-caught-up cursor WITHOUT sending a marker", async () => {
    // The ceiling does not special-case "caught up" out of its age/count scan
    // — an old row is an old row. What matters is `dropBacklogEntry`'s OWN
    // guard: a caught-up cursor computes zero lost events, so no marker is
    // sent. Sending one here would be a pointless notice for a run that is
    // not actually missing anything.
    const sqlite = getSqlite();
    seedEvents(sqlite, "run_caught_up", [0, 1]);
    const longAgo = new Date(Date.now() - (TRANSCRIPT_BACKLOG_MAX_AGE_DAYS + 1) * 86_400_000).toISOString();
    seedCursor(sqlite, "run_caught_up", 1, longAgo); // == max local seq

    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch();

    startTranscriptPusher();
    await vi.advanceTimersByTimeAsync(0);

    expect(cursorRow(sqlite, "run_caught_up")).toBeUndefined(); // cleaned up by the ceiling
    expect(fetchMock).not.toHaveBeenCalled(); // but nothing was sent — there was nothing lost
  });
});
