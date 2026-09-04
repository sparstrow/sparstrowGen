import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  COMMAND_LEASE_MS,
  HEARTBEAT_STALE_AFTER_MS,
  isLoopbackCallback,
  type AckRequest,
  type ClaimMachineResponse,
  type ClaimResponse,
  type ClaimedCommand,
  type CommandFailureReason,
  type HeartbeatResponse,
  type StartConnectAttemptResponse,
} from "@sparstrow/shared";
import { authenticateMachine, authenticateRuntime, hashToken } from "./auth.js";
import { authFailureResponse, daemonError, parseIdentity, readJson } from "./respond.js";
import {
  MAX_CHAT_BATCH_BYTES,
  latestOf,
  parseChatEventBatch,
  parseChatResult,
} from "./chat-transcript.js";
import { boardEffectFor } from "./reconcile.js";

/**
 * Byte size of a parsed body, for the batch ceilings above.
 *
 * Ported alongside the routes rather than pulled from a shared module: it is
 * four lines, and the alternative was carrying `transcript.ts`'s other 160 for
 * the run-events path that is not ported yet.
 */
function approximateBodyBytes(body: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(body) ?? "", "utf8");
  } catch {
    // Circular or otherwise unserialisable. It cannot have come from JSON.parse,
    // so treat it as malformed rather than as enormous.
    return 0;
  }
}

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

/** Values captured from `:name` segments in the route path. */
export type DaemonParams = Record<string, string>;

type DaemonHandler = (
  request: Request,
  ctx: DaemonContext,
  params: DaemonParams,
) => Promise<Response>;

type Entry = { method: string; segments: string[]; handler: DaemonHandler };

/**
 * Method + path (below `/api/daemon`) → handler.
 *
 * A list rather than a map because the daemon protocol has parameterised paths
 * (`/commands/:id/ack`, `/chat/turns/:id/events`). Exact routes are still
 * matched first, so a literal segment always beats a `:param` that could also
 * accept it — otherwise adding a `/commands/:id` route would start swallowing a
 * future `/commands/pending`.
 */
const ROUTES: Entry[] = [];

function route(method: string, path: string, handler: DaemonHandler): void {
  ROUTES.push({ method, segments: path.split("/").filter(Boolean), handler });
}

export type DaemonMatch = { handler: DaemonHandler; params: DaemonParams };

