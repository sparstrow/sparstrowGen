import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Personal access tokens — how the desktop app and the CLI say who they are.
 *
 * The token itself is `randomBytes(32).toString("base64url")`, minted by the
 * loopback connect flow (`/api/daemon/connect/exchange`) and stored only as a
 * SHA-256 hash. This module is the read half.
 *
 * ⚠️ **This is the second place in the codebase that needs the service role**,
 * and for the same narrow reason as the first: `access_tokens.token_hash` is
 * readable by no other role, because a table that maps a hash to a person is
 * exactly the table RLS cannot help with — the caller has no identity yet, so
 * there is nothing for a policy to resolve against.
 *
 * What it must NOT become is a general-purpose service-role client. It returns
 * a user id and nothing else; the caller then mints a scoped JWT (`jwt.ts`) and
 * every subsequent query runs under RLS as that person. The service role's
 * reach ends at this one lookup.
 */

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PatResolution =
  | { ok: true; userId: string; tokenId: string; machineId: string | null }
  /** No such token. Indistinguishable, on purpose, from a typo. */
  | { ok: false; reason: "unknown" }
  /** Found, but the owner revoked it. */
  | { ok: false; reason: "revoked" }
  /** The database could not answer. Fails closed, but says so. */
  | { ok: false; reason: "unavailable" };

export async function resolvePersonalAccessToken(
  db: SupabaseClient,
  token: string,
): Promise<PatResolution> {
  // Looked up by hash, never by comparing the secret. `token_hash` is UNIQUE,
  // so this is a single indexed equality — a constant-time comparison would add
  // nothing, because the value being matched is already a hash of what the
  // caller sent.
  //
  // `revoked_at` is SELECTED rather than filtered on, so a revoked token is
  // found and reported as revoked instead of collapsing into "no such token".
  // Filtering here would make revocation indistinguishable from a typo, and the
  // owner who just revoked a machine gets a support question about a broken
  // config instead of the answer.
  const { data, error } = await db
    .from("access_tokens")
    .select("id, user_id, machine_id, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  // A query ERROR and a missing ROW are both refused, but they are not the same
  // event and must not be silent in the same way. The web app's equivalent
  // records what this cost once: against a database where `access_tokens` did
  // not exist yet, every request came back 401 with nothing in the log, which
  // reads as "every machine's credential is wrong" rather than "the migration
  // has not been applied".
  if (error) return { ok: false, reason: "unavailable" };
  if (!data) return { ok: false, reason: "unknown" };
  if (data.revoked_at) return { ok: false, reason: "revoked" };

  return {
    ok: true,
    userId: data.user_id as string,
    tokenId: data.id as string,
    machineId: (data.machine_id as string | null) ?? null,
  };
}

/**
 * Record that a token was used.
 *
 * Fire-and-forget on purpose: a request must not fail because a bookkeeping
 * write did. It matters anyway — `last_used_at` is what lets an owner tell a
 * live credential from a forgotten one when deciding what to revoke, which is
 * the whole reason a person-scoped token is safe to hand out.
 */
export async function touchTokenUsage(db: SupabaseClient, tokenId: string): Promise<void> {
  try {
    await db.from("access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenId);
  } catch {
    // Deliberately swallowed. See above.
  }
}
