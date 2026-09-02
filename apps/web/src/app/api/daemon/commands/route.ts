import { NextResponse } from "next/server";
import { COMMAND_LEASE_MS, type ClaimedCommand, type ClaimResponse } from "@sparstrow/shared";
import { authenticateRuntime, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError } from "@web/lib/daemon/respond";

/**
 * "What have you got for me?" — the daemon's poll.
 *
 * A GET with no body, on purpose. Everything this needs — which runtime, which
 * workspace — comes from the bearer token. A POST would invite someone to add a
 * parameter to it, and the first parameter anyone would reach for is a runtime
 * id, which is exactly the thing that must never come from the caller.
 *
 * The atomicity lives in `claim_runtime_commands` (009): one UPDATE ...
 * RETURNING with FOR UPDATE SKIP LOCKED, which is what stops two polls — or two
 * machines racing a re-dispatch after a lease expiry — from both getting the
 * same row. This route is the thin authenticated wrapper around it.
 *
 * Empty is the common answer and is not an error. A machine idle overnight asks
 * ~28,000 times and gets `{ commands: [] }` every time.
 */
export async function GET(request: Request) {
  const auth = await authenticateRuntime(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { data, error } = await daemonDb().rpc("claim_runtime_commands", {
    p_runtime_id: auth.scope.runtimeId,
    p_limit: 10,
    p_lease_ms: COMMAND_LEASE_MS,
  });

  if (error) {
    console.error("command claim failed", {
      runtimeId: auth.scope.runtimeId,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not claim commands.");
  }

  // The workspace filter is belt-and-braces: the RPC already scopes to the
  // runtime, and a runtime belongs to exactly one workspace. It stays because
  // this route holds the service role, and "the id was already scoped upstream"
  // is precisely the reasoning that produced M2's cross-workspace defects.
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const commands: ClaimedCommand[] = rows
    .filter((row) => row.workspace_id === auth.scope.workspaceId)
    .map((row) => ({
      id: row.id as string,
      kind: row.kind as ClaimedCommand["kind"],
      payload: (row.payload ?? {}) as Record<string, unknown>,
      attempts: (row.attempts as number) ?? 0,
      leaseExpiresAt: (row.lease_expires_at as string | null) ?? null,
      createdAt: row.created_at as string,
    }));

  const { data: workspace } = await daemonDb()
    .from("workspaces")
    .select("allowed_tools, disallowed_tools")
    .eq("id", auth.scope.workspaceId)
    .maybeSingle();

  const response: ClaimResponse = { 
    commands,
    workspaceTools: workspace ? {
      allowedTools: (workspace.allowed_tools as string[]) ?? [],
      disallowedTools: (workspace.disallowed_tools as string[]) ?? [],
    } : undefined
  };
  return NextResponse.json(response);
}
