import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { supabaseUrl } from "@web/utils/supabase/env";

/**
 * Machine authentication — the one place the service role enters this codebase.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  NO ROUTE MAY READ A WORKSPACE ID FROM A REQUEST BODY. Ever, for any reason.
 *
 *  Everywhere else in this app, supabase-js runs as the signed-in user and RLS
 *  is the backstop: a handler that trusted a client-supplied workspace id would
 *  still be denied by the database. Here there is no backstop. The service role
 *  bypasses RLS entirely, so a body-supplied id is believed.
 *
 *  The rule survived the move to person-scoped credentials, in a stricter form.
 *  A machine now serves MANY workspaces, so it does have to say which one it is
 *  acting for — but it names a RUNTIME, never a workspace, and it names it in
 *  the `X-Sparstrow-Runtime` header. `resolveRuntimeScope` then loads that
 *  runtime row and derives the workspace from it, having first proved two
 *  things about it:
 *
 *    1. the runtime belongs to THIS token's machine, and
 *    2. this token's user is a member of the workspace that runtime is in.
 *
 *  Fail either and the request is refused. A workspace id supplied by a client
 *  remains unreadable, exactly as before.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Why the service role at all: a machine is not a Supabase user session. It
 * holds a bearer token, not a JWT, so `auth.uid()` is null and every RLS policy
 * denies it. The token IS resolved to a real user id here — that is the whole
 * change from the previous model — but resolving it requires reading
 * `access_tokens.token_hash`, which is granted to no role but this one.
 *
 * The trust boundary this widened, and the controls it depends on, are in
 * `doc/security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md`.
 * A leaked token acts as the person. `last_used_at` is maintained below for
 * exactly that reason.
 */

export type MachineScope = {
  /** The person this token acts as. Server-asserted; never client-supplied. */
  userId: string;
  /** The computer this token was issued to, if it has claimed one yet. */
  machineId: string | null;
  tokenId: string;
};

/**
 * A machine scope narrowed to one runtime, and therefore to one workspace.
 *
 * Every route that touches workspace-scoped data needs this rather than the
 * bare `MachineScope` — the token alone does not say which of the person's
 * workspaces a request is about.
 */
export type RuntimeScope = MachineScope & {
  runtimeId: string;
  workspaceId: string;
};

export type DaemonAuthFailure = "unauthenticated" | "revoked" | "unknown_runtime";

export type MachineAuthResult =
  | { ok: true; scope: MachineScope }
  | { ok: false; failure: DaemonAuthFailure };

export type RuntimeScopeResult =
  | { ok: true; scope: RuntimeScope }
  | { ok: false; failure: DaemonAuthFailure };

function serviceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. The daemon API cannot verify tokens " +
        "without it. Add it to apps/web/.env.local from Supabase → Project " +
        "Settings → API. It must never be prefixed NEXT_PUBLIC_.",
    );
  }
  return value;
}

/**
 * Service-role client. Deliberately NOT exported: nothing outside this
 * directory should be able to obtain an RLS-bypassing client. Routes get a
 * verified scope from `authenticateRuntime` and a narrow helper below.
 */
