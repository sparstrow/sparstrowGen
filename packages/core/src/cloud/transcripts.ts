import {
  TRANSCRIPT_BATCH_INTERVAL_MS,
  TRANSCRIPT_BATCH_MAX_BYTES,
  TRANSCRIPT_BATCH_MAX_EVENTS,
  type RunEventBatchResponse,
  type RunEventPush,
} from "@sparstrow/shared";
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
 * "queued to push" and "pushed" loses nothing — it is exactly what
 * `T-M5-04`'s backfill exists to re-send.
 *
 * This task does not persist a cursor. What it tracks — `RunQueue.pending` — is
 * the LIVE path's in-memory buffer, correct for a process that stays up. A
 * restart loses it, by design: `T-M5-04` adds `cloud_event_cursors` and a
 * backfill pass that reads local `run_events` directly, which subsumes this
 * queue rather than extending it.
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

/** Drop a run's queue for good — a 404, or a fully-drained terminal run. */
function retire(runId: string, queue: RunQueue): void {
  clearSchedule(queue);
  queues.delete(runId);
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

let unsubscribe: (() => void) | null = null;

export function startTranscriptPusher(): void {
  if (unsubscribe) return;
  stopped = false;
  healthy = true;

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
}
