import { NextResponse } from "next/server";
import type { RunStatusReport } from "@sparstrow/shared";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";
import {
  TERMINAL_RUN_STATUSES,
  applicableFrom,
  isReportableRunStatus,
  isTerminalRunStatus,
  runUpdateFor,
  taskStatusForRunEnd,
  type TerminalRunStatus,
} from "@web/lib/daemon/reconcile";

/**
 * "That run is now …" — the machine reporting on work it is executing.
 *
 * M4 carries the run ROW only. Transcript events are M5, and keeping the two
 * apart is what makes this phase falsifiable: if a run reaches `succeeded` in
 * the cloud, the spine works, and a failure cannot be blamed on the streaming
 * half not existing yet.
 *
 * ─── Monotonic, because the network is not ordered ──────────────────────────
 *
 * The daemon retries a report whose response was lost, so the same `running`
 * arrives twice; and a `running` delayed behind a retry can land AFTER the
 * terminal report for the same run. Applying that blindly would resurrect a
 * finished run — a spinner that never stops, on a run that completed minutes
 * ago.
 *
 * The guard is in the `where`, not in the daemon: a terminal status only
 * applies to a run that is still queued or running, and `running` only applies
 * to one that is still queued. Two mechanisms for one invariant would be one
 * too many, so the daemon deliberately holds no ordering logic.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { id } = await params;
  const body = (await readJson(request)) as RunStatusReport | null;

  if (!body || !isReportableRunStatus(body.status)) {
    return daemonError(
      400,
      "invalid_request",
      `status must be one of: running, ${TERMINAL_RUN_STATUSES.join(", ")}.`,
    );
  }

  const status = body.status;
  const db = daemonDb();
  const update = runUpdateFor(body, new Date().toISOString());

  // `target_runtime_id` is in the filter as well as the workspace: a machine may
  // only report on runs the control plane actually gave it. Without it, any
  // paired machine in a workspace could drive any run in that workspace to
  // `succeeded`.
  const { data, error } = await db
    .from("runs")
    .update(update)
    .eq("id", id)
    .eq("workspace_id", auth.scope.workspaceId)
    .eq("target_runtime_id", auth.scope.runtimeId)
    .in("status", applicableFrom(status))
    .select("id, task_id, status");

  if (error) {
    console.error("run status report failed", { runId: id, message: error.message });
    return daemonError(500, "server_error", "Could not record the run status.");
  }

  // Zero rows is a legitimate outcome, not an error: it means the guard did its
  // job (a late `running` after a terminal state) or the run is not this
  // machine's. `applied: false` lets the daemon stop retrying without treating
  // it as a failure. It deliberately does not say WHICH — the run existing in
  // another workspace must not be distinguishable from it not existing.
  const applied = (data?.length ?? 0) > 0;

  if (applied && isTerminalRunStatus(status)) {
    await reconcileTask(
      db,
      auth.scope.workspaceId,
      data![0].task_id as string | null,
      status as TerminalRunStatus,
    );
  }

  return NextResponse.json({ ok: true, applied });
}

/** A finished run settles its task. The mapping lives in `reconcile.ts`. */
async function reconcileTask(
  db: ReturnType<typeof daemonDb>,
  workspaceId: string,
  taskId: string | null,
  status: TerminalRunStatus,
) {
  if (!taskId) return;

  await db
    .from("tasks")
    .update({ status: taskStatusForRunEnd(status), updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", taskId)
    // Only a task still believed to be running. A user who moved the card while
    // the run was in flight has expressed an opinion; the daemon does not get
    // to overwrite it.
    .eq("status", "in_progress");
}
