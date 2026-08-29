import { NextResponse } from "next/server";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * T-CS3-03 (Band 26, CS chat session & conversation UX). Where a daemon
 * lands a `providers.discover_models` result.
 *
 * Same shape as every other `/api/daemon/*` write (see
 * `apps/web/src/lib/daemon/auth.ts`'s header): `workspace_id` comes ONLY
 * from `authenticateDaemon`'s validated scope, never from the body.
 * `record_provider_models` trusts it entirely and has no internal
 * membership check of its own — this route's `authenticateDaemon` call is
 * the actual boundary, and the migration additionally revokes PostgREST
 * execute on that function from every client role, so it cannot be reached
 * any other way.
 */
export async function POST(request: Request) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const body = await readJson(request);
  if (!body || typeof body !== "object") {
    return daemonError(400, "invalid_request", "Expected a JSON body.");
  }
  const { provider, models, live, detail } = body as Record<string, unknown>;

  if (typeof provider !== "string" || !provider) {
    return daemonError(400, "invalid_request", "provider is required.");
  }
  if (!Array.isArray(models) || !models.every((m) => typeof m === "string")) {
    return daemonError(400, "invalid_request", "models must be an array of strings.");
  }
  if (typeof live !== "boolean") {
    return daemonError(400, "invalid_request", "live must be a boolean.");
  }
  if (detail !== null && typeof detail !== "string") {
    return daemonError(400, "invalid_request", "detail must be a string or null.");
  }

  const db = daemonDb();
  const { error } = await db.rpc("record_provider_models", {
    p_workspace_id: auth.scope.workspaceId,
    p_provider: provider,
    p_models: models,
    p_live: live,
    p_detail: detail,
  });

  if (error) {
    console.error("record_provider_models failed", {
      workspaceId: auth.scope.workspaceId,
      provider,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not record the discovered model list.");
  }

  return NextResponse.json({ ok: true });
}
