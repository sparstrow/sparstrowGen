import { NextResponse } from "next/server";
import { CHAT_ATTACHMENT_BUCKET } from "@sparstrow/shared";
import { authenticateRuntime, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * T-CS5-03 (Band 26, CS5 chat attachments). Mints a short-lived signed URL
 * for one attachment, on demand, immediately before the daemon downloads it.
 *
 * Deliberately NOT baked into the `chat.turn` dispatch payload (correcting
 * the plan's own approximate framing — see `ChatTurnStartPayload.attachments`'s
 * own comment): a parked turn can sit for as long as
 * `private.rescan_waiting_chat_turns` takes to find an online runtime, and a
 * signed URL minted once at the ORIGINAL dispatch attempt would already have
 * expired by then. Minting lazily, right before use, sidesteps that entirely
 * — the dispatch payload only ever needs the durable `storagePath`.
 *
 * Same `/api/daemon/*` shape as every other route here (see
 * `apps/web/src/lib/daemon/auth.ts`'s header): `workspace_id` comes ONLY
 * from `authenticateRuntime`'s validated scope, never trusted from the body.
 * The body's `storagePath` is checked against that scope explicitly, below
 * — the bucket's own RLS (`025_chat_attachments_storage.sql`) has no
 * bearing here at all, since `daemonDb()` is a service-role client that
 * bypasses RLS entirely. Without this check, a compromised or misbehaving
 * daemon could ask this route to sign ANY workspace's attachment path and
 * receive a real, working URL to it.
 */
export async function POST(request: Request) {
  const auth = await authenticateRuntime(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const body = await readJson(request);
  if (!body || typeof body !== "object") {
    return daemonError(400, "invalid_request", "Expected a JSON body.");
  }
  const { storagePath } = body as Record<string, unknown>;

  if (typeof storagePath !== "string" || !storagePath) {
    return daemonError(400, "invalid_request", "storagePath is required.");
  }
  if (!storagePath.startsWith(`${auth.scope.workspaceId}/`)) {
    return daemonError(
      403,
      "invalid_request",
      "That attachment does not belong to this machine's workspace.",
    );
  }

  const db = daemonDb();
  // 300s: a few minutes past what the daemon plausibly needs to claim this
  // command and start the download (this task's own Trap) -- not hours.
  const { data, error } = await db.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, 300);

  if (error || !data?.signedUrl) {
    console.error("chat/attachments/sign: createSignedUrl failed", {
      workspaceId: auth.scope.workspaceId,
      storagePath,
      message: error?.message,
    });
    return daemonError(500, "server_error", "Could not sign that attachment.");
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}
