import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import type { DaemonErrorReason, PairResponse } from "@sparstrow/shared";
import { daemonDb, hashToken } from "@web/lib/daemon/auth";
import { daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * Exchange an approved pairing attempt for a real daemon token.
 *
 * Called by the daemon's own local loopback listener, server-to-server —
 * never by the browser, which only ever carries the attempt id as far as
 * that listener (see `apps/web/src/app/pair/page.tsx`'s confirm action). The
 * real token is minted here and nowhere earlier: this call can only succeed
 * once the browser's redirect has already reached the daemon's listener,
 * which is what closes the ghost-machine race a mint-before-redirect design
 * would have had — see the plan's Decisions section.
 *
 * Unauthenticated for the same reason `/api/daemon/pair` was: the daemon has
 * no Supabase session. The attempt id is the credential here, exactly as the
 * old pairing code was — `exchange_pairing_attempt` (policies/031) is
 * service-role only, unreachable from anon or authenticated.
 */

const ATTEMPT_ERRORS: Record<string, { status: number; reason: DaemonErrorReason }> = {
  SPA00: { status: 400, reason: "invalid_request" },
  SPA01: { status: 400, reason: "unknown_attempt" },
  SPA02: { status: 409, reason: "attempt_not_approved" },
  SPA03: { status: 409, reason: "attempt_already_consumed" },
  SPA04: { status: 410, reason: "attempt_expired" },
};

export async function POST(request: Request) {
  const body = await readJson(request);
  const attemptId =
    body && typeof body === "object"
      ? String((body as Record<string, unknown>).attemptId ?? "").trim()
      : "";

  if (!attemptId) {
    return daemonError(400, "invalid_request", "An attempt id is required.");
  }

  // Same discipline as the old /api/daemon/pair: 32 bytes of CSPRNG output,
  // generated here, hashed here, and handed to the database only as a hash.
  const token = randomBytes(32).toString("base64url");

  const { data, error } = await daemonDb().rpc("exchange_pairing_attempt", {
    p_attempt_id: attemptId,
    p_token_hash: hashToken(token),
  });

  if (error) {
    const mapped = ATTEMPT_ERRORS[error.code ?? ""];
    if (mapped) return daemonError(mapped.status, mapped.reason, error.message);
    console.error("pairing attempt exchange failed", { code: error.code, message: error.message });
    return daemonError(500, "server_error", "Could not complete pairing.");
  }

  const result = data as { runtimeId: string; workspaceId: string } | null;
  if (!result?.runtimeId) {
    return daemonError(500, "server_error", "Could not complete pairing.");
  }

  // The one and only time this token exists outside the daemon's secret
  // store. Nothing above logs it, and nothing below may either.
  const response: PairResponse = {
    token,
    runtimeId: result.runtimeId,
    workspaceId: result.workspaceId,
  };
  return NextResponse.json(response);
}
