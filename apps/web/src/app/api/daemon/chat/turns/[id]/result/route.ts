import { NextResponse } from "next/server";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import { broadcastChatTurnEvents } from "@web/lib/daemon/broadcast";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";
import { MAX_CHAT_BATCH_BYTES, parseChatResult } from "@web/lib/daemon/chat-transcript";
import { approximateBodyBytes } from "@web/lib/daemon/transcript";

/**
 * M12 — the terminal half of a chat turn's reply.
 *
 * The counterpart to `.../events/route.ts` above: one call, `status` is
 * `succeeded` or `failed`, and on `succeeded` `ingest_chat_turn_reply` inserts
 * the assistant `chat_messages` row — the ONLY place that ever happens. See
 * doc/tasks/M12/T-M12-03.
 *
 * ─── `seq` must be strictly greater than every prior events call ───────────
 *
 * `ingest_chat_turn_reply` skips its ENTIRE update — status included — when
 * `p_seq <= reply_seq`. A terminal call whose `seq` does not advance past the
 * last streamed event therefore never closes the turn: it would sit
 * `in_progress` forever, since only a `succeeded`/`failed` write can end it,
 * and this one was silently treated as stale. The daemon (T-M12-04) MUST
 * track one monotonically increasing counter across a turn's entire life —
 * every streamed delta AND the terminal call — never restart it for the
 * result call.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { id } = await params;
  const body = await readJson(request);

  if (approximateBodyBytes(body) > MAX_CHAT_BATCH_BYTES) {
    return daemonError(413, "invalid_request", `A chat result may not exceed ${MAX_CHAT_BATCH_BYTES} bytes.`);
  }

  const parsed = parseChatResult(body);
  if (!parsed.ok) {
    return daemonError(400, "invalid_request", `${parsed.rejection}: ${parsed.detail}`);
  }

  const db = daemonDb();

  // Same ownership-before-write discipline as the events route, and for the
  // same two reasons: distinguishing "not yours" from "no-op", and resolving
  // `session_id`/`workspace_id` for the broadcast topic from the row, never
  // from the body.
  const { data: owned, error: lookupError } = await db
    .from("chat_turns")
    .select("id, session_id, workspace_id")
    .eq("id", id)
    .eq("workspace_id", auth.scope.workspaceId)
    .eq("assigned_runtime_id", auth.scope.runtimeId)
    .maybeSingle();

  if (lookupError) {
    console.error("chat turn result lookup failed", { turnId: id, message: lookupError.message });
    return daemonError(500, "server_error", "Could not record the chat turn result.");
  }
  if (!owned) {
    return daemonError(404, "invalid_request", "No such chat turn for this machine.");
  }

  const { result } = parsed;

  const { data, error } = await db.rpc("ingest_chat_turn_reply", {
    p_turn_id: id,
    p_runtime_id: auth.scope.runtimeId,
    p_seq: result.seq,
    p_reply_text: result.replyText,
    p_status: result.status,
    p_error: result.error ?? null,
  });

  if (error) {
    console.error("chat turn result ingest failed", {
      turnId: id,
      seq: result.seq,
      status: result.status,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not record the chat turn result.");
  }

  const ack = (data ?? {}) as { ok?: boolean; alreadyCompleted?: boolean; stale?: boolean };
  if (ack.ok === false) {
    return daemonError(404, "invalid_request", "No such chat turn for this machine.");
  }

  if (ack.stale) {
    // The Traps section above: this seq did not advance past the last
    // streamed event, so the turn is STILL open. Logged loudly -- this is a
    // daemon sequencing bug, not a client race to shrug off silently.
    console.error("chat turn result arrived stale -- turn did not close", {
      turnId: id,
      seq: result.seq,
    });
  }

  await broadcastChatTurnEvents(
    owned.workspace_id as string,
    owned.session_id as string,
    id,
    [{ seq: result.seq, replyText: result.replyText }],
    result.status,
    result.error ?? null,
  );

  return NextResponse.json({
    ok: true,
    alreadyCompleted: ack.alreadyCompleted === true,
    stale: ack.stale === true,
  });
}
