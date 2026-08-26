import { NextResponse } from "next/server";
import type { AckRequest, CommandFailureReason } from "@sparstrow/shared";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";
import { boardEffectFor } from "@web/lib/daemon/reconcile";

/**
 * "Here is what happened to that command."
 *
 * Two jobs, and the split between them is the security boundary:
 *
 *   1. Close the command row. That is `ack_runtime_command` (009), scoped to
 *      the runtime that claimed it, and idempotent — a daemon retries an ack
 *      whose response was lost, and an error on the retry would tell it to redo
 *      work it has already done.
 *
 *   2. Translate the failure reason into BOARD state. That happens here, in the
 *      control plane, from a closed set of tokens — never in the daemon. A
 *      daemon able to write task statuses directly could mark every task in a
 *      workspace done, and dispatch already means a task row can cause code to
 *      run on someone's machine; it must not also mean a machine can rewrite
 *      the board.
 */

const REASONS = new Set<CommandFailureReason>([
  "project_not_available",
  "agent_not_available",
  "agent_disabled",
  "spawn_failed",
  "clone_failed",
  "setting_not_allowed",
  "unknown_kind",
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { id } = await params;
  const body = (await readJson(request)) as AckRequest | null;
  const status = body?.status;

  if (status !== "done" && status !== "failed") {
    return daemonError(400, "invalid_request", "status must be done or failed.");
  }

  const reason = body?.reason && REASONS.has(body.reason) ? body.reason : null;

  const db = daemonDb();

  // Read the command BEFORE acking, for its payload. After the ack it is still
  // there, but reading first keeps the ordering obvious: we learn which run and
  // task this was about, then close it, then reconcile the board.
  const { data: command } = await db
    .from("runtime_commands")
    .select("id, kind, payload, workspace_id")
    .eq("id", id)
    .eq("runtime_id", auth.scope.runtimeId)
    .eq("workspace_id", auth.scope.workspaceId)
    .maybeSingle();

  const { data: acked, error } = await db.rpc("ack_runtime_command", {
    p_id: id,
    p_runtime_id: auth.scope.runtimeId,
    p_status: status,
    p_error: body?.error ?? null,
  });

  if (error) {
    console.error("command ack failed", { commandId: id, message: error.message });
    return daemonError(500, "server_error", "Could not record the acknowledgement.");
  }

  const result = (acked ?? {}) as { ok?: boolean; alreadyCompleted?: boolean; reason?: string };
  if (result.ok === false) {
    // The command is not this runtime's, or does not exist. Deliberately the
    // same answer for both: distinguishing them would make this an oracle for
    // command ids belonging to other machines.
    return daemonError(404, "invalid_request", "No such command for this machine.");
  }

  if (status === "failed" && reason && command) {
    await reconcileBoard({
      db,
      workspaceId: auth.scope.workspaceId,
      runtimeId: auth.scope.runtimeId,
      payload: (command.payload ?? {}) as Record<string, unknown>,
      reason,
      error: body?.error ?? null,
      detail: body?.detail ?? null,
    });
  }

  // M12: a `chat.turn` command failing here means the daemon rejected it
  // before ever reaching T-M12-03's own routes (unknown kind, agent/project
  // miss, spawn failure) -- nothing else closes the `chat_turns` row in that
  // case. Live-confirmed as a real gap during T-M12-01's testing: the row
  // stayed `in_progress` forever until this was wired in. Deliberately not
  // gated on `reason` being set -- a bare failed ack with no reason token
  // still must not leave a turn stuck.
  if (status === "failed" && command?.kind === "chat.turn") {
    await closeFailedChatTurn({
      db,
      runtimeId: auth.scope.runtimeId,
      payload: (command.payload ?? {}) as Record<string, unknown>,
      reason,
      error: body?.error ?? null,
    });
  }

  return NextResponse.json({ ok: true, alreadyCompleted: result.alreadyCompleted === true });
}

/**
 * Close out a `chat_turns` row for a command that never reached
 * `/api/daemon/chat/turns/:id/*` at all. Scoped by `(turn id, assigned
 * runtime id)` -- the same containment `ingest_chat_turn_reply` enforces
 * itself -- so a miss here (turn reassigned or deleted since this command
 * was claimed) is a legitimate no-op, not an error.
 */
async function closeFailedChatTurn(args: {
  db: ReturnType<typeof daemonDb>;
  runtimeId: string;
  payload: Record<string, unknown>;
  reason: CommandFailureReason | null;
  error: string | null;
}) {
  const { db, runtimeId, payload, reason, error } = args;
  const turnId = typeof payload.turnId === "string" ? payload.turnId : null;
  if (!turnId) return;

  const { data: turn } = await db
    .from("chat_turns")
    .select("reply_seq, reply_text")
    .eq("id", turnId)
    .eq("assigned_runtime_id", runtimeId)
    .maybeSingle();

  if (!turn) return;

  await db.rpc("ingest_chat_turn_reply", {
    p_turn_id: turnId,
    p_runtime_id: runtimeId,
    p_seq: (turn.reply_seq as number) + 1,
    p_reply_text: (turn.reply_text as string) ?? "",
    p_status: "failed",
    p_error: error ?? reason ?? "The command failed before it could run.",
  });
}

/**
 * Apply the board effect this reason implies. The mapping itself — which is the
 * part with judgement in it — lives in `reconcile.ts` and is tested there.
 */
async function reconcileBoard(args: {
  db: ReturnType<typeof daemonDb>;
  workspaceId: string;
  runtimeId: string;
  payload: Record<string, unknown>;
  reason: CommandFailureReason;
  error: string | null;
  detail: string | null;
}) {
  const { db, workspaceId, runtimeId, payload, reason, error, detail } = args;
  const effect = boardEffectFor(reason);
  const now = new Date().toISOString();

  const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
  const runId = typeof payload.runId === "string" ? payload.runId : null;
  const projectId = typeof payload.projectId === "string" ? payload.projectId : null;

  if (effect.markBindingMissing && projectId) {
    // `detail` carries the path the daemon actually checked, so the UI's relink
    // action can pre-fill it rather than asking the user to remember where the
    // project used to live.
    await db
      .from("runtime_projects")
      .update({ state: "missing", detail: detail ?? error, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("runtime_id", runtimeId)
      .eq("project_id", projectId);
  }

  if (effect.taskStatus && taskId) {
    await db
      .from("tasks")
      .update({ status: effect.taskStatus, result: error, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("id", taskId);
  }

  if (effect.failRun && runId) {
    await db
      .from("runs")
      .update({ status: "failed", error: error ?? reason, finished_at: now, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("id", runId)
      .in("status", ["queued", "running"]);
  }

  // A clone that failed has no run and no task — the binding is the only thing
  // that can carry the error, and it is the thing the UI is showing.
  if (reason === "clone_failed" && projectId) {
    await db
      .from("runtime_projects")
      .update({ state: "error", detail: error, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("runtime_id", runtimeId)
      .eq("project_id", projectId);
  }
}
