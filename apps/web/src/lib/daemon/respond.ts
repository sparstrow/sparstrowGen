import { NextResponse } from "next/server";
import {
  DAEMON_SETTABLE_KEYS,
  type DaemonErrorReason,
  type DaemonErrorResponse,
  type RuntimeIdentity,
} from "@sparstrow/shared";
import type { DaemonAuthFailure } from "@web/lib/daemon/auth";

/**
 * Shared response shapes for `/api/daemon/*`.
 *
 * Every failure carries a stable `reason` token alongside its prose. The CLI
 * (T-M3-04) has to tell a typo from a reused code from an expired one, and
 * matching on message text breaks the first time someone improves the wording.
 */

export function daemonError(
  status: number,
  reason: DaemonErrorReason,
  error: string,
): NextResponse<DaemonErrorResponse> {
  return NextResponse.json({ reason, error }, { status });
}

/**
 * 401 for an absent or unrecognised token, 403 for one the owner revoked, 404
 * for a runtime this token may not act as.
 *
 * `unknown_runtime` is deliberately NOT a 403. A machine hits it in one
 * ordinary, non-suspicious situation — the owner left a workspace, so the
 * runtime it was addressing no longer exists — and the machine's correct
 * response is to re-claim and pick up its current runtime list, not to treat
 * itself as revoked and stop. Conflating the two would make leaving a
 * workspace look identical to being cut off.
 */
export function authFailureResponse(failure: DaemonAuthFailure) {
  if (failure === "revoked") {
    return daemonError(
      403,
      "revoked",
      "This machine's access has been revoked. Connect it again to reconnect.",
    );
  }
  if (failure === "unknown_runtime") {
    return daemonError(
      404,
      "unknown_runtime",
      "That runtime is not available to this machine. Re-claim to refresh its workspaces.",
    );
  }
  return daemonError(401, "unauthenticated", "Missing or invalid access token.");
}

/**
 * Pull the self-reported identity out of a body.
 *
 * Note what is NOT here: `workspaceId` and `runtimeId`. Both come from the
 * bearer token via `authenticateRuntime`, and this function existing is part of
 * how that stays true — a route calling `parseIdentity(body)` has no way to
 * accidentally pick up a scope field, because the returned type has none.
 */
export function parseIdentity(body: unknown): RuntimeIdentity | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const hostname = typeof b.hostname === "string" ? b.hostname.trim() : "";
  const os = typeof b.os === "string" ? b.os.trim() : "";
  if (!hostname || !os) return null;

  return {
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim() : null,
    hostname,
    os,
    isElectron: b.isElectron === true,
    capabilities: Array.isArray(b.capabilities)
      ? b.capabilities.filter((c): c is string => typeof c === "string")
      : [],
    coreVersion:
      typeof b.coreVersion === "string" && b.coreVersion.trim() ? b.coreVersion.trim() : null,
    // Allowlisted, like `POST /api/daemon/settings` does it. A machine may only
    // report values for the keys it is allowed to be told to change; anything
    // else is dropped rather than stored, because this column is rendered.
    settings: pickSettableSettings(b.settings),
  };
}

function pickSettableSettings(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const picked: Record<string, string> = {};
  for (const key of DAEMON_SETTABLE_KEYS) {
    const value = source[key];
    if (typeof value === "string") picked[key] = value;
  }
  return picked;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
