import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HEARTBEAT_STALE_AFTER_MS,
  isLoopbackCallback,
  type ClaimMachineResponse,
  type HeartbeatResponse,
  type StartConnectAttemptResponse,
} from "@sparstrow/shared";
import { authenticateMachine, authenticateRuntime, hashToken } from "./auth.js";
import { authFailureResponse, daemonError, parseIdentity, readJson } from "./respond.js";

/**
 * The daemon protocol, served by `server/`.
 *
 * ## Why this exists
 *
 * These routes lived only in `apps/web/src/app/api/daemon/*`, which meant a
 * daemon could only ever talk to a running Next.js. Restructure Phase 1 planned
 * to lift them here and did not; `respond.ts` in `apps/web` had been written
 * framework-free specifically to make the move cheap, and said so in its own
 * header. The cost of skipping it was `G-67`: a packaged desktop app whose two
 * halves pointed at two different servers, neither of which exists on a clean
 * machine. It appeared to work only next to a running development checkout.
 *
 * ## Scope
 *
 * **Pairing only, deliberately.** Six routes, chosen because they are exactly
 * what "install the app and see your computer" needs: connect, exchange, claim,
 * register, heartbeat, me. The other fifteen — commands, chat turns, run
 * events, memory sync — are execution, and porting all twenty-one at once would
 * mean none of them verified rather than six of them proved. A daemon calling a
 * route that is not here yet gets a clean 404, which its own error handling
 * already treats as "cloud unavailable" rather than as corruption.
 *
 * ## The rule that governs every handler here
 *
 * The service role bypasses RLS, so **no route may read a workspace id from a
 * request body.** See `auth.ts`'s banner. Scope comes from the token, always.
 */

export type DaemonContext = {
  /** Service-role client. RLS does not apply — read `auth.ts` before using it. */
  db: SupabaseClient;
  /**
   * Where the person's browser should be sent to confirm a connection.
   *
   * Supplied by the caller rather than derived from the request, because the
   * confirm page is served by `apps/web` and `server/` may not share its
   * origin — most obviously when `server/` is on `127.0.0.1` inside a desktop
   * install.
   */
  webOrigin: string;
};

type DaemonHandler = (request: Request, ctx: DaemonContext) => Promise<Response>;

/** Path (below `/api/daemon`) and method → handler. */
const ROUTES = new Map<string, DaemonHandler>();

function route(method: string, path: string, handler: DaemonHandler): void {
  ROUTES.set(`${method} ${path}`, handler);
}

export function matchDaemonRoute(method: string, path: string): DaemonHandler | null {
  return ROUTES.get(`${method.toUpperCase()} ${path}`) ?? null;
}

// ── connect ─────────────────────────────────────────────────────────────────

const ATTEMPT_TTL_MS = 5 * 60 * 1000;

/**
 * Register a browser-loopback connection attempt.
 *
 * The only unauthenticated route here that CREATES something — necessarily so:
 * a machine with no credential yet has nothing to authenticate with. What it
 * creates is deliberately inert: a `pending` row owned by nobody, which no RLS
 * policy will attach to a person until one signs in and approves it. It mints
 * nothing sensitive; it records "a machine claims this identity and is waiting
 * at this loopback address."
 *
 * `machineId` is supplied by the caller rather than generated here, because it
 * must stay stable across a re-connect of the same computer — otherwise every
 * re-connect produces a second machine row for one piece of hardware.
 */
