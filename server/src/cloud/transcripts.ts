import { and, asc, eq, gt } from "drizzle-orm";
import {
  TRANSCRIPT_BACKFILL_SWEEP_MS,
  TRANSCRIPT_BACKLOG_MAX_AGE_DAYS,
  TRANSCRIPT_BACKLOG_MAX_RUNS,
  TRANSCRIPT_BATCH_INTERVAL_MS,
  TRANSCRIPT_BATCH_MAX_BYTES,
  TRANSCRIPT_BATCH_MAX_EVENTS,
  type RunEventBatchResponse,
  type RunEventPush,
  type RunEventType,
} from "@sparstrow/shared";
import { getDb, getSqlite } from "../db/connection.js";
import { cloudEventCursors, runEvents, runs } from "../db/schema.js";
import { bus } from "../events/bus.js";
import { logger } from "../logger.js";
import {
  CloudAuthError,
  CloudRequestError,
  cloudFetch,
  invalidatePairingCache,
  isPaired,
} from "./client.js";
import { confirmFlushed, isDispatched } from "./dispatched.js";

/**
 * M5 — the daemon side of the durable transcript path: batch, push, repeat.
 *
 * Rides the event bus, exactly like `run-reporter.ts`. `recordEvent`
 * (`run-manager.ts:556`) publishes `run.event` AFTER the local row is
 * committed, which is the ordering this module depends on: nothing here is
 * ever pushed that is not already durable on this machine, so a crash between
 * "queued to push" and "pushed" loses nothing.
 *
 * Two producers feed the SAME per-run queue: the LIVE path below (`run.event`
 * off the bus) and the BACKFILL sweep further down (`runSweep`, reading
 * `cloud_event_cursors` against local `run_events` directly). They share one
 * `flush()`, one `inFlight` guard per run, and one cursor-advance call — a
 * second path around that machinery is exactly what T-M5-04's own task doc
 * warns against building.
 */

interface RunQueue {
  pending: RunEventPush[];
  /** Guards against two flushes for the same run in flight at once. */
  inFlight: boolean;
  timer: NodeJS.Timeout | null;
  /** Set once `run.completed` is seen. Forces an immediate flush regardless of thresholds. */
  terminal: boolean;
}

const queues = new Map<string, RunQueue>();

/**
 * A run the cloud rejected with 404 — no row for it there. Remembered so a
 * late, redundant `run.event` (there should not be one, but nothing enforces
 * that) does not reopen a queue that will only 404 again.
 */
const abandoned = new Set<string>();

let stopped = false;
/** Connectivity edge, shared across every run's pushes — one log line per transition, not one per run. */
let healthy = true;

/**
 * Advance the durable cursor — called after EVERY confirmed batch, live or
 * backfilled, from the SAME `storedThroughSeq` the in-memory `queue.pending`
 * splice already trusts. Never from what was sent; see the comment at the call
 * site.
 */
function advanceCursor(runId: string, pushedThroughSeq: number): void {
  const now = new Date().toISOString();
  getDb()
    .insert(cloudEventCursors)
    .values({ runId, pushedThroughSeq, updatedAt: now })
    .onConflictDoUpdate({
      target: cloudEventCursors.runId,
      set: { pushedThroughSeq, updatedAt: now },
    })
    .run();
}

function readCursor(runId: string): number | null {
  const row = getDb().select().from(cloudEventCursors).where(eq(cloudEventCursors.runId, runId)).get();
  return row?.pushedThroughSeq ?? null;
}

/** Called only once a run is BOTH terminal and fully pushed — phase decision 2. */
function deleteCursor(runId: string): void {
  getDb().delete(cloudEventCursors).where(eq(cloudEventCursors.runId, runId)).run();
}

/**
 * Read the run's OWN local status rather than trusting `queue.terminal`
 * blindly. Live-triggered queues already know they're terminal (`run.event`
 * set it); backfill discovers a queue fresh and has to ask — a run whose
 * process crashed mid-stream was already swept to `failed` by
 * `sweepOrphans()` before the pusher ever starts, so in the ordinary
 * crash-recovery case this reads terminal immediately. A run this process has
 * no local row for at all counts as terminal too: nothing further will ever be
 * recorded for it either way.
 */
function isLocalRunTerminal(runId: string): boolean {
  const row = getDb().select({ status: runs.status }).from(runs).where(eq(runs.id, runId)).get();
  if (!row) return true;
  return row.status !== "queued" && row.status !== "running";
}

