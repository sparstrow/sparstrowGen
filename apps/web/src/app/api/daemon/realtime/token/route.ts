import { NextResponse } from "next/server";
import type { RealtimeCredential } from "@sparstrow/shared";
import { authenticateDaemon } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError } from "@web/lib/daemon/respond";
import { mintRealtimeToken } from "@web/lib/daemon/realtime-token";

/**
 * T-M16-02 — let a paired machine trade its daemon bearer token for a
 * short-lived Realtime credential, so it can hold the control channel M16
 * puts it on. Takes no body: workspace and runtime both come from the token,
 * same discipline every other `/api/daemon/*` route follows (`auth.ts`'s
 * banner comment).
 */
export async function POST(request: Request) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  let minted: RealtimeCredential;
  try {
    minted = await mintRealtimeToken({
      workspaceId: auth.scope.workspaceId,
      runtimeId: auth.scope.runtimeId,
    });
  } catch (err) {
    // Never the token, never the signing key. `err.message` here is a
    // misconfiguration diagnostic (a missing or malformed env var), not
    // anything derived from the request.
    console.error("realtime token mint failed", {
      runtimeId: auth.scope.runtimeId,
      message: err instanceof Error ? err.message : "unknown",
    });
    return daemonError(500, "server_error", "Could not mint a Realtime credential.");
  }

  return NextResponse.json(minted);
}
