import { NextResponse } from "next/server";
import { isRuntimeOnline, type DaemonIdentity } from "@sparstrow/shared";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError } from "@web/lib/daemon/respond";

/**
 * Whoami. Used by `sparstrow pair --status` to answer "is this machine paired,
 * and to what?", and by the verification harness as the cheapest way to ask
 * whether a token is still good.
 */
export async function GET(request: Request) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { data, error } = await daemonDb()
    .from("runtimes")
    .select("id, workspace_id, name, status, last_heartbeat")
    .eq("id", auth.scope.runtimeId)
    .eq("workspace_id", auth.scope.workspaceId)
    .maybeSingle();

  if (error || !data) {
    // A live token whose runtime row is gone. Reachable if the row was deleted
    // without revoking the token; report it as an auth failure rather than a
    // 500, because from the daemon's side the pairing is genuinely broken and
    // re-pairing is the fix.
    return daemonError(
      401,
      "unauthenticated",
      "This token's runtime no longer exists. Pair this machine again.",
    );
  }

  const identity: DaemonIdentity = {
    runtimeId: data.id as string,
    workspaceId: data.workspace_id as string,
    name: data.name as string,
    status: data.status as string,
    lastHeartbeat: (data.last_heartbeat as string | null) ?? null,
    online: isRuntimeOnline(data.last_heartbeat as string | null),
  };
  return NextResponse.json(identity);
}
