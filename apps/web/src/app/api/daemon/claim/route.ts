import { NextResponse } from "next/server";
import type { ClaimMachineResponse } from "@sparstrow/shared";
import { authenticateMachine, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, parseIdentity, readJson } from "@web/lib/daemon/respond";

/**
 * "This computer is mine, and here is what it can do."
 *
 * The single entry point for a machine joining a person's account, used by
 * every path: the desktop app on launch (US1), `sparstrow setup` after its
 * loopback exchange (US5), and a headless box started with a hand-made token
 * (US6). One claim path rather than three that drift.
 *
 * Idempotent by construction, and called on EVERY boot rather than once at
 * setup. That is deliberate: workspace membership changes without this machine
 * being involved — the owner creates a personal workspace on their phone, or
 * leaves one — and a claim-once model means the machine's runtime list is
 * accurate exactly once and silently wrong from then on. `claim_machine` adds
 * runtimes for workspaces gained and removes them for workspaces left, so a
 * boot is also a reconciliation.
 *
 * The user id handed to the RPC comes from `authenticateMachine`, never from
 * the body — see the banner in `lib/daemon/auth.ts`. This route is the reason
 * that banner had to be restated rather than deleted when machine credentials
 * became person-scoped.
 */
export async function POST(request: Request) {
  const auth = await authenticateMachine(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const body = await readJson(request);
  const identity = parseIdentity(body);
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const machineId =
    b && typeof b.machineId === "string" && b.machineId.trim() ? b.machineId.trim() : "";

  if (!identity || !machineId) {
    return daemonError(400, "invalid_request", "A machine id, hostname and os are all required.");
  }

  // A token already bound to a DIFFERENT machine may not claim this one. The
  // insert policy in 033 stops a token being created against someone else's
  // machine; this stops a legitimately-issued one being moved to a second
  // computer after the fact — copy the secrets file to another laptop and it
  // is refused rather than silently claiming that laptop too.
  if (auth.scope.machineId && auth.scope.machineId !== machineId) {
    return daemonError(
      403,
      "revoked",
      "This token belongs to a different computer. Create a new one for this machine.",
    );
  }

  const { data, error } = await daemonDb().rpc("claim_machine", {
    p_machine_id: machineId,
    p_user_id: auth.scope.userId,
    p_name: identity.name ?? identity.hostname,
    p_os: identity.os,
    p_hostname: identity.hostname,
    p_is_electron: identity.isElectron,
    p_capabilities: identity.capabilities,
    p_core_version: identity.coreVersion,
    p_token_id: auth.scope.tokenId,
  });

  if (error) {
    console.error("claim failed", { code: error.code, message: error.message });
    return daemonError(500, "server_error", "Could not connect this computer.");
  }

  const result = data as ClaimMachineResponse | null;
  if (!result?.machineId) {
    return daemonError(500, "server_error", "Could not connect this computer.");
  }

  // A machine with zero runtimes is a real, reachable state — a brand-new
  // account whose workspace bootstrap has not run yet. Returned as an empty
  // list rather than an error, because the machine's correct response is to
  // keep heartbeating and re-claim, not to treat itself as broken.
  return NextResponse.json(result);
}