function getQueue(runId: string): RunQueue {
  let queue = queues.get(runId);
  if (!queue) {
    queue = { pending: [], inFlight: false, timer: null, terminal: false };
    queues.set(runId, queue);
  }
  return queue;
}

function encodedBytes(events: RunEventPush[]): number {
  try {
    return Buffer.byteLength(JSON.stringify(events), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Take the front of the queue up to whichever limit is hit first.
 *
 * Always takes at least one event, even one that alone exceeds the byte
 * budget: the ingest route has its own, much larger request ceiling
 * (`MAX_BATCH_BYTES`, `apps/web/src/lib/daemon/transcript.ts`), so an
 * oversized single event still fits as its own batch. Dropping it here would
 * be a silent, permanent hole no later stage could ever fill.
 */
function takeBatch(pending: RunEventPush[]): RunEventPush[] {
  const batch: RunEventPush[] = [];
  for (const event of pending) {
    if (batch.length >= TRANSCRIPT_BATCH_MAX_EVENTS) break;
    if (batch.length > 0 && encodedBytes([...batch, event]) > TRANSCRIPT_BATCH_MAX_BYTES) break;
    batch.push(event);
  }
  const first = pending[0];
  if (batch.length === 0 && first) batch.push(first);
  return batch;
}

function scheduleFlush(runId: string, queue: RunQueue): void {
  if (queue.timer) return;
  queue.timer = setTimeout(() => {
    queue.timer = null;
    void flush(runId);
  }, TRANSCRIPT_BATCH_INTERVAL_MS);
  queue.timer.unref?.();
}

function clearSchedule(queue: RunQueue): void {
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }
}

/**
 * Drop a run's queue for good — a 404, or a fully-drained terminal run.
 *
 * Both callers of `retire` mean "nothing further will ever be sent for this
 * run", which is exactly the condition phase decision 2 names for deleting the
 * cursor: 404 because the cloud will never accept it, terminal-and-drained
 * because there is nothing left to accept.
 */
function retire(runId: string, queue: RunQueue): void {
  clearSchedule(queue);
  queues.delete(runId);
  deleteCursor(runId);
  confirmFlushed(runId);
}

async function flush(runId: string): Promise<void> {
  const queue = queues.get(runId);
  if (!queue || queue.inFlight || stopped) return;

  if (queue.pending.length === 0) {
    // Nothing to send. If this run is over, there never will be — close it
    // out. Otherwise leave the queue open; the next event reschedules.
    if (queue.terminal) retire(runId, queue);
    return;
  }

  if (!isPaired()) return; // unpaired mid-run: wait for the next event or the timer, same as the command loop

  clearSchedule(queue);
  const batch = takeBatch(queue.pending);
  queue.inFlight = true;

  try {
    const response = await cloudFetch<RunEventBatchResponse>(`/runs/${runId}/events`, {
      body: { events: batch },
      retries: 1,
      timeoutMs: 15_000,
    });

    // Released HERE, not left to the `finally` below. The continuation just
    // past this point can recurse into `flush(runId)` when more is queued, and
    // that recursive call's very first check is `queue.inFlight` — if this flag
    // were still `true` at that point (as it would be if only the `finally`
    // cleared it, which does not run until this whole try/catch unwinds), the
    // recursive call would bail immediately and the remainder would sit
    // unflushed until an unrelated later event happened to nudge it.
    queue.inFlight = false;

    if (!healthy) {
      healthy = true;
      logger.info("cloud control plane reachable again");
      // The failing→reachable backfill trigger. Whatever else fell behind
      // while this machine could not reach the cloud gets its own sweep now,
      // rather than waiting up to a full `TRANSCRIPT_BACKFILL_SWEEP_MS`.
      void runSweep();
    }

    // The route accepts a batch whole or not at all (T-M5-01), so a success
    // response means exactly what was sent is now durable. `storedThroughSeq`
    // is asserted rather than trusted blindly — a mismatch here means the two
    // sides have drifted on what a batch means, which is worth knowing loudly.
    // `batch` is never empty here — the caller returns early when
    // `queue.pending` is empty, and `takeBatch` always takes at least one.
    const lastSent = (batch[batch.length - 1] as RunEventPush).seq;
    if (response.storedThroughSeq !== lastSent) {
      logger.warn(
        { runId, lastSent, storedThroughSeq: response.storedThroughSeq },
        "transcript batch response did not confirm the seq that was sent — advancing from the SERVER'S number",
      );
    }
    queue.pending.splice(0, batch.length);
    // Written from the SERVER'S number, per phase decision 2 — not `lastSent`,
    // even though they agree in the ordinary case asserted just above. A cursor
    // advanced from what the daemon believes it sent is how a transcript
    // acquires a permanent hole the moment the two sides ever disagree.
    advanceCursor(runId, response.storedThroughSeq);

    if (queue.pending.length > 0) {
      // More waiting — most often the queue grew past one batch while this
      // request was in flight. Go again immediately rather than waiting out a
      // full interval for data that is already sitting in memory.
      void flush(runId);
      return;
    }

    if (queue.terminal) {
      retire(runId, queue);
      return;
    }
    // Idle: nothing scheduled until the next event arrives.
  } catch (err) {
    if (err instanceof CloudAuthError) {
      if (err.revoked) {
        logger.warn(
          "this machine's pairing was revoked — stopping the transcript pusher. Run `sparstrow pair <code>` to reconnect.",
        );
        stopTranscriptPusher();
        return;
      }
      invalidatePairingCache();
      if (!isPaired()) {
        logger.warn("daemon token is no longer valid — stopping the transcript pusher until re-paired");
        stopTranscriptPusher();
        return;
      }
      // Token re-read and still paired: retry on the normal cadence. The
      // batch was never spliced out, so nothing sent is lost.
      scheduleFlush(runId, queue);
      return;
    }

    if (err instanceof CloudRequestError && err.status === 404) {
      // No cloud row for this run. Permanent — retrying sends the same batch
      // into the same wall. Scoped to this run only: every other run's queue
      // is untouched.
      logger.warn({ runId }, "cloud has no row for this run — dropping its transcript queue");
      abandoned.add(runId);
      retire(runId, queue);
      return;
    }

    // Network, timeout, or 5xx after cloudFetch's own retry was exhausted.
    // Never logged per attempt — only the transition, exactly like the
    // heartbeat and the command loop.
    if (healthy) {
      healthy = false;
      logger.warn(
        { detail: err instanceof Error ? err.message : String(err) },
        "could not push transcript events — retrying in the background",
      );
    }
    scheduleFlush(runId, queue);
  } finally {
    queue.inFlight = false;
  }
}

// ─── T-M5-04: backfill ───────────────────────────────────────────────────────
//
// The property the phase is judged on: a 60-second outage, a crash, or a
// laptop shut for a week are the SAME query — `cloud_event_cursors` names
// which runs owe the cloud something, and the local `run_events` table
// already holds it durably. See schema.ts's comment on the table for what a
// row means.

interface RunEventRow {
  seq: number;
  ts: string;
  type: string;
  payload: unknown;
}

/**
 * Read a run's local backlog past its cursor and hand it to the SAME queue and
 * `flush()` the live path uses — not a second path around it, per the trap
 * this task's doc names explicitly.
 *
 * `.all()`, not `.iterate()`: this reads the whole backlog into a plain array
 * and closes the statement immediately, so there is no open SQLite cursor left
 * sitting across the network `await` inside `flush()`. A run's local
 * transcript is, by the plan's own measurement, at most a few hundred KB —
 * small enough that holding it in memory briefly costs nothing next to the
 * alternative of a long-lived read cursor blocking writers on the same
 * connection, including the run that may still be producing events.
 *
 * Returns `false` when there is nothing to do — no cursor row (this run has
 * never been pushed for, and backfill has no business inventing that) or the
 * cursor is already caught up to the local max `seq`.
 */
function enqueueBacklog(runId: string): boolean {
  const cursor = readCursor(runId);
  if (cursor === null) return false;

  const rows = getDb()
    .select({
      seq: runEvents.seq,
      ts: runEvents.ts,
      type: runEvents.type,
      payload: runEvents.payload,
    })
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, cursor)))
    .orderBy(asc(runEvents.seq))
    .all() as RunEventRow[];
  if (rows.length === 0) return false;

  const queue = getQueue(runId);
  // Never downgrade an already-terminal queue — a live `run.completed` may
  // have set this before backfill got here. Default is already `false`, so a
  // non-terminal local status simply leaves it as-is.
  if (isLocalRunTerminal(runId)) queue.terminal = true;

  for (const row of rows) {
    queue.pending.push({ seq: row.seq, ts: row.ts, type: row.type as RunEventType, payload: row.payload });
  }
  return true;
}

