import { NextResponse } from "next/server";
import { CHAT_ATTACHMENT_BUCKET } from "@sparstrow/shared";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * T-AM1-01 (AM1, band 27). The write-side counterpart to `../sign/route.ts`:
 * mints a short-lived signed UPLOAD URL for a file the daemon is about to
 * put into the bucket, rather than one it is about to read from it.
 *
 * Same `/api/daemon/*` shape and the same reasoning as the sign-download
 * route: `workspace_id` comes ONLY from `authenticateDaemon`'s validated
 * scope, never trusted from the body, and the body's `storagePath` is
 * checked against that scope explicitly below. This check matters MORE here
 * than on the read side — `daemonDb()` is a service-role client that bypasses
 * RLS entirely, so without it a compromised or misbehaving daemon could
 * obtain a working WRITE URL into another workspace's prefix, not just a read
 * of one file.
 *
 * `producedStoragePath` (in `@sparstrow/shared`) is what composes the path
 * this route validates; it is not composed here, because the caller (the
 * daemon) is the one that knows the filename and picks the opaque id.
 */
export async function POST(request: Request) {
  const auth = await authenticateDaemon(request);
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
      "That path does not belong to this machine's workspace.",
    );
  }

  const db = daemonDb();
  const { data, error } = await db.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl || !data?.token) {
    console.error("chat/attachments/sign-upload: createSignedUploadUrl failed", {
      workspaceId: auth.scope.workspaceId,
      storagePath,
      message: error?.message,
    });
    return daemonError(500, "server_error", "Could not sign that upload.");
  }

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
}