export function matchDaemonRoute(method: string, path: string): DaemonMatch | null {
  const wanted = method.toUpperCase();
  const parts = path.split("/").filter(Boolean);

  let fallback: DaemonMatch | null = null;

  for (const entry of ROUTES) {
    if (entry.method !== wanted || entry.segments.length !== parts.length) continue;

    const params: DaemonParams = {};
    let matched = true;
    let literal = true;

    for (let i = 0; i < entry.segments.length; i += 1) {
      const segment = entry.segments[i] as string;
      const actual = parts[i] as string;
      if (segment.startsWith(":")) {
        // An empty segment cannot fill a parameter — `/commands//ack` must not
        // resolve to an ack for the command with the empty id.
        if (!actual) { matched = false; break; }
        params[segment.slice(1)] = decodeURIComponent(actual);
        literal = false;
      } else if (segment !== actual) {
        matched = false;
        break;
      }
    }

    if (!matched) continue;
    if (literal) return { handler: entry.handler, params };
    fallback ??= { handler: entry.handler, params };
  }

  return fallback;
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


// ── command delivery ────────────────────────────────────────────────────────
//
// Ported from `apps/web/src/app/api/daemon/commands/*`. Without these a turn
// can be assigned in the cloud and the daemon has nothing to poll, so it never
// learns about it — which is what stood between 4b landing and an agent
// actually replying.
//
// **The Supabase Realtime broadcast is deliberately NOT ported.** The
// restructure replaced Realtime with a server-owned WebSocket (`D-37` parks the
// Realtime bridge), so the durable write is carried across and the fan-out is
// not. The consequence is stated rather than hidden: a reply lands when the
// turn completes instead of streaming in progressively. Wiring it to
// `server/src/ws` is the follow-up.

/**
 * "What have you got for me?" — the daemon's poll.
 *
 * A GET with no body, on purpose. Everything it needs — which runtime, which
 * workspace — comes from the bearer token. A POST would invite a parameter, and
 * the first one anyone would reach for is a runtime id, which is exactly the
 * thing that must never come from the caller.
 *
 * Atomicity lives in `claim_runtime_commands`: one UPDATE ... RETURNING with
 * FOR UPDATE SKIP LOCKED, which is what stops two polls — or two machines
 * racing a re-dispatch after a lease expiry — from both getting the same row.
 *
 * Empty is the common answer and is not an error. A machine idle overnight asks
 * about 28,000 times and gets `{ commands: [] }` every time.
 */
route("GET", "/commands", async (request, { db }) => {
  const auth = await authenticateRuntime(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { data, error } = await db.rpc("claim_runtime_commands", {
    p_runtime_id: auth.scope.runtimeId,
    p_limit: 10,
    p_lease_ms: COMMAND_LEASE_MS,
  });

  if (error) return daemonError(500, "server_error", "Could not claim commands.");

  // Belt and braces: the RPC already scopes to the runtime, and a runtime
  // belongs to exactly one workspace. It stays because this route holds the
  // service role, and "the id was already scoped upstream" is precisely the
  // reasoning that produced M2's cross-workspace defects.
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

  const { data: workspace } = await db
    .from("workspaces")
    .select("allowed_tools, disallowed_tools")
    .eq("id", auth.scope.workspaceId)
    .maybeSingle();

  const response: ClaimResponse = {
    commands,
    workspaceTools: workspace
      ? {
          allowedTools: (workspace.allowed_tools as string[]) ?? [],
          disallowedTools: (workspace.disallowed_tools as string[]) ?? [],
        }
      : undefined,
  };
  return Response.json(response);
});

const ACK_REASONS = new Set<CommandFailureReason>([
  "project_not_available",
  "agent_not_available",
  "agent_disabled",
  "spawn_failed",
  "clone_failed",
  "setting_not_allowed",
  "unknown_kind",
]);

/**
 * "Here is what happened to that command."
 *
 * Two jobs, and the split between them is the security boundary:
 *
 * 1. Close the command row — `ack_runtime_command`, scoped to the runtime that
 *    claimed it, and idempotent, because a daemon retries an ack whose response
 *    was lost and an error on the retry would tell it to redo finished work.
 *
 * 2. Translate the failure reason into BOARD state. That happens HERE, from a
 *    closed set of tokens, never in the daemon. A daemon able to write task
 *    statuses directly could mark every task in a workspace done; dispatch
 *    already means a task row can run code on someone's machine, and it must
 *    not also mean a machine can rewrite the board.
 */
route("POST", "/commands/:id/ack", async (request, { db }, params) => {
  const auth = await authenticateRuntime(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const id = params.id as string;
  const body = (await readJson(request)) as AckRequest | null;
  const status = body?.status;

  if (status !== "done" && status !== "failed") {
    return daemonError(400, "invalid_request", "status must be done or failed.");
  }
  const reason = body?.reason && ACK_REASONS.has(body.reason) ? body.reason : null;

  // Read BEFORE acking, for the payload. Reading first keeps the ordering
  // obvious: learn which run and task this was about, close it, reconcile.
  const { data: command } = await db
    .from("runtime_commands")
    .select("id, kind, payload, workspace_id")
    .eq("id", id)
    .eq("runtime_id", auth.scope.runtimeId)
    .eq("workspace_id", auth.scope.workspaceId)
    .maybeSingle();

  const { data: acked, error } = await db.rpc("ack_runtime_command", {
    p_id: id,
    p_runtime_id: auth.scope.runtimeId,
    p_status: status,
    p_error: body?.error ?? null,
  });

  if (error) return daemonError(500, "server_error", "Could not record the acknowledgement.");

  const result = (acked ?? {}) as { ok?: boolean; alreadyCompleted?: boolean };
  if (result.ok === false) {
    // Deliberately the same answer for "not yours" and "does not exist":
    // separating them would make this an oracle for other machines' command ids.
    return daemonError(404, "invalid_request", "No such command for this machine.");
  }

  const payload = (command?.payload ?? {}) as Record<string, unknown>;

  if (status === "failed" && reason && command) {
    await reconcileBoard(db, {
      workspaceId: auth.scope.workspaceId,
      runtimeId: auth.scope.runtimeId,
      payload,
      reason,
      error: body?.error ?? null,
      detail: body?.detail ?? null,
    });
  }

  // A `chat.turn` failing here means the daemon rejected it before ever
  // reaching the turn routes below, and nothing else closes the row. Confirmed
  // live during M12: the turn stayed `in_progress` forever until this existed.
  // Deliberately not gated on `reason` — a bare failed ack must not leave a
  // turn stuck either.
  if (status === "failed" && command?.kind === "chat.turn") {
    await closeFailedChatTurn(db, auth.scope.runtimeId, payload, reason, body?.error ?? null);
  }

  return Response.json({ ok: true, alreadyCompleted: result.alreadyCompleted === true });
});

// ── a chat turn's reply ─────────────────────────────────────────────────────

/**
 * Resolve a turn this runtime is allowed to write to.
 *
 * Ownership is checked BEFORE and SEPARATELY from the write, even though
 * `ingest_chat_turn_reply` scopes itself to `(turn id, assigned runtime id)`.
 * Folding it into the write's predicate would make "this turn is not yours"
 * indistinguishable from "your write was a no-op", and this route holds the
 * service role, so RLS is not there to catch a mistake.
 */
async function ownedTurn(
  db: SupabaseClient,
  turnId: string,
  workspaceId: string,
  runtimeId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { data, error } = await db
    .from("chat_turns")
    .select("id")
    .eq("id", turnId)
    .eq("workspace_id", workspaceId)
    .eq("assigned_runtime_id", runtimeId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: daemonError(500, "server_error", "Could not read the chat turn."),
    };
  }
  if (!data) {
    return {
      ok: false,
      response: daemonError(404, "invalid_request", "No such chat turn for this machine."),
    };
  }
  return { ok: true };
}

/**
 * The streamed half of a reply.
 *
 * Every event carries the FULL accumulated reply rather than a delta, so only
 * the highest-seq event in the batch needs to be written — `latestOf`. The
 * broadcast that used to fan the whole batch out is not ported (see the note
 * above), so today this is a durable write and nothing else.
 */
route("POST", "/chat/turns/:id/events", async (request, { db }, params) => {
  const auth = await authenticateRuntime(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const id = params.id as string;
  const body = await readJson(request);

  if (approximateBodyBytes(body) > MAX_CHAT_BATCH_BYTES) {
    return daemonError(
      413,
      "invalid_request",
      `A chat event batch may not exceed ${MAX_CHAT_BATCH_BYTES} bytes.`,
    );
  }

  const parsed = parseChatEventBatch(body);
  if (!parsed.ok) {
    return daemonError(400, "invalid_request", `${parsed.rejection}: ${parsed.detail}`);
  }

  const owned = await ownedTurn(db, id, auth.scope.workspaceId, auth.scope.runtimeId);
  if (!owned.ok) return owned.response;

  const latest = latestOf(parsed.events);

  const { data, error } = await db.rpc("ingest_chat_turn_reply", {
    p_turn_id: id,
    p_runtime_id: auth.scope.runtimeId,
    p_seq: latest.seq,
    p_reply_text: latest.replyText,
    p_status: "running",
  });

  // The reply text is NEVER logged: it is the person's conversation, not
  // diagnostic data.
  if (error) return daemonError(500, "server_error", "Could not record the chat turn events.");

  const result = (data ?? {}) as { ok?: boolean; alreadyCompleted?: boolean };
  if (result.ok === false) {
    // Ownership was confirmed a moment ago, so this can only mean the turn was
    // deleted in between. Same answer as "not yours", not a 500.
    return daemonError(404, "invalid_request", "No such chat turn for this machine.");
  }

  return Response.json({
    ok: true,
    storedThroughSeq: latest.seq,
    alreadyCompleted: result.alreadyCompleted === true,
  });
});

/** The turn's final state. This is what closes the row. */
route("POST", "/chat/turns/:id/result", async (request, { db }, params) => {
  const auth = await authenticateRuntime(db, request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const id = params.id as string;
  const body = await readJson(request);

  if (approximateBodyBytes(body) > MAX_CHAT_BATCH_BYTES) {
    return daemonError(
      413,
      "invalid_request",
      `A chat result may not exceed ${MAX_CHAT_BATCH_BYTES} bytes.`,
    );
  }

  const parsed = parseChatResult(body);
  if (!parsed.ok) {
    return daemonError(400, "invalid_request", `${parsed.rejection}: ${parsed.detail}`);
  }

  const owned = await ownedTurn(db, id, auth.scope.workspaceId, auth.scope.runtimeId);
  if (!owned.ok) return owned.response;

  const { result } = parsed;

  const { data, error } = await db.rpc("ingest_chat_turn_reply", {
    p_turn_id: id,
    p_runtime_id: auth.scope.runtimeId,
    p_seq: result.seq,
    p_reply_text: result.replyText,
    p_status: result.status,
    p_error: result.error ?? null,
    // The jsonb the RPC receives is always snake_case, whichever side of the
    // wire produced the camelCase TS shape.
    p_produced: (result.produced ?? []).map((f) => ({
      storage_path: f.storagePath,
      filename: f.filename,
      mime_type: f.mimeType,
      size_bytes: f.sizeBytes,
    })),
  });

  if (error) return daemonError(500, "server_error", "Could not record the chat turn result.");

  const ack = (data ?? {}) as { ok?: boolean; alreadyCompleted?: boolean; stale?: boolean };
  if (ack.ok === false) {
    return daemonError(404, "invalid_request", "No such chat turn for this machine.");
  }

  if (ack.stale) {
    // This seq did not advance past the last streamed event, so the turn is
    // STILL open. Loud on purpose: that is a daemon sequencing bug, not a
    // client race to shrug off.
    console.error("[daemon] chat turn result arrived stale — the turn did not close", {
      turnId: id,
      seq: result.seq,
    });
  }

  return Response.json({
    ok: true,
    alreadyCompleted: ack.alreadyCompleted === true,
    stale: ack.stale === true,
  });
});

/**
 * Close a `chat_turns` row for a command that never reached the turn routes at
 * all. Scoped by `(turn id, assigned runtime id)` — the same containment the
 * RPC enforces — so a miss here (turn reassigned or deleted since the command
 * was claimed) is a legitimate no-op rather than an error.
 */
async function closeFailedChatTurn(
  db: SupabaseClient,
  runtimeId: string,
  payload: Record<string, unknown>,
  reason: CommandFailureReason | null,
  error: string | null,
): Promise<void> {
  const turnId = typeof payload.turnId === "string" ? payload.turnId : null;
  if (!turnId) return;

  const { data: turn } = await db
    .from("chat_turns")
    .select("reply_seq, reply_text")
    .eq("id", turnId)
    .eq("assigned_runtime_id", runtimeId)
    .maybeSingle();

  if (!turn) return;

  await db.rpc("ingest_chat_turn_reply", {
    p_turn_id: turnId,
    p_runtime_id: runtimeId,
    p_seq: ((turn.reply_seq as number) ?? 0) + 1,
    p_reply_text: (turn.reply_text as string) ?? "",
    p_status: "failed",
    p_error: error ?? reason ?? "The command failed before it could run.",
  });
}

/**
 * Apply the board effect a failure reason implies. The mapping itself — the
 * part with judgement in it — lives in `reconcile.ts` and is tested there.
 */
async function reconcileBoard(
  db: SupabaseClient,
  args: {
    workspaceId: string;
    runtimeId: string;
    payload: Record<string, unknown>;
    reason: CommandFailureReason;
    error: string | null;
    detail: string | null;
  },
): Promise<void> {
  const { workspaceId, runtimeId, payload, reason, error, detail } = args;
  const effect = boardEffectFor(reason);
  const now = new Date().toISOString();

  const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
  const runId = typeof payload.runId === "string" ? payload.runId : null;
  const projectId = typeof payload.projectId === "string" ? payload.projectId : null;

  if (effect.markBindingMissing && projectId) {
    // `detail` carries the path the daemon actually checked, so the relink
    // action can pre-fill it rather than asking where the project used to live.
    await db
      .from("runtime_projects")
      .update({ state: "missing", detail: detail ?? error, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("runtime_id", runtimeId)
      .eq("project_id", projectId);
  }

  if (effect.taskStatus && taskId) {
    await db
      .from("tasks")
      .update({ status: effect.taskStatus, result: error, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("id", taskId);
  }

  if (effect.failRun && runId) {
    await db
      .from("runs")
      .update({ status: "failed", error: error ?? reason, finished_at: now, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("id", runId)
      .in("status", ["queued", "running"]);
  }

  // A clone that failed has no run and no task — the binding is the only thing
  // that can carry the error, and it is what the UI is showing.
  if (reason === "clone_failed" && projectId) {
    await db
      .from("runtime_projects")
      .update({ state: "error", detail: error, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("runtime_id", runtimeId)
      .eq("project_id", projectId);
  }
}


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
