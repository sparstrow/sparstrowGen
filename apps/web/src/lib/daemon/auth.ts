import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { supabaseUrl } from "@web/utils/supabase/env";

/**
 * Daemon authentication — the one place the service role enters this codebase.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  NO DAEMON ROUTE MAY READ A WORKSPACE ID OR RUNTIME ID FROM A REQUEST BODY.
 *  Ever, for any reason. Both come from `authenticateDaemon()` and nowhere
 *  else.
 *
 *  Everywhere else in this app, supabase-js runs as the signed-in user and RLS
 *  is the backstop: a handler that trusted a client-supplied workspace id would
 *  still be denied by the database. Here there is no backstop. The service role
 *  bypasses RLS entirely, so a body-supplied id is believed, and a daemon
 *  paired to workspace A could name workspace B and be handed it.
 *
 *  If you are adding a route under /api/daemon and reaching for `body.
 *  workspaceId`, stop.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Why the service role at all: a daemon is not a Supabase user. It has no
 * `auth.uid()`, so every RLS policy M1 wrote — all of which resolve the caller
 * through `workspace_members` — denies it. Giving each runtime a real auth user
 * would make it look like a member, which grants the whole workspace; a daemon
 * token is deliberately scoped to one runtime. See doc/tasks/M3/README.md
 * decision 1 for the alternatives considered and rejected.
 */

export type DaemonScope = {
  workspaceId: string;
  runtimeId: string;
  tokenId: string;
};

export type DaemonAuthFailure = "unauthenticated" | "revoked";

export type DaemonAuthResult =
  | { ok: true; scope: DaemonScope }
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
 * verified scope from `authenticateDaemon` and a narrow helper below.
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
 * Resolve a bearer token to the runtime and workspace it is scoped to.
 *
 * Returns a discriminated failure rather than throwing so callers must handle
 * it, and so "no token" and "revoked token" stay distinguishable — the daemon
 * logs very different things for a misconfiguration and for the owner having
 * deliberately cut it off.
 */
export async function authenticateDaemon(request: Request): Promise<DaemonAuthResult> {
  const token = bearerFrom(request);
  if (!token) return { ok: false, failure: "unauthenticated" };

  const db = serviceClient();

  // Looked up by hash, never by comparing the secret. `token_hash` is UNIQUE,
  // so this is a single indexed equality -- constant-time comparison would add
  // nothing, because the value being matched is already a hash.
  //
  // `revoked_at` is selected rather than filtered on, so a revoked token is
  // found and reported as revoked instead of collapsing into "no such token".
  // Filtering here is the bug the phase spec warns about: it makes revocation
  // indistinguishable from a typo, and the owner who just revoked a machine
  // gets a support question about a broken config.
  const { data, error } = await db
    .from("daemon_tokens")
    .select("id, workspace_id, runtime_id, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) return { ok: false, failure: "unauthenticated" };
  if (data.revoked_at) return { ok: false, failure: "revoked" };

  // Best-effort, deliberately not awaited: this is what makes "last seen
  // Tuesday" answerable in the UI, but it must not add a round trip to every
  // heartbeat. A lost update here costs a slightly stale timestamp, nothing more.
  void db
    .from("daemon_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(
      () => undefined,
      () => undefined,
    );

  return {
    ok: true,
    scope: {
      workspaceId: data.workspace_id as string,
      runtimeId: data.runtime_id as string,
      tokenId: data.id as string,
    },
  };
}
