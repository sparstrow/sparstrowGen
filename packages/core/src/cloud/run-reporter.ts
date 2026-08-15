import type { Run } from "@sparstrow/shared";
import type { RunStatusReport } from "@sparstrow/shared";
import { bus } from "../events/bus.js";
import { logger } from "../logger.js";
import { CloudAuthError, cloudFetch, isPaired } from "./client.js";
import { isDispatched, markDispatched, releaseWhenFlushed, resetDispatched as resetDispatchState } from "./dispatched.js";

// Re-exported unchanged: `commands.ts` and both cloud test suites import these
// from this module today, and moving the ownership of dispatch state to
// `dispatched.ts` (T-M5-03) is not a reason to touch every call site.
export { isDispatched, markDispatched };
export function resetDispatched(): void {
  resetDispatchState();
  queue.length = 0;
  reportedTerminal.clear();
}

/**
 * This module's OWN idempotency guard against reporting a run twice — not the
 * same question `dispatched.ts`'s `isDispatched()` answers.
 *
 * Before `T-M5-03`, `isDispatched(runId)` flipping to `false` right after a
 * terminal report served double duty: it also happened to stop THIS listener
 * from acting on any further event for that run. `dispatched.ts` now
 * deliberately keeps `isDispatched()` true past terminal, because the
 * transcript pusher may still have events queued to send — reusing that same
 * flag here would mean a stray post-terminal `run.updated` (there should not
 * be one, but the reporter should not depend on that) gets reported again for
 * as long as the pusher is still draining.
 *
 * So: reporting "have I said everything there is to say about this run" is
 * this module's own concern, tracked independently.
 */
const reportedTerminal = new Set<string>();

/**
 * M4 — telling the control plane how a dispatched run is going.
 *
 * The run ROW only. Transcript events are M5, and keeping them apart is what
 * makes this phase falsifiable: if a run reaches `succeeded` in the cloud, the
 * spine works, and a failure cannot be blamed on the streaming half not
 * existing yet.
 *
 * Reports ride the existing event bus rather than hooks inside RunManager. The
 * bus is the established seam, M5 subscribes to the same one for events, and a
 * reporter reaching into the run manager would have to be unpicked to get
 * there.
 */

interface PendingReport {
  runId: string;
  report: RunStatusReport;
}

/**
 * Bounded, in memory, oldest dropped.
 *
 * M5 owns the durable offline buffer with a spill ceiling, where transcript
 * volume justifies it. A status report is small and self-correcting: lose a
 * `running` and the terminal report still lands; lose the terminal one and it
 * is retried until it does or the process exits.
 */
const QUEUE_LIMIT = 200;
const queue: PendingReport[] = [];
let draining = false;

function enqueue(runId: string, report: RunStatusReport): void {
  if (queue.length >= QUEUE_LIMIT) {
    // Oldest first: the newest report about a run is the truest one, and a
    // terminal status matters more than the `running` that preceded it.
    const dropped = queue.shift();
    logger.warn({ runId: dropped?.runId }, "run status queue is full — dropped the oldest report");
  }
  queue.push({ runId, report });
  void drain();
}

async function drain(): Promise<void> {
  if (draining || !isPaired()) return;
  draining = true;

  try {
    while (queue.length > 0) {
      const next = queue[0];
      if (!next) break;
      try {
        await cloudFetch(`/runs/${next.runId}/status`, { body: next.report, retries: 1 });
        queue.shift();
      } catch (err) {
        if (err instanceof CloudAuthError) {
          // Revoked or rejected: nothing in this queue can ever land. Holding
          // it would mean replaying a run's whole history at whoever pairs this
          // machine next.
          logger.warn("cloud rejected this machine — discarding queued run status reports");
          queue.length = 0;
          return;
        }
        // Network. Leave it at the head and try again on the next report; the
        // terminal status for a run is the one that matters and it will be
        // retried behind this.
        logger.debug({ err, runId: next.runId }, "could not report run status — will retry");
        return;
      }
    }
  } finally {
    draining = false;
  }
}

function reportFor(run: Run, terminal: boolean): RunStatusReport | null {
  if (!terminal) {
    return { status: "running", startedAt: run.startedAt ?? new Date().toISOString() };
  }

  // `queued` reaching here would be a cancelled run that never started; report
  // it as cancelled rather than inventing a status the cloud rejects.
  const status = run.status === "queued" ? "cancelled" : run.status;
  if (status !== "succeeded" && status !== "failed" && status !== "cancelled" && status !== "timeout") {
    return null;
  }

  return {
    status,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? new Date().toISOString(),
    error: run.error ?? null,
    resultText: run.resultText ?? null,
    costUsd: run.costUsd ?? null,
    numTurns: run.numTurns ?? null,
    durationMs: run.durationMs ?? null,
    // Stamped at finalize, not at spawn: one of the three untrusted signals is
    // only knowable from the finished transcript (EH6/EH7).
    untrusted: run.untrusted ?? false,
  };
}

let unsubscribe: (() => void) | null = null;

export function startRunReporter(): void {
  if (unsubscribe) return;

  unsubscribe = bus.subscribe((event) => {
    if (event.type !== "run.updated" && event.type !== "run.completed") return;
    const run = event.run;
    if (reportedTerminal.has(run.id)) return;
    if (!isDispatched(run.id)) return;

    const terminal = event.type === "run.completed";
    // `run.updated` fires for every mid-run change; only the transition INTO
    // running is a status the cloud cares about in M4. Everything finer-grained
    // is a transcript event, which is M5's.
    if (!terminal && run.status !== "running") return;

    const report = reportFor(run, terminal);
    if (!report) return;

    enqueue(run.id, report);

    if (terminal) {
      reportedTerminal.add(run.id);
      // NOT a delete of the dispatch state. The run's STATUS history is
      // settled, but its transcript may still have unpushed events sitting in
      // the transcript pusher's batch — see dispatched.ts's header for why
      // deleting there used to truncate the last events of every transcript.
      // This hands the run to "draining", where isDispatched() still reports
      // true until the pusher confirms its queue for it is empty.
      releaseWhenFlushed(run.id);
    }
  });
}

export function stopRunReporter(): void {
  unsubscribe?.();
  unsubscribe = null;
}
