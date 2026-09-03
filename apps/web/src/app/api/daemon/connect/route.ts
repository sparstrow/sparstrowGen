import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isLoopbackCallback } from "@sparstrow/shared";
import type { StartConnectAttemptResponse } from "@sparstrow/shared";
import { daemonDb } from "@web/lib/daemon/auth";
import { daemonError, parseIdentity, readJson } from "@web/lib/daemon/respond";
import { siteOrigin } from "@web/lib/auth/origin";

/**
 * Register a browser-loopback connection attempt.
 *
 * The only unauthenticated route under /api/daemon that CREATES something —
 * necessarily so: a machine with no credential yet has nothing to authenticate
 * with. What it creates is deliberately inert: a `pending` row owned by nobody,
 * which no RLS policy will attach to a person until one signs in and approves
 * it (`connect_attempts_approve`, policies/033). This route mints nothing
 * sensitive — no token, no access — it only records "a machine claims this
 * identity and is waiting at this loopback address."
 *
 * `machineId` is supplied by the caller rather than generated here, because it
 * must stay stable across a re-connect of the same computer — otherwise every
 * re-connect would produce a second machine row for one piece of hardware.
 * See `claim_machine`'s upsert-on-conflict in policies/033.
 *
 * This is US5's path — a computer with no signed-in app of its own. The common
 * case (US1, the desktop app) never comes here at all: it already has a signed-
 * in session, so it mints a token directly and goes straight to /claim.
 */

const ATTEMPT_TTL_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const body = await readJson(request);
  const identity = parseIdentity(body);
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const machineId =
    b && typeof b.machineId === "string" && b.machineId.trim() ? b.machineId.trim() : "";
  const callback = b && typeof b.callback === "string" ? b.callback.trim() : "";

  if (!identity || !machineId) {
    return daemonError(
      400,
      "invalid_request",
      "A machine id, hostname and os are all required.",
    );
  }
  if (!callback || !isLoopbackCallback(callback)) {
    return daemonError(
      400,
      "invalid_callback",
      "The callback must be a plain-HTTP loopback address (127.0.0.1, ::1, or localhost).",
    );
  }

  const attemptId = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString();

  const { error } = await daemonDb()
    .from("connect_attempts")
    .insert({
      id: attemptId,
      machine_id: machineId,
      name: identity.name ?? identity.hostname,
      os: identity.os,
      hostname: identity.hostname,
      is_electron: identity.isElectron,
      capabilities: identity.capabilities,
      core_version: identity.coreVersion,
      callback,
      status: "pending",
      expires_at: expiresAt,
    });

  if (error) {
    console.error("failed to register connect attempt", {
      code: error.code,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not start connecting this computer.");
  }

  const origin = siteOrigin(request, new URL(request.url));
  const response: StartConnectAttemptResponse = {
    attemptId,
    confirmUrl: `${origin}/connect?attempt=${encodeURIComponent(attemptId)}`,
  };
  return NextResponse.json(response);
}
