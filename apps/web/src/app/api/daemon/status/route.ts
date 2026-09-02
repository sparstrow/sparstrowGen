import { NextResponse } from "next/server";
import { authenticateRuntime, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * A daemon declaring a state about itself.
 *
 * Added with T-M3-06 (heartbeat), not in T-M3-02's original four routes: it
 * only became necessary once graceful shutdown had something to say. Without
 * it, stopping a machine cleanly looks exactly like the machine dying — the UI
 * waits out the full staleness window before noticing, and there is no way to
 * tell "I shut this down" from "this crashed".
 *
 * This is the ONLY thing `runtimes.status` is for. Liveness is derived from
 * `last_heartbeat` age; status carries what a daemon deliberately says.
 */

/**
 * Allowlisted, deliberately. `status` is a free-text column, so without this a
 * daemon could write anything into a field the UI renders — and later, once M4
 * routes dispatch by state, one it makes decisions on.
 */
const DECLARABLE = new Set(["draining", "online"]);

export async function POST(request: Request) {
  const auth = await authenticateRuntime(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const body = await readJson(request);
  const status =
    body && typeof body === "object"
      ? String((body as Record<string, unknown>).status ?? "")
      : "";

  if (!DECLARABLE.has(status)) {
    return daemonError(
      400,
      "invalid_request",
      `status must be one of: ${[...DECLARABLE].join(", ")}`,
    );
  }

  const { error } = await daemonDb()
    .from("runtimes")
    .update({ status })
    .eq("id", auth.scope.runtimeId)
    .eq("workspace_id", auth.scope.workspaceId);

  if (error) {
    console.error("status declaration failed", {
      runtimeId: auth.scope.runtimeId,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not record the status.");
  }

  return NextResponse.json({ ok: true });
}
