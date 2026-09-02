import { NextResponse } from "next/server";
import { authenticateRuntime, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, parseIdentity, readJson } from "@web/lib/daemon/respond";

/**
 * "Here is what I am." Sent on every boot, not only at pairing.
 *
 * Capabilities change — someone installs a CLI, adds an API key, upgrades
 * core. A register-once model means the cloud's picture is accurate exactly
 * once and drifts from then on, and M4 dispatches on that picture.
 *
 * The runtime being described is the one the token is scoped to. There is no
 * id in the payload to disagree with it.
 */
export async function POST(request: Request) {
  const auth = await authenticateRuntime(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const identity = parseIdentity(await readJson(request));
  if (!identity) {
    return daemonError(400, "invalid_request", "hostname and os are required.");
  }

  // `name` is deliberately absent from this update. It defaults to the
  // hostname at pairing and is editable in the UI; machines get renamed to
  // things like "desk" and "laptop", and re-registering on every boot must not
  // stomp a name the owner chose. Renaming is the browser's job, not the
  // daemon's.
  const { error } = await daemonDb()
    .from("runtimes")
    .update({
      hostname: identity.hostname,
      os: identity.os,
      is_electron: identity.isElectron,
      capabilities: identity.capabilities,
      core_version: identity.coreVersion,
      status: "online",
      last_heartbeat: new Date().toISOString(),
      // Boot is the other half of the settings report (`POST /api/daemon/
      // settings` handles changes). Sending it here means a machine whose
      // switch was flipped in its own local Settings card shows the right
      // value in the Machines card without anyone touching the cloud.
      ...(identity.settings ? { reported_settings: identity.settings } : {}),
    })
    .eq("id", auth.scope.runtimeId)
    .eq("workspace_id", auth.scope.workspaceId);

  if (error) {
    console.error("registration failed", {
      runtimeId: auth.scope.runtimeId,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not register this machine.");
  }

  return NextResponse.json({ ok: true });
}