/**
 * Runs with unconfirmed events, oldest-unpushed-event first — phase decision:
 * "a partially-replayed transcript that starts in the middle reads as
 * corrupt, while one that starts at the beginning and stops reads as
 * still-loading."
 *
 * Correlated subqueries over `cloud_event_cursors`, not a scan of
 * `run_events` — the table this reads FROM is bounded to
 * `TRANSCRIPT_BACKLOG_MAX_RUNS` rows by the ceiling below, so the two
 * subqueries per candidate cost nothing next to what they buy: the exact
 * ordering the decision asks for, not an approximation via `updated_at`.
 */
function backfillCandidates(limit: number): string[] {
  const rows = getSqlite()
    .prepare(
      `SELECT c.run_id AS runId
       FROM cloud_event_cursors c
       WHERE c.pushed_through_seq < (SELECT MAX(seq) FROM run_events WHERE run_id = c.run_id)
       ORDER BY (SELECT MIN(ts) FROM run_events WHERE run_id = c.run_id AND seq > c.pushed_through_seq) ASC
       LIMIT ?`,
    )
    .all(limit) as { runId: string }[];
  return rows.map((r) => r.runId);
}

/**
 * Best-effort, one event, fire-and-forget — matching `declareDraining()`'s
 * shape. By the time this is called the backlog is already discarded, so a
 * failed send has nothing further to protect; a successful one leaves a
 * visible gap in the transcript instead of an invisible one.
 *
 * `afterSeq + 1` rather than the run's local max `seq`: it is the FIRST hole,
 * guaranteed unstored on the server (nothing past `afterSeq` was ever
 * confirmed), and placing the marker there — rather than after everything —
 * is what makes the transcript read as "stopped here", not "missing
 * something in the middle nobody can find".
 */
