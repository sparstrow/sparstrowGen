import { NextResponse } from "next/server";
import { authenticateRuntime, daemonDb } from "@web/lib/daemon/auth";
import { broadcastChatTurnEvents } from "@web/lib/daemon/broadcast";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";
import { approximateBodyBytes } from "@web/lib/daemon/transcript";
import { MAX_CHAT_BATCH_BYTES, latestOf, parseChatEventBatch } from "@web/lib/daemon/chat-transcript";

/**
 * M12 — the streamed half of a chat turn's reply.
 *
 * Mirrors `/api/daemon/runs/[id]/events` (M5) deliberately: durable write
 * first, broadcast after and never before, ownership resolved from the
 * bearer token and re-checked against the row before either happens. See
 * doc/tasks/M12/T-M12-03.
 *
 * ─── Only the tail is durable, the whole batch is broadcast ────────────────
 *
 * Every event already carries the FULL accumulated reply, not a delta, so
 * `ingest_chat_turn_reply` only needs the highest-seq event in this batch —
 * see `chat-transcript.ts`'s `latestOf`. The broadcast still fans out every
 * event in the batch, so a subscriber sees the reply grow progressively
 * rather than jumping straight to wherever the daemon's last flush landed.
 *
 * ─── Containment ─────────────────────────────────────────────────────────
 *
 * The service role bypasses RLS entirely on this route. `ingest_chat_turn_reply`
 * scopes its write to `(turn id, assigned runtime id)`, but this route ALSO
 * resolves ownership itself first — same discipline as the run-events route,
 * and the only way to learn the turn's `session_id`/`workspace_id` for the
 * broadcast topic without trusting anything in the body.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await authenticateRuntime(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { id } = await params;
  const body = await readJson(request);

  if (approximateBodyBytes(body) > MAX_CHAT_BATCH_BYTES) {
    return daemonError(
      413,
      "invalid_request",
      `A chat event batch may not exceed ${MAX_CHAT_BATCH_BYTES} bytes.`,
    );
  }

  const parsed = parseChatEventBatch(body);
  if (!parsed.ok) {
    return daemonError(400, "invalid_request", `${parsed.rejection}: ${parsed.detail}`);
  }

  const db = daemonDb();

  // Ownership BEFORE the write, and separately from it — same reasoning as
  // the run-events route: folding this into the write's `where` would make
  // "this turn is not yours" indistinguishable from "your write was a
  // no-op". This also resolves `session_id`/`workspace_id` for the
  // broadcast topic, which the body must never be trusted for.
  const { data: owned, error: lookupError } = await db
    .from("chat_turns")
    .select("id, session_id, workspace_id")
    .eq("id", id)
    .eq("workspace_id", auth.scope.workspaceId)
    .eq("assigned_runtime_id", auth.scope.runtimeId)
    .maybeSingle();

  if (lookupError) {
    console.error("chat turn event lookup failed", { turnId: id, message: lookupError.message });
    return daemonError(500, "server_error", "Could not record the chat turn events.");
  }
  if (!owned) {
    return daemonError(404, "invalid_request", "No such chat turn for this machine.");
  }

  const latest = latestOf(parsed.events);

  const { data, error } = await db.rpc("ingest_chat_turn_reply", {
    p_turn_id: id,
    p_runtime_id: auth.scope.runtimeId,
    p_seq: latest.seq,
    p_reply_text: latest.replyText,
    p_status: "running",
  });

  if (error) {
    // The reply text is NEVER logged — same reasoning as the run-events
    // route: it is the user's conversation, not diagnostic data.
    console.error("chat turn ingest failed", {
      turnId: id,
      seq: latest.seq,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not record the chat turn events.");
  }

  const result = (data ?? {}) as { ok?: boolean; alreadyCompleted?: boolean; stale?: boolean };
  if (result.ok === false) {
    // Ownership was just confirmed above, so this can only mean the turn was
    // deleted between that read and this write -- treat it the same as "not
    // yours", not as a 500.
    return daemonError(404, "invalid_request", "No such chat turn for this machine.");
  }

  // Broadcast unconditionally once ownership is confirmed, whether or not
  // this particular write advanced anything -- same discipline as
  // `broadcastRunEvents`: a stale or duplicate batch is harmless to
  // re-broadcast, because the client merges by `seq` on its side.
  //
  // Awaited rather than fire-and-forget: this is a serverless function, and
  // work left running after the response is not guaranteed to finish.
  await broadcastChatTurnEvents(
    owned.workspace_id as string,
    owned.session_id as string,
    id,
    parsed.events,
    "running",
  );

  return NextResponse.json({
    ok: true,
    storedThroughSeq: latest.seq,
    alreadyCompleted: result.alreadyCompleted === true,
  });
}
