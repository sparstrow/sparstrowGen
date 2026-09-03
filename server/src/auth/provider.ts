import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who is making this request, and what may they see?
 *
 * This is an **interface with one implementation** (`./supabase.ts`) on
 * purpose. `AGENTS.md` §1 puts the identity provider behind a seam so it can be
 * swapped without touching a single route — and the seam has to exist before
 * there is a second implementation, or every route grows a Supabase assumption
 * that is invisible until the day someone tries to remove it.
 *
 * The contract has exactly two obligations, and the second is the load-bearing
 * one:
 *
 *   1. `verify` proves a credential belongs to a real, current user.
 *   2. `clientFor` returns a database client that acts **as that user**, so
 *      Row Level Security is still the security boundary.
 *
 * Obligation 2 is what keeps `server/` from becoming a hole in the model. The
 * service-role key bypasses RLS entirely; if `server/` used it to serve
 * human-facing reads, then every workspace-scoping rule in
 * `packages/shared/drizzle/policies/` would stop being enforced and the only
 * thing standing between two people's data would be handler code getting every
 * `.eq("workspace_id", ...)` right, forever. It would also silently undo
 * `G-35`'s premise. So: the service role is for the daemon path only, where
 * there is no user session to act as, and that path already documents its own
 * boundary in `apps/web/src/lib/daemon/auth.ts`.
 */

/** The person behind a request. Server-asserted; never read from a body. */
export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type AuthFailure =
  /** No credential presented at all. */
  | "missing"
  /** Presented, but not valid — expired, malformed, or revoked. */
  | "invalid";

export type AuthResult =
  | { ok: true; user: AuthenticatedUser; credential: string }
  | { ok: false; failure: AuthFailure };

export interface AuthProvider {
  /**
   * Verify a raw credential (the value after `Bearer `).
   *
   * Returns the credential back on success so the caller can hand it to
   * `clientFor` without re-parsing the header — the two always travel together
   * and separating them is how one ends up scoped to a different user than the
   * other.
   */
  verify(credential: string | null | undefined): Promise<AuthResult>;

  /**
   * A database client acting as the holder of `credential`.
   *
   * Must NOT be a service-role client. See the note above.
   */
  clientFor(credential: string): SupabaseClient;
}