async function sendBacklogMarker(runId: string, afterSeq: number, lostCount: number): Promise<void> {
  if (!isPaired()) return;
  try {
    await cloudFetch(`/runs/${runId}/events`, {
      body: {
        events: [
          {
            seq: afterSeq + 1,
            ts: new Date().toISOString(),
            type: "system",
            payload: {
              message: `${lostCount} transcript event(s) were lost for this run: its backlog exceeded the retention ceiling before reaching the cloud.`,
            },
          },
        ],
      },
      retries: 0,
    });
  } catch {
    // Silent by design — see the doc comment above.
  }
}

/** Discard a backlog entry the ceiling has condemned. */
function dropBacklogEntry(runId: string, pushedThroughSeq: number): void {
  const maxRow = getSqlite()
    .prepare(`SELECT MAX(seq) AS maxSeq FROM run_events WHERE run_id = ?`)
    .get(runId) as { maxSeq: number | null };
  const lost = Math.max(0, (maxRow?.maxSeq ?? pushedThroughSeq) - pushedThroughSeq);

  deleteCursor(runId);
  confirmFlushed(runId);
  if (lost > 0) void sendBacklogMarker(runId, pushedThroughSeq, lost);
}

/**
 * The staleness ceiling — phase decision: "a backup that silently never
 * shrinks is the same failure as one that silently never fires." Each drop is
 * logged as ONE aggregate warning, not one per run, matching the heartbeat and
 * command loop's "log the transition" style.
 *
 * Skips any run with a currently-open in-memory queue. That means either a
 * live push or an earlier candidate in THIS SAME sweep tick is already
 * touching it — dropping the cursor out from under an in-flight `flush()`
 * would let that call's own success path resurrect the very row this is
 * trying to delete. Cheap to check, and the run simply waits for a later
 * sweep if it is somehow still a candidate once whatever is active on it now
 * finishes.
 */
function enforceBacklogCeiling(): void {
  const sqlite = getSqlite();

  const cutoff = new Date(Date.now() - TRANSCRIPT_BACKLOG_MAX_AGE_DAYS * 86_400_000).toISOString();
  const stale = (
    sqlite
      .prepare(`SELECT run_id AS runId, pushed_through_seq AS pushedThroughSeq FROM cloud_event_cursors WHERE updated_at < ? ORDER BY updated_at ASC`)
      .all(cutoff) as { runId: string; pushedThroughSeq: number }[]
  ).filter((r) => !queues.has(r.runId));
  if (stale.length > 0) {
    logger.warn(
      { count: stale.length, oldestRunId: stale[0]?.runId },
      `transcript backlog exceeded its ${TRANSCRIPT_BACKLOG_MAX_AGE_DAYS}-day age ceiling — dropping the oldest entries`,
    );
    for (const row of stale) dropBacklogEntry(row.runId, row.pushedThroughSeq);
  }

  const total = (sqlite.prepare(`SELECT COUNT(*) AS n FROM cloud_event_cursors`).get() as { n: number }).n;
  if (total > TRANSCRIPT_BACKLOG_MAX_RUNS) {
    const excess = total - TRANSCRIPT_BACKLOG_MAX_RUNS;
    const oldest = (
      sqlite
        .prepare(`SELECT run_id AS runId, pushed_through_seq AS pushedThroughSeq FROM cloud_event_cursors ORDER BY updated_at ASC LIMIT ?`)
        .all(excess) as { runId: string; pushedThroughSeq: number }[]
    ).filter((r) => !queues.has(r.runId));
    if (oldest.length > 0) {
      logger.warn(
        { count: oldest.length, oldestRunId: oldest[0]?.runId },
        `transcript backlog exceeded its ${TRANSCRIPT_BACKLOG_MAX_RUNS}-run ceiling — dropping the oldest entries`,
      );
      for (const row of oldest) dropBacklogEntry(row.runId, row.pushedThroughSeq);
    }
  }
}

