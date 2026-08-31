import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isLoopbackCallback } from "@sparstrow/shared";
import type { StartPairingAttemptResponse } from "@sparstrow/shared";
import { daemonDb } from "@web/lib/daemon/auth";
import { daemonError, parseIdentity, readJson } from "@web/lib/daemon/respond";
import { siteOrigin } from "@web/lib/auth/origin";

/**
 * Register a browser-loopback pairing attempt.
 *
 * The only unauthenticated route under /api/daemon that CREATES something —
 * same posture as the old code-redemption route it replaces, and for the
 * same reason: the daemon calling this has no Supabase session at all. What
 * it creates is deliberately inert: a `pending` row with no workspace
 * attached yet, invisible to every RLS policy until an authenticated member
 * approves it (`pairing_attempts_approve`, policies/031). This route mints
 * nothing sensitive — no token, no access — it only records "a machine
 * claims this identity and is waiting at this loopback address."
 *
 * `runtimeId` is supplied by the caller (not generated here), because it
 * must stay stable across a re-pair of the same machine — see
 * `exchange_pairing_attempt`'s upsert-on-conflict in policies/031.
 */

const ATTEMPT_TTL_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const body = await readJson(request);
  const identity = parseIdentity(body);
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const runtimeId =
    b && typeof b.runtimeId === "string" && b.runtimeId.trim() ? b.runtimeId.trim() : "";
  const callback = b && typeof b.callback === "string" ? b.callback.trim() : "";

  if (!identity || !runtimeId) {
    return daemonError(
      400,
      "invalid_request",
      "A runtime id, hostname and os are all required.",
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
    .from("pairing_attempts")
    .insert({
      id: attemptId,
      runtime_id: runtimeId,
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
    console.error("failed to register pairing attempt", { code: error.code, message: error.message });
    return daemonError(500, "server_error", "Could not start pairing.");
  }

  const origin = siteOrigin(request, new URL(request.url));
  const response: StartPairingAttemptResponse = {
    attemptId,
    confirmUrl: `${origin}/pair?attempt=${encodeURIComponent(attemptId)}`,
  };
  return NextResponse.json(response);
}
