import type { CommandFailureReason, RunStatusReport } from "@sparstrow/shared";

/**
 * What a daemon's report MEANS for the board.
 *
 * Pure decisions, deliberately separated from the routes that apply them. Two
 * reasons:
 *
 *   1. This is the part with actual judgement in it — which task status a
 *      failure implies, which prior states a report may overwrite — and it is
 *      the part worth testing exhaustively. A test that has to mock a supabase
 *      query builder to assert "cancelled sends the task back to todo" is
 *      mostly testing the mock.
 *
 *   2. The daemon must never make these decisions. A machine that could write
 *      task statuses could mark every task in a workspace done. Keeping the
 *      mapping here, in the control plane, over a closed set of tokens, is what
 *      makes "the daemon reports facts, the cloud decides meaning" enforceable
 *      rather than aspirational.
 */

/** Run statuses that end a run. */
export const TERMINAL_RUN_STATUSES = ["succeeded", "failed", "cancelled", "timeout"] as const;

export type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];

export function isTerminalRunStatus(status: string): status is TerminalRunStatus {
  return (TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}

export function isReportableRunStatus(status: unknown): status is RunStatusReport["status"] {
  return typeof status === "string" && (status === "running" || isTerminalRunStatus(status));
}

/**
 * Which run statuses a report is allowed to overwrite.
 *
 * The network is not ordered. A `running` report retried after a dropped
 * response can land AFTER the terminal report for the same run, and applying it
 * would resurrect a finished run — a spinner that never stops on work that
 * completed minutes ago.
 *
 * Expressed as a precondition on the UPDATE rather than as ordering logic in the
 * daemon: one mechanism, in the place that can actually enforce it.
 */
export function applicableFrom(status: RunStatusReport["status"]): string[] {
  return status === "running" ? ["queued"] : ["queued", "running"];
}

/** The column patch for a run status report. Only what the report carries. */
export function runUpdateFor(
  report: RunStatusReport,
  now: string,
): Record<string, unknown> {
  const update: Record<string, unknown> = { status: report.status, updated_at: now };

  if (report.status === "running") {
    update.started_at = report.startedAt ?? now;
    return update;
  }

  update.finished_at = report.finishedAt ?? now;
  // Each field is applied only when the daemon actually sent it. Writing
  // `undefined` as null would erase a cost or turn count that an earlier report
  // had already recorded.
  if (report.error !== undefined) update.error = report.error;
  if (report.resultText !== undefined) update.result_text = report.resultText;
  if (report.costUsd !== undefined) update.cost_usd = report.costUsd;
  if (report.numTurns !== undefined) update.num_turns = report.numTurns;
  if (report.durationMs !== undefined) update.duration_ms = report.durationMs;
  if (report.untrusted !== undefined) update.untrusted = report.untrusted;
  return update;
}

/**
 * Where a task goes when its run ends.
 *
 * `succeeded` → `review`, not `done`. The agent finished; nobody has looked at
 * what it produced. A board that marks its own work complete stops being read,
 * and the whole point of the review column is that a human passes through it.
 *
 * `cancelled` → `todo`. Cancelling is a decision about this attempt, not about
 * whether the task still needs doing.
 */
export function taskStatusForRunEnd(status: TerminalRunStatus): string {
  if (status === "succeeded") return "review";
  if (status === "cancelled") return "todo";
  return "failed";
}

export interface BoardEffect {
  /** Park the task here instead of failing it. Null leaves the task alone. */
  taskStatus: string | null;
  /** Mark this runtime's binding for the project unusable, so dispatch stops picking it. */
  markBindingMissing: boolean;
  /**
   * Fail the run row. True for every reason: the run was a real attempt that
   * could not proceed, and `runs.status` has no `blocked` — the vocabulary is
   * queued/running/succeeded/failed/cancelled/timeout. Recoverable state lives
   * on the TASK, which is the distinction the plan draws.
   */
  failRun: boolean;
}

/**
 * A failed command's reason, translated into board state.
 *
 * `project_not_available` is the case the plan is most explicit about: missing
 * project bytes must NOT fail the task, because the work is fine and only its
 * placement is wrong. The task parks somewhere the UI can offer relink / clone /
 * unbind / reassign, and the binding is marked `missing` so `start_run` stops
 * choosing this machine for that project — which is what stops the identical
 * failure repeating on every retry.
 */
export function boardEffectFor(reason: CommandFailureReason): BoardEffect {
  switch (reason) {
    case "project_not_available":
      return { taskStatus: "project_not_available", markBindingMissing: true, failRun: true };
    case "agent_not_available":
    case "agent_disabled":
      return { taskStatus: "blocked", markBindingMissing: false, failRun: true };
    case "clone_failed":
      // A clone runs no agent and has no run row: there is nothing to fail and
      // no task waiting on it. The binding carries the error, written by the
      // route from the ack's detail.
      return { taskStatus: null, markBindingMissing: false, failRun: false };
    case "setting_not_allowed":
      return { taskStatus: null, markBindingMissing: false, failRun: false };
    case "spawn_failed":
    case "unknown_kind":
      return { taskStatus: "failed", markBindingMissing: false, failRun: true };
  }
}