let sweeping = false;

/**
 * One round trip per candidate, not the whole backlog concurrently.
 *
 * `await flush(runId)` resolves after that run's FIRST request settles
 * (success or failure) — `flush`'s own internal continuation for "there is
 * more" is `void flush(runId)`, fire-and-forget, unchanged from the live path.
 * So this loop throttles the BURST of brand-new connections a large backlog
 * would otherwise open all at once on reconnect, without risking a hang: every
 * exit from `flush()` resolves its promise, including the retry-later paths,
 * so a single unreachable candidate delays the rest of this tick by at most
 * one request's timeout — never forever.
 */
async function runSweep(): Promise<void> {
  if (stopped || sweeping || !isPaired()) return;
  sweeping = true;

  try {
    enforceBacklogCeiling();

    for (const runId of backfillCandidates(TRANSCRIPT_BACKLOG_MAX_RUNS)) {
      if (queues.has(runId)) continue; // already active this tick — live, or drained by an earlier candidate that turned out to be the same run
      if (!enqueueBacklog(runId)) continue;
      await flush(runId);
    }
  } finally {
    sweeping = false;
  }
}

let sweepTimer: NodeJS.Timeout | null = null;

function startSweeping(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => void runSweep(), TRANSCRIPT_BACKFILL_SWEEP_MS);
  sweepTimer.unref?.();
}

function stopSweeping(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

let unsubscribe: (() => void) | null = null;

export function startTranscriptPusher(): void {
  if (unsubscribe) return;
  stopped = false;
  healthy = true;

  // Startup is one of the three backfill triggers — a no-op if unpaired or
  // there is no backlog, so unconditional is correct here.
  void runSweep();
  startSweeping();

  unsubscribe = bus.subscribe((event) => {
    if (stopped) return;

    if (event.type === "run.event") {
      const { runId } = event;
      if (abandoned.has(runId) || !isDispatched(runId)) return;

      const queue = getQueue(runId);
      // `payload` is passed through exactly as recorded locally — never
      // logged, never reshaped. It is the agent's output and the user's
      // prompt.
      queue.pending.push({
        seq: event.event.seq,
        ts: event.event.ts,
        type: event.event.type,
        payload: event.event.payload,
      });

      const count = queue.pending.length;
      const bytes = encodedBytes(queue.pending);
      if (count >= TRANSCRIPT_BATCH_MAX_EVENTS || bytes >= TRANSCRIPT_BATCH_MAX_BYTES) {
        clearSchedule(queue);
        void flush(runId);
      } else {
        scheduleFlush(runId, queue);
      }
      return;
    }

    if (event.type === "run.completed") {
      const runId = event.run.id;
      if (abandoned.has(runId)) return;
      const queue = queues.get(runId);
      if (!queue) {
        // No events were ever queued for this run on THIS process lifetime —
        // nothing to flush. Still close the loop: `run-reporter.ts` may have
        // called (or may still call) `releaseWhenFlushed`, and that call must
        // not wait forever on a pusher that was never going to do anything.
        confirmFlushed(runId);
        return;
      }
      queue.terminal = true;
      void flush(runId); // forced, regardless of count/byte/interval thresholds
    }
  });
}

export function stopTranscriptPusher(): void {
  stopped = true;
  stopSweeping();
  unsubscribe?.();
  unsubscribe = null;
  for (const queue of queues.values()) clearSchedule(queue);
  queues.clear();
}

/** Test seam. */
export function resetTranscriptPusher(): void {
  stopTranscriptPusher();
  abandoned.clear();
  healthy = true;
  // `runSweep`'s own `finally` clears this on every real exit path, but a test
  // that swaps mocks mid-sweep can otherwise leave every future sweep
  // permanently gated out.
  sweeping = false;
}
