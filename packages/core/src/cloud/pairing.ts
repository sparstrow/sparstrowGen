import type { PairResponse } from "@sparstrow/shared";
import { logger } from "../logger.js";
import { cloudFetch, getWorkspaceId, savePairing } from "./client.js";
import { describeMachine } from "./registration.js";
import { clearCloudLinks } from "./resolve.js";

/**
 * M3 — exchange a pairing code for a daemon token and persist it.
 *
 * Deliberately usable without a running core: pairing has to work on a machine
 * where core is installed but stopped, which is the normal first-run state.
 * Requiring a live daemon would make this "start it, pair it, restart it so it
 * picks up the token" — three steps where there should be one.
 */

export type PairFailure =
  | "unknown_code"
  | "code_already_used"
  | "code_expired"
  | "invalid_request"
  | "unreachable"
  | "server_error";

export class PairError extends Error {
  readonly failure: PairFailure;
  constructor(failure: PairFailure, message: string) {
    super(message);
    this.name = "PairError";
    this.failure = failure;
  }
}

const MESSAGES: Record<PairFailure, string> = {
  unknown_code: "That pairing code was not recognised. Check for a typo and try again.",
  code_already_used:
    "That pairing code has already been used. Generate a fresh one — each code pairs exactly one machine.",
  code_expired: "That pairing code has expired. Generate a fresh one and use it within 10 minutes.",
  invalid_request: "This machine could not describe itself to the control plane.",
  unreachable: "Could not reach the control plane.",
  server_error: "The control plane could not complete pairing.",
};

/**
 * Redeem `code` and store the resulting token.
 *
 * Failures are typed rather than prose so the CLI can pick an exit code and a
 * message without matching on strings — a typo, a reused code and an expired
 * one need genuinely different advice.
 */
export async function pairWithCode(code: string, name?: string | null): Promise<PairResponse> {
  const identity = await describeMachine(name);

  let response: PairResponse;
  try {
    response = await cloudFetch<PairResponse>("/pair", {
      anonymous: true,
      body: { code: code.trim(), ...identity },
      // Pairing is interactive: someone is watching a terminal. Retrying a
      // rejected code cannot help, and the network cases are covered by the
      // client's own retry on 5xx.
      retries: 1,
    });
  } catch (err) {
    throw toPairError(err);
  }

  if (!response?.token || !response.runtimeId || !response.workspaceId) {
    throw new PairError("server_error", MESSAGES.server_error);
  }

  // M4: cloud ids only mean anything within one workspace. Pairing to a
  // different one makes every existing link a statement about ids that no
  // longer exist here, and a stale link resolves silently to the wrong local
  // agent — dispatch would run something nobody asked for. Cleared before the
  // new pairing is saved, so a crash in between leaves no links rather than
  // wrong ones.
  //
  // Best-effort: pairing must work on a machine whose database has never been
  // opened (`sparstrow pair` runs with core stopped, which is the normal
  // first-run state), and failing to clear an empty table must not fail pairing.
  const previousWorkspaceId = getWorkspaceId();
  if (previousWorkspaceId && previousWorkspaceId !== response.workspaceId) {
    try {
      clearCloudLinks();
      logger.info("paired to a different workspace — cleared cloud id links");
    } catch (err) {
      logger.debug({ err }, "could not clear cloud links while re-pairing");
    }
  }

  savePairing({
    token: response.token,
    runtimeId: response.runtimeId,
    workspaceId: response.workspaceId,
  });

  return response;
}

function toPairError(err: unknown): PairError {
  const reason = (err as { reason?: string })?.reason;
  if (reason && reason in MESSAGES) {
    const failure = reason as PairFailure;
    return new PairError(failure, MESSAGES[failure]);
  }

  const status = (err as { status?: number | null })?.status ?? null;
  if (status === null) {
    // No HTTP status at all means the request never landed: DNS, refused
    // connection, or the timeout. Distinct from "the server said no", because
    // the fix is different — check the URL and the network, not the code.
    //
    // The client's own message already names the URL and the cause, so it is
    // used as-is. Prefixing MESSAGES.unreachable here printed "Could not reach
    // the control plane. Could not reach the control plane at http://…".
    const detail = err instanceof Error ? err.message : String(err);
    return new PairError("unreachable", detail || MESSAGES.unreachable);
  }

  return new PairError("server_error", MESSAGES.server_error);
}
