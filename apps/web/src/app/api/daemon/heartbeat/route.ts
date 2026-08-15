import { NextResponse } from "next/server";
import { HEARTBEAT_STALE_AFTER_MS, type HeartbeatResponse } from "@sparstrow/shared";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError } from "@web/lib/daemon/respond";

/**
 * "I am still here."
 *
 * `last_heartbeat` is written from the DATABASE clock, never from a timestamp
 * the daemon sends. A laptop resuming from sleep has a skewed clock often
 * enough that trusting it would let a machine declare itself permanently fresh
 * or permanently stale — and the resulting bug looks like a network fault,
 * which is the wrong place to go looking.
 *
 * The route takes no meaningful body for the same reason it takes no runtime
 * id: everything it needs is established by the token.
 */
export async function POST(request: Request) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  // `last_heartbeat` only. Deliberately NOT `status: "online"`, even though it
  // reads as the obvious thing to write here: status is for states a daemon
  // DECLARES about itself (`draining` at shutdown), and liveness is derived
  // from this timestamp. Writing "online" on every beat would also let a beat
  // still in flight when shutdown declared `draining` land afterwards and
  // resurrect it.
  const { error } = await daemonDb()
    .from("runtimes")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("id", auth.scope.runtimeId)
    .eq("workspace_id", auth.scope.workspaceId);

  if (error) {
    console.error("heartbeat failed", { runtimeId: auth.scope.runtimeId, message: error.message });
    return daemonError(500, "server_error", "Could not record the heartbeat.");
  }

  const response: HeartbeatResponse = {
    serverTime: new Date().toISOString(),
    staleAfterMs: HEARTBEAT_STALE_AFTER_MS,
  };
  return NextResponse.json(response);
}