function serviceClient(): SupabaseClient {
  return createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Exposed only to `/api/daemon/*` route handlers, which have already authenticated. */
export function daemonDb(): SupabaseClient {
  return serviceClient();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Resolve a bearer token to the PERSON it acts as.
 *
 * Returns a discriminated failure rather than throwing so callers must handle
 * it, and so "no token" and "revoked token" stay distinguishable — a machine
 * logs very different things for a misconfiguration and for the owner having
 * deliberately cut it off.
 */
export async function authenticateMachine(request: Request): Promise<MachineAuthResult> {
  const token = bearerFrom(request);
  if (!token) return { ok: false, failure: "unauthenticated" };

  const db = serviceClient();

  // Looked up by hash, never by comparing the secret. `token_hash` is UNIQUE,
  // so this is a single indexed equality -- constant-time comparison would add
  // nothing, because the value being matched is already a hash.
  //
  // `revoked_at` is selected rather than filtered on, so a revoked token is
  // found and reported as revoked instead of collapsing into "no such token".
  // Filtering here makes revocation indistinguishable from a typo, and the
  // owner who just revoked a machine gets a support question about a broken
  // config.
  const { data, error } = await db
    .from("access_tokens")
    .select("id, user_id, machine_id, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  // A query ERROR and a missing ROW are both refused, but they are not the same
  // event and must not be silent in the same way. Found by running this against
  // a database where `access_tokens` did not exist yet: every request came back
  // 401 "Missing or invalid access token", with nothing in the log — which
  // reads as "every machine's credential is wrong" rather than "the migration
  // has not been applied". That is an hour of looking in the wrong place.
  //
  // Still fails closed, deliberately: a database that cannot answer must not
  // authenticate anyone. It just says so now.
  if (error) {
    console.error("access token lookup failed", { code: error.code, message: error.message });
    return { ok: false, failure: "unauthenticated" };
  }
  if (!data) return { ok: false, failure: "unauthenticated" };
  if (data.revoked_at) return { ok: false, failure: "revoked" };

  // Best-effort, deliberately not awaited: this is what makes "last used 2
  // hours ago" answerable on the tokens page, and under a person-scoped
  // credential that column is a security control rather than a nicety (see
  // this file's header). It still must not add a round trip to every
  // heartbeat. A lost update costs a slightly stale timestamp, nothing more.
  void db
    .from("access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(
      () => undefined,
      () => undefined,
    );

  return {
    ok: true,
    scope: {
      userId: data.user_id as string,
      machineId: (data.machine_id as string | null) ?? null,
      tokenId: data.id as string,
    },
  };
}

/** Header a machine uses to say which of its runtimes a request is about. */
export const RUNTIME_HEADER = "x-sparstrow-runtime";

/**
 * Narrow an authenticated machine to one runtime, and thereby to one workspace.
 *
 * This is the function that replaces what the old workspace-scoped token did
 * for free, and it is the only place a workspace id is allowed to come into
 * existence for a machine request. Both checks below are load-bearing:
 *
 *   - `machine_id` equality stops a token being used to act as a DIFFERENT
 *     computer belonging to the same person. Without it, one leaked laptop
 *     token could drive every machine that person owns.
 *   - the membership check stops a runtime in a workspace the person has since
 *     left from still being addressable. Rows are cleaned up on claim, but a
 *     request can race a departure, and RLS is not here to catch it.
 *
 * A single joined read rather than two round trips: `runtimes` is keyed by id,
 * and `workspace_members` is indexed on `(user_id, workspace_id)`.
 */
export async function resolveRuntimeScope(
  scope: MachineScope,
  runtimeId: string | null,
): Promise<RuntimeScopeResult> {
  if (!runtimeId) return { ok: false, failure: "unknown_runtime" };

  const db = serviceClient();

  const { data: runtime, error } = await db
    .from("runtimes")
    .select("id, workspace_id, machine_id")
    .eq("id", runtimeId)
    .maybeSingle();

  if (error || !runtime) return { ok: false, failure: "unknown_runtime" };
  if (!scope.machineId || runtime.machine_id !== scope.machineId) {
    return { ok: false, failure: "unknown_runtime" };
  }

  const { data: membership } = await db
    .from("workspace_members")
    .select("id")
    .eq("user_id", scope.userId)
    .eq("workspace_id", runtime.workspace_id as string)
    .maybeSingle();

  if (!membership) return { ok: false, failure: "unknown_runtime" };

  return {
    ok: true,
    scope: {
      ...scope,
      runtimeId: runtime.id as string,
      workspaceId: runtime.workspace_id as string,
    },
  };
}

/**
 * The two steps together, which is what almost every route wants.
 *
 * Kept as one call so a route cannot authenticate and then forget to narrow —
 * a `MachineScope` reaching a workspace-scoped query is precisely the mistake
 * this file's header exists to prevent, and the type system alone will not
 * catch it because both shapes carry a `userId`.
 */
export async function authenticateRuntime(request: Request): Promise<RuntimeScopeResult> {
  const auth = await authenticateMachine(request);
  if (!auth.ok) return auth;
  return resolveRuntimeScope(auth.scope, request.headers.get(RUNTIME_HEADER));
}
