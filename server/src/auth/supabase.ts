import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, AuthResult } from "./provider";

/**
 * Supabase Auth behind the `AuthProvider` seam.
 *
 * The credential is a Supabase access token (a JWT). Clients get one by signing
 * in — `apps/web` from its cookie session, the desktop app from the loopback
 * flow — and send it as `Authorization: Bearer <jwt>`.
 *
 * **Verification is a real round trip, not a local decode.** `auth.getUser(jwt)`
 * asks Supabase, which is the only thing that knows whether the session was
 * revoked, the user deleted, or the token issued by a different project. A
 * locally-decoded JWT looks valid until its expiry no matter what happened to
 * the account behind it. The cost is one call per request, which is the same
 * cost `apps/web` already paid via `supabase.auth.getUser()` in its adapter —
 * this is not a new expense, just a visible one.
 */
export class SupabaseAuthProvider implements AuthProvider {
  private readonly url: string;
  private readonly anonKey: string;

  /** Verification only. Holds no session of its own. */
  private readonly verifier: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.url = url;
    this.anonKey = anonKey;
    this.verifier = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async verify(credential: string | null | undefined): Promise<AuthResult> {
    if (!credential) return { ok: false, failure: "missing" };

    const { data, error } = await this.verifier.auth.getUser(credential);
    if (error || !data.user) return { ok: false, failure: "invalid" };

    return {
      ok: true,
      credential,
      user: { id: data.user.id, email: data.user.email ?? null },
    };
  }

  clientFor(credential: string): SupabaseClient {
    // The anon key plus the user's JWT. PostgREST reads the JWT, `auth.uid()`
    // resolves to this user, and every RLS policy applies exactly as it does
    // for a browser session. Deliberately NOT the service-role key — see the
    // note in `provider.ts` about why that would quietly disable the entire
    // policy layer.
    //
    // A fresh client per request rather than one shared client with a swapped
    // header: supabase-js clients are cheap, and a shared one would leak one
    // user's Authorization header into another's concurrent request.
    return createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${credential}` } },
    });
  }
}

/**
 * Pull the credential out of an `Authorization` header.
 *
 * Case-insensitive on the scheme because HTTP says so, and callers that send
 * `bearer` lowercase are otherwise rejected with a message that gives them no
 * clue why.
 */
export function bearerFrom(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
