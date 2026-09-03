import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Machine authentication — the one place the service role enters `server/`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  NO ROUTE MAY READ A WORKSPACE ID FROM A REQUEST BODY. Ever, for any reason.
 *
 *  Everywhere else, supabase-js runs as the signed-in user and RLS is the
 *  backstop: a handler that trusted a client-supplied workspace id would still
 *  be denied by the database. Here there is no backstop. The service role
 *  bypasses RLS entirely, so a body-supplied id is believed.
 *
 *  A machine serves MANY workspaces, so it does have to say which one it is
 *  acting for — but it names a RUNTIME, never a workspace, and it names it in
 *  the `X-Sparstrow-Runtime` header. `resolveRuntimeScope` then loads that
 *  runtime row and derives the workspace from it, having first proved:
 *
 *    1. the runtime belongs to THIS token's machine, and
 *    2. this token's user is a member of the workspace that runtime is in.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Why the service role at all: a machine is not a Supabase user session. It
 * holds a bearer token, not a JWT, so `auth.uid()` is null and every RLS policy
 * denies it. The token IS resolved to a real user id here — but resolving it
 * requires reading `access_tokens.token_hash`, granted to no role but this one.
 *
 * Ported from `apps/web/src/lib/daemon/auth.ts` with ONE deliberate change: the
 * service-role client is passed in rather than built from `process.env`.
 * `server/` already resolves its configuration once, in `loadServerConfig`, and
 * a module reaching into the environment for a secret is how the same key ends
 * up read from three places with three different failure messages.
 *
 * The trust boundary this widened is in
 * `doc/security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md`.
 * A leaked token acts as the person; `last_used_at` is maintained for that
 * reason.
 */

export type MachineScope = {
  /** The person this token acts as. Server-asserted; never client-supplied. */
  userId: string;
  /** The computer this token was issued to, if it has claimed one yet. */
  machineId: string | null;
  tokenId: string;
};

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

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ? match[1].trim() : null;
}

/**
 * Resolve a bearer token to the PERSON it acts as.
 *
 * Returns a discriminated failure rather than throwing, so callers must handle
 * it and so "no token" and "revoked token" stay distinguishable — a machine
 * logs very different things for a misconfiguration and for the owner having
 * deliberately cut it off.
 */
export async function authenticateMachine(
  db: SupabaseClient,
  request: Request,
): Promise<MachineAuthResult> {
  const token = bearerFrom(request);
  if (!token) return { ok: false, failure: "unauthenticated" };

  // Looked up by hash, never by comparing the secret. `token_hash` is UNIQUE,
  // so this is a single indexed equality — a constant-time comparison would add
  // nothing, because the value being matched is already a hash.
  //
  // `revoked_at` is selected rather than filtered on, so a revoked token is
  // found and reported as revoked instead of collapsing into "no such token".
  const { data, error } = await db
    .from("access_tokens")
    .select("id, user_id, machine_id, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  // A query ERROR and a missing ROW are both refused, but they are not the same
  // event and must not be silent in the same way — a database that cannot
  // answer reads as "every machine's credential is wrong" rather than "the
  // migration has not been applied". Still fails closed, deliberately.
  if (error) {
    console.error("access token lookup failed", { code: error.code, message: error.message });
    return { ok: false, failure: "unauthenticated" };
  }
  if (!data) return { ok: false, failure: "unauthenticated" };
  if (data.revoked_at) return { ok: false, failure: "revoked" };

  // Best-effort, deliberately not awaited: this is what makes "last used 2
  // hours ago" answerable, and under a person-scoped credential that column is
  // a security control rather than a nicety. It must not add a round trip to
  // every heartbeat. A lost update costs a stale timestamp, nothing more.
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
 * Both checks below are load-bearing:
 *
 *   - `machine_id` equality stops a token being used to act as a DIFFERENT
 *     computer belonging to the same person. Without it, one leaked laptop
 *     token could drive every machine that person owns.
 *   - the membership check stops a runtime in a workspace the person has since
 *     left from still being addressable. Rows are cleaned up on claim, but a
 *     request can race a departure, and RLS is not here to catch it.
 */
export async function resolveRuntimeScope(
  db: SupabaseClient,
  scope: MachineScope,
  runtimeId: string | null,
): Promise<RuntimeScopeResult> {
  if (!runtimeId) return { ok: false, failure: "unknown_runtime" };

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
 * Kept as one call so a route cannot authenticate and then forget to narrow — a
 * `MachineScope` reaching a workspace-scoped query is precisely the mistake
 * this file's header exists to prevent, and the type system alone will not
 * catch it because both shapes carry a `userId`.
 */
export async function authenticateRuntime(
  db: SupabaseClient,
  request: Request,
): Promise<RuntimeScopeResult> {
  const auth = await authenticateMachine(db, request);
  if (!auth.ok) return auth;
  return resolveRuntimeScope(db, auth.scope, request.headers.get(RUNTIME_HEADER));
}
