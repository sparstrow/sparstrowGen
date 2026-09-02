import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import type { ConnectExchangeResponse, DaemonErrorReason } from "@sparstrow/shared";
import { daemonDb, hashToken } from "@web/lib/daemon/auth";
import { daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * Exchange an approved connection attempt for a real access token.
 *
 * Called by the machine's own local loopback listener, server-to-server —
 * never by the browser, which only ever carries the attempt id as far as that
 * listener (see `apps/web/src/app/connect/page.tsx`'s confirm action). The real
 * token is minted here and nowhere earlier: this call can only succeed once the
 * browser's redirect has already reached the listener, which is what closes the
 * ghost-machine race a mint-before-redirect design would have.
 *
 * Unauthenticated for the same reason `/api/daemon/connect` is: the machine has
 * no credential yet. The attempt id IS the credential here —
 * `exchange_connect_attempt` (policies/033) is service-role only, unreachable
 * from anon or authenticated.
 */

const ATTEMPT_ERRORS: Record<string, { status: number; reason: DaemonErrorReason }> = {
  SCA00: { status: 400, reason: "invalid_request" },
  SCA01: { status: 400, reason: "unknown_attempt" },
  SCA02: { status: 409, reason: "attempt_not_approved" },
  SCA03: { status: 409, reason: "attempt_already_consumed" },
  SCA04: { status: 410, reason: "attempt_expired" },
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

  // Same discipline the workspace-scoped version had: 32 bytes of CSPRNG
  // output, generated here, hashed here, and handed to the database only as a
  // hash.
  const token = randomBytes(32).toString("base64url");

  const { data, error } = await daemonDb().rpc("exchange_connect_attempt", {
    p_attempt_id: attemptId,
    p_token_hash: hashToken(token),
  });

  if (error) {
    const mapped = ATTEMPT_ERRORS[error.code ?? ""];
    if (mapped) return daemonError(mapped.status, mapped.reason, error.message);
    console.error("connect attempt exchange failed", { code: error.code, message: error.message });
    return daemonError(500, "server_error", "Could not finish connecting this computer.");
  }

  const result = data as { tokenId: string; userId: string; machineId: string } | null;
  if (!result?.tokenId) {
    return daemonError(500, "server_error", "Could not finish connecting this computer.");
  }

  // The one and only time this token exists outside the machine's secret store.
  // Nothing above logs it, and nothing below may either. The machine calls
  // /api/daemon/claim with it next, which is what actually creates its runtimes.
  const response: ConnectExchangeResponse = {
    token,
    tokenId: result.tokenId,
    machineId: result.machineId,
  };
  return NextResponse.json(response);
}