route("POST", "/connect", async (request, { db, webOrigin }) => {
  const body = await readJson(request);
  const identity = parseIdentity(body);
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const machineId =
    b && typeof b.machineId === "string" && b.machineId.trim() ? b.machineId.trim() : "";
  const callback = b && typeof b.callback === "string" ? b.callback.trim() : "";

  if (!identity || !machineId) {
    return daemonError(400, "invalid_request", "A machine id, hostname and os are all required.");
  }
  if (!callback || !isLoopbackCallback(callback)) {
    return daemonError(
      400,
      "invalid_callback",
      "The callback must be a plain-HTTP loopback address (127.0.0.1, ::1, or localhost).",
    );
  }

  const attemptId = randomBytes(32).toString("base64url");

  const { error } = await db.from("connect_attempts").insert({
    id: attemptId,
    machine_id: machineId,
    name: identity.name ?? identity.hostname,
    os: identity.os,
    hostname: identity.hostname,
    is_electron: identity.isElectron,
    capabilities: identity.capabilities,
    core_version: identity.coreVersion,
    callback,
    status: "pending",
    expires_at: new Date(Date.now() + ATTEMPT_TTL_MS).toISOString(),
  });

  if (error) {
    console.error("failed to register connect attempt", {
      code: error.code,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not start connecting this computer.");
  }

  const response: StartConnectAttemptResponse = {
    attemptId,
    confirmUrl: `${webOrigin}/connect?attempt=${encodeURIComponent(attemptId)}`,
  };
  return Response.json(response);
});

// ── connect/exchange ────────────────────────────────────────────────────────

const ATTEMPT_ERRORS: Record<string, { status: number; reason: "invalid_request" | "unknown_attempt" | "attempt_not_approved" | "attempt_already_consumed" | "attempt_expired" }> = {
  SCA00: { status: 400, reason: "invalid_request" },
  SCA01: { status: 400, reason: "unknown_attempt" },
  SCA02: { status: 409, reason: "attempt_not_approved" },
  SCA03: { status: 409, reason: "attempt_already_consumed" },
  SCA04: { status: 410, reason: "attempt_expired" },
};

/**
 * Exchange an approved connection attempt for a real access token.
 *
 * Called by the machine's own loopback listener, server-to-server — never by
 * the browser, which only ever carries the attempt id as far as that listener.
 * The real token is minted here and nowhere earlier: this call can only succeed
 * once the browser's redirect has already reached the listener, which is what
 * closes the ghost-machine race a mint-before-redirect design would have.
 *
 * Unauthenticated for the same reason `/connect` is: the machine has no
 * credential yet. The attempt id IS the credential, and
 * `exchange_connect_attempt` is service-role only, unreachable from anon.
 */
route("POST", "/connect/exchange", async (request, { db }) => {
  const body = await readJson(request);
  const attemptId =
    body && typeof body === "object"
      ? String((body as Record<string, unknown>).attemptId ?? "").trim()
      : "";

  if (!attemptId) return daemonError(400, "invalid_request", "An attempt id is required.");

  // 32 bytes of CSPRNG output, generated here, hashed here, and handed to the
  // database only as a hash.
  const token = randomBytes(32).toString("base64url");

  const { data, error } = await db.rpc("exchange_connect_attempt", {
    p_attempt_id: attemptId,
    p_token_hash: hashToken(token),
  });

  if (error) {
    const mapped = ATTEMPT_ERRORS[error.code ?? ""];
    if (mapped) return daemonError(mapped.status, mapped.reason, error.message);
    console.error("connect attempt exchange failed", {
      code: error.code,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not finish connecting this computer.");
  }

  const result = data as { tokenId: string; userId: string; machineId: string } | null;
  if (!result?.tokenId) {
    return daemonError(500, "server_error", "Could not finish connecting this computer.");
  }

  return Response.json({ token, machineId: result.machineId });
});

// ── claim ───────────────────────────────────────────────────────────────────

/**
 * "This computer is mine, and here is what it can do."
 *
 * Idempotent by construction, and called on EVERY boot rather than once at
 * setup. Workspace membership changes without this machine being involved — the
 * owner creates a workspace elsewhere, or leaves one — and a claim-once model
 * means the machine's runtime list is accurate exactly once and silently wrong
 * from then on. `claim_machine` adds runtimes for workspaces gained and removes
 * them for workspaces left, so a boot is also a reconciliation.
 *
 * The user id handed to the RPC comes from `authenticateMachine`, never from
 * the body — see the banner in `auth.ts`.
 */
route("POST", "/claim", async (request, { db }) => {
  const auth = await authenticateMachine(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const body = await readJson(request);
  const identity = parseIdentity(body);
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const machineId =
    b && typeof b.machineId === "string" && b.machineId.trim() ? b.machineId.trim() : "";

  if (!identity || !machineId) {
    return daemonError(400, "invalid_request", "A machine id, hostname and os are all required.");
  }

  // A token already bound to a DIFFERENT machine may not claim this one: copy
  // the secrets file to another laptop and it is refused rather than silently
  // claiming that laptop too.
  if (auth.scope.machineId && auth.scope.machineId !== machineId) {
    return daemonError(
      403,
      "revoked",
      "This token belongs to a different computer. Create a new one for this machine.",
    );
  }

  const { data, error } = await db.rpc("claim_machine", {
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
  return Response.json(result);
});

// ── register ────────────────────────────────────────────────────────────────

/**
 * "Here is what I am." Sent on every boot, not only at pairing.
 *
 * Capabilities change — someone installs a CLI, adds an API key, upgrades the
 * runtime. A register-once model means the cloud's picture is accurate exactly
 * once and drifts from then on, and dispatch runs on that picture.
 */
route("POST", "/register", async (request, { db }) => {
  const auth = await authenticateRuntime(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const identity = parseIdentity(await readJson(request));
  if (!identity) return daemonError(400, "invalid_request", "hostname and os are required.");

  // `name` is deliberately absent from this update. It defaults to the hostname
  // at pairing and is editable in the UI; machines get renamed to things like
  // "desk" and "laptop", and re-registering on every boot must not stomp a name
  // the owner chose.
  const { error } = await db
    .from("runtimes")
    .update({
      hostname: identity.hostname,
      os: identity.os,
      is_electron: identity.isElectron,
      capabilities: identity.capabilities,
      core_version: identity.coreVersion,
      status: "online",
      last_heartbeat: new Date().toISOString(),
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

  return Response.json({ ok: true });
});

// ── heartbeat ───────────────────────────────────────────────────────────────

/**
 * "I am still here."
 *
 * `last_heartbeat` is written from the DATABASE clock, never from a timestamp
 * the daemon sends. A laptop resuming from sleep has a skewed clock often
 * enough that trusting it would let a machine declare itself permanently fresh
 * or permanently stale — and the resulting bug looks like a network fault,
 * which is the wrong place to go looking.
 */
route("POST", "/heartbeat", async (request, { db }) => {
  const auth = await authenticateRuntime(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  // `last_heartbeat` only. Deliberately NOT `status: "online"`: status is for
  // states a daemon DECLARES about itself (`draining` at shutdown), and
  // liveness is derived from this timestamp. Writing "online" on every beat
  // would also let a beat still in flight when shutdown declared `draining`
  // land afterwards and resurrect it.
  const { error } = await db
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
  return Response.json(response);
});

// ── me ──────────────────────────────────────────────────────────────────────

/** Who this token is, and which computer it is bound to. */
route("GET", "/me", async (request, { db }) => {
  const auth = await authenticateMachine(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);
  return Response.json({
    userId: auth.scope.userId,
    machineId: auth.scope.machineId,
    tokenId: auth.scope.tokenId,
  });
});
