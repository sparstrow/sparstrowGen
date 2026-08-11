import { NextResponse } from "next/server";
import type {
  DaemonErrorReason,
  DaemonErrorResponse,
  RuntimeIdentity,
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

/** 401 for an absent or unrecognised token, 403 for one the owner revoked. */
export function authFailureResponse(failure: DaemonAuthFailure) {
  return failure === "revoked"
    ? daemonError(
        403,
        "revoked",
        "This machine's pairing has been revoked. Pair it again to reconnect.",
      )
    : daemonError(401, "unauthenticated", "Missing or invalid daemon token.");
}

/**
 * Pull the self-reported identity out of a body.
 *
 * Note what is NOT here: `workspaceId` and `runtimeId`. Both come from the
 * bearer token via `authenticateDaemon`, and this function existing is part of
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
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
