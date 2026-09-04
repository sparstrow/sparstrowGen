import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  /** Where Supabase is, and the public key, for the confirm page's own sign-in. */
  supabaseUrl: string;
  supabaseAnonKey: string;
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


/**
 * The workspace's agents, for a daemon to mirror into its own store (`OQ-12`
 * option A).
 *
 * An agent created in the app is only a cloud row. The dispatcher links agents
 * **by slug** into the daemon's local SQLite, so before this existed every turn
 * for a newly created agent failed with *"This machine has no agent with the
 * slug …"* — a correct message about a step nothing in the product performed.
 *
 * Runtime-scoped rather than machine-scoped: a machine can serve several
 * workspaces, and an agent belongs to exactly one. `authenticateRuntime` reads
 * the `X-Sparstrow-Runtime` header and yields the workspace this pull is for,
 * so a token cannot fetch a workspace it does not serve.
 *
 * **Two exclusions, both deliberate.**
 *
 * `status = 'active'` only. P9's ingestion lands imported skills as
 * `quarantined` agents precisely so they cannot run until a person promotes
 * them; syncing one down as a runnable local agent would walk straight through
 * that gate on a machine the reviewer never looked at.
 *
 * `is_system = false` only. System agents (Project Indexer/Reporter) are seeded
 * locally at boot with fixed slugs. Overwriting a locally-seeded one with a
 * cloud row of the same slug would let a workspace edit re-point a factory
 * agent on every machine at once.
 */
route("GET", "/agents", async (request, { db }) => {
  const auth = await authenticateRuntime(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { data, error } = await db
    .from("agents")
    .select(
      "id, name, slug, role, system_prompt, provider, model, cwd, add_dirs, " +
        "allowed_tools, disallowed_tools, permission_mode, mcp_servers, max_turns, " +
        "memory_read_scopes, memory_write_scopes, extra_args, enabled, " +
        "signal_extraction, origin, status, updated_at",
    )
    .eq("workspace_id", auth.scope.workspaceId)
    .eq("status", "active")
    .eq("is_system", false)
    .order("slug");

  if (error) return daemonError(500, "server_error", error.message);
  return Response.json({ agents: data ?? [] });
});


// ── the confirm page's own three calls ──────────────────────────────────────
//
// These exist so a computer that has NEVER been connected can be, without a
// Next.js server anywhere (`G-68`). They are unauthenticated in the same narrow
// sense `/connect` is: the attempt id is a 32-byte secret this machine
// generated, and holding it is the only thing they let you act on.

/** What is being connected, so the page can name it before you confirm. */
route("POST", "/connect/attempt", async (request, { db }) => {
  const body = (await readJson(request)) as { attemptId?: unknown } | null;
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.trim() : "";
  if (!attemptId) return daemonError(400, "invalid_request", "An attempt id is required.");

  const { data, error } = await db
    .from("connect_attempts")
    .select("name, hostname, os, status, expires_at")
    .eq("id", attemptId)
    .maybeSingle();

  if (error) {
    console.error("connect attempt lookup failed", { message: error.message });
    return daemonError(500, "server_error", "Could not read this connection attempt.");
  }
  if (!data) return daemonError(404, "unknown_attempt", "This connection request no longer exists.");
  if (data.status !== "pending") {
    return daemonError(409, "attempt_already_consumed", "This connection request has already been used.");
  }
  if (new Date(data.expires_at as string) <= new Date()) {
    return daemonError(410, "attempt_expired", "This connection request has expired. Start again from the app.");
  }

  // Deliberately no ids and nothing about the account. Enough to recognise the
  // computer you are approving, and nothing that would be worth guessing an
  // attempt id to read.
  return Response.json({ name: data.name, hostname: data.hostname, os: data.os });
});

/**
 * Sign in, against Supabase's own endpoint.
 *
 * Proxied through here rather than called from the page so the anon key stays
 * on this side and the browser talks to one origin. The password is forwarded
 * and never stored, logged, or returned.
 */
route("POST", "/connect/signin", async (request, { supabaseUrl, supabaseAnonKey }) => {
  const body = (await readJson(request)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return daemonError(400, "invalid_request", "An email and password are both required.");
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: supabaseAnonKey },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return daemonError(502, "server_error", "Could not reach the sign-in service.");
  }

  const payload = (await res.json().catch(() => null)) as
    | { access_token?: string; error_description?: string; msg?: string }
    | null;

  if (!res.ok || !payload?.access_token) {
    // Supabase's own wording, which distinguishes a wrong password from an
    // unconfirmed email. Inventing a generic message here would hide the one
    // difference that tells someone what to do next.
    const detail = payload?.error_description || payload?.msg || "Those details were not accepted.";
    return daemonError(401, "unauthenticated", detail);
  }

  return Response.json({ accessToken: payload.access_token });
});

/**
 * Approve the attempt, as the person who just signed in.
 *
 * The update runs with the USER's token, never the service role, so
 * `connect_attempts_approve` (policies/033) is what decides whether it is
 * allowed: pending, unexpired, and stamped with the approver's own id. The
 * database is the authority, and this route could not bypass it if it tried.
 */
route("POST", "/connect/approve", async (request, { db, supabaseUrl, supabaseAnonKey }) => {
  const body = (await readJson(request)) as
    | { attemptId?: unknown; accessToken?: unknown }
    | null;
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.trim() : "";
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  if (!attemptId || !accessToken) {
    return daemonError(400, "invalid_request", "An attempt id and a session are both required.");
  }

  const asUser = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userResult, error: userError } = await asUser.auth.getUser(accessToken);
  if (userError || !userResult?.user) {
    return daemonError(401, "unauthenticated", "That sign-in is no longer valid. Try again.");
  }

  const { data, error } = await asUser
    .from("connect_attempts")
    .update({ status: "approved", approved_by_user_id: userResult.user.id })
    .eq("id", attemptId)
    .select("callback")
    .maybeSingle();

  if (error) {
    console.error("connect approve failed", { code: error.code, message: error.message });
    return daemonError(500, "server_error", "Could not approve this computer.");
  }
  // RLS denies by returning zero rows rather than erroring, so "no row" here
  // covers missing, already-approved, and expired alike. All three mean the
  // same thing to the person: start again from the app.
  if (!data?.callback) {
    return daemonError(
      409,
      "attempt_not_approved",
      "This connection request is no longer open. Start again from the app.",
    );
  }

  // The callback is read from the row, never from the request, so an approved
  // attempt can only ever hand its credential to the machine that created it.
  void db;
  return Response.json({ callback: data.callback });
});
