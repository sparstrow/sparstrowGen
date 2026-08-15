/**
 * Runs the control plane dispatched, and therefore has a row for.
 *
 * A busy machine runs far more work than the cloud asked for — cron, handoffs,
 * the local UI — and none of it has a cloud run row. Reporting status or
 * pushing transcript events for those would be an authenticated round trip per
 * event, answered with a 404 every time. This set is the shared answer to
 * "should I bother", read by both `run-reporter.ts` (status) and
 * `transcripts.ts` (events).
 *
 * Process-lifetime only, deliberately. After a restart, in-flight dispatched
 * runs are swept to `failed` by `sweepOrphans()`, so a fresh process has
 * nothing left to report on for them through THIS mechanism — backfilling
 * their unpushed events after a restart is `T-M5-04`'s job, over the durable
 * cursor table, not this in-memory set.
 *
 * ─── Why `markDispatched` deleting on terminal was wrong ────────────────────
 *
 * A run's LAST events — the result, the error, the final tool output — are
 * recorded on the bus just before `run.completed` fires, but they are not
 * necessarily PUSHED to the cloud yet: the transcript pusher batches on a
 * timer, so the final event(s) can still be sitting in an in-memory batch when
 * `run-reporter.ts` sees the terminal status. If reporting terminal deleted the
 * run from this set on the spot, and the pusher also consults the set to decide
 * whether a run is still worth pushing for, the delete races the pending
 * batch: the run drops out of "dispatched" before its last events are sent,
 * and the transcript silently stops one event early. The page still looks
 * finished, which is what makes this the dangerous kind of bug — nothing
 * fails loudly.
 *
 * ─── Two reporters, two clocks, no shared one ───────────────────────────────
 *
 * `releaseWhenFlushed` (the reporter, on terminal) and `confirmFlushed` (the
 * pusher, once its queue for that run is empty) are called from two different
 * `bus.subscribe` listeners reacting to the same event. `EventEmitter` calls
 * listeners in registration order, and which of `startRunReporter()` /
 * `startTranscriptPusher()` runs first is an `index.ts` wiring detail, not a
 * contract — so either call can happen first, and the pusher's call can even
 * complete SYNCHRONOUSLY (an `async` function with nothing to `await` on its
 * first branch runs its body immediately) before the reporter's listener, which
 * registered later, even gets invoked for the same event.
 *
 * A "move between two sets" design breaks under that: if the move-out call runs
 * before the move-in call, the move-out finds nothing to move and the run is
 * never released.
 *
 * So state is tracked as two independent facts — `terminalReported` and
 * `flushConfirmed` — that combine into a boolean instead of racing to mutate
 * one flag. Setting either first is a no-op for the other; the run's row is
 * dropped only once both are true, in whichever order they arrived.
 */

const dispatched = new Set<string>();
const terminalReported = new Set<string>();
const flushConfirmed = new Set<string>();

export function markDispatched(runId: string): void {
  dispatched.add(runId);
}

/**
 * True while a run is worth reporting status for or pushing events for.
 *
 * `dispatched` covers the ordinary case — a run still executing. The second
 * clause covers the window between "the reporter saw it end" and "the pusher
 * confirmed nothing is left to send": terminal alone does not mean drained.
 */
export function isDispatched(runId: string): boolean {
  if (dispatched.has(runId)) return true;
  return terminalReported.has(runId) && !flushConfirmed.has(runId);
}

/** Called by the reporter when a run reports terminal. Order-independent — see the module header. */
export function releaseWhenFlushed(runId: string): void {
  dispatched.delete(runId);
  terminalReported.add(runId);
  settleIfDone(runId);
}

/**
 * Called by the pusher once nothing is left to send for this run — its
 * in-memory queue is empty and any forced terminal flush has resolved, whether
 * that resolution was success or a terminal failure (a 404 means nothing
 * further will ever be sendable for it either).
 *
 * Safe to call for a run that never reported terminal, or was never dispatched
 * at all: it records the fact and waits. An ordinary mid-run batch flush calls
 * this too, and it should have no visible effect until `releaseWhenFlushed`
 * eventually arrives.
 */
export function confirmFlushed(runId: string): void {
  flushConfirmed.add(runId);
  settleIfDone(runId);
}

function settleIfDone(runId: string): void {
  if (terminalReported.has(runId) && flushConfirmed.has(runId)) {
    terminalReported.delete(runId);
    flushConfirmed.delete(runId);
  }
}

/** Test seam, shared by every suite that touches dispatch state. */
export function resetDispatched(): void {
  dispatched.clear();
  terminalReported.clear();
  flushConfirmed.clear();
}
