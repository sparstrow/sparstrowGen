import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import type { DaemonErrorReason, PairResponse } from "@sparstrow/shared";
import { daemonDb, hashToken } from "@web/lib/daemon/auth";
import { daemonError, parseIdentity, readJson } from "@web/lib/daemon/respond";

/**
 * Redeem a pairing code for a daemon token.
 *
 * The only unauthenticated route under /api/daemon — its credential is the
 * pairing code itself, which `public.redeem_pairing_code` (migration 008)
 * validates, consumes and turns into a runtime, all in one transaction.
 *
 * The workspace is NOT a parameter anywhere in this flow. It comes from the
 * code's own row inside the function, so a valid code cannot be aimed at a
 * different workspace even by a caller who knows one.
 */

/** SQLSTATEs raised by redeem_pairing_code, mapped to stable client tokens. */
const CODE_ERRORS: Record<string, { status: number; reason: DaemonErrorReason }> = {
  SPG01: { status: 400, reason: "unknown_code" },
  SPG02: { status: 409, reason: "code_already_used" },
  SPG03: { status: 410, reason: "code_expired" },
};

export async function POST(request: Request) {
  const body = await readJson(request);
  const identity = parseIdentity(body);
  const code =
    body && typeof body === "object"
      ? String((body as Record<string, unknown>).code ?? "").trim()
      : "";

  if (!code || !identity) {
    return daemonError(
      400,
      "invalid_request",
      "A pairing code, hostname and os are all required.",
    );
  }

  // 32 bytes of CSPRNG output. Generated here, hashed here, and handed to the
  // database only as a hash -- the plaintext must never reach Postgres, where
  // it would surface in pg_stat_statements and error messages.
  const token = randomBytes(32).toString("base64url");
  const runtimeId = randomUUID();

  const { data, error } = await daemonDb().rpc("redeem_pairing_code", {
    p_code: code,
    p_runtime_id: runtimeId,
    p_token_hash: hashToken(token),
    p_name: identity.name,
    p_hostname: identity.hostname,
    p_os: identity.os,
    p_is_electron: identity.isElectron,
    p_capabilities: identity.capabilities,
    p_core_version: identity.coreVersion,
  });

  if (error) {
    const mapped = CODE_ERRORS[error.code ?? ""];
    if (mapped) return daemonError(mapped.status, mapped.reason, error.message);
    // Anything else is ours, not the caller's. Log it server-side; do not
    // hand the raw database error to an unauthenticated client.
    console.error("pairing redemption failed", { code: error.code, message: error.message });
    return daemonError(500, "server_error", "Could not complete pairing.");
  }

  const result = data as { runtimeId: string; workspaceId: string } | null;
  if (!result?.runtimeId) {
    return daemonError(500, "server_error", "Could not complete pairing.");
  }

  // The one and only time this token exists outside the daemon's secret store.
  // Nothing above logs it, and nothing below may either.
  const response: PairResponse = {
    token,
    runtimeId: result.runtimeId,
    workspaceId: result.workspaceId,
  };
  return NextResponse.json(response);
}
