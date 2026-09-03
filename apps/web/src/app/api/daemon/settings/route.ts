import { NextResponse } from "next/server";
import { DAEMON_SETTABLE_KEYS } from "@sparstrow/shared";
import { authenticateRuntime, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * A daemon reporting its current values for the remotely-settable settings.
 *
 * This is the half of `settings.set` that makes the control honest. Without it
 * the Machines card could only show what the browser last sent, which is the
 * "flips and silently changes nothing" failure G-6 was opened about — and it
 * would also miss a switch flipped in the machine's own local Settings card.
 *
 * Separate from `/register` on purpose: registration runs an 8-second
 * capability probe, and an identity payload with an unprobed `capabilities: []`
 * would wipe the field M4 dispatches on.
 *
 * Filtered against the same allowlist the daemon and the enqueue route use.
 * A machine cannot report a value for a key nobody agreed it may hold — this
 * column is rendered in the UI, and an unfiltered write is a free text field
 * on someone else's screen.
 */
export async function POST(request: Request) {
  const auth = await authenticateRuntime(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const body = await readJson(request);
  const raw =
    body && typeof body === "object" ? (body as Record<string, unknown>).settings : null;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return daemonError(400, "invalid_request", "settings must be an object of key/value pairs.");
  }

  const reported: Record<string, string> = {};
  for (const key of DAEMON_SETTABLE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string") reported[key] = value;
  }

  const { error } = await daemonDb()
    .from("runtimes")
    .update({ reported_settings: reported })
    .eq("id", auth.scope.runtimeId)
    .eq("workspace_id", auth.scope.workspaceId);

  if (error) {
    console.error("settings report failed", {
      runtimeId: auth.scope.runtimeId,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not record the settings.");
  }

  return NextResponse.json({ ok: true });
}
