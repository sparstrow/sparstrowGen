import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, AuthResult } from "./provider";
import { looksLikeJwt, mintUserJwt } from "./jwt";
import { resolvePersonalAccessToken, touchTokenUsage } from "./pat";

/**
 * Supabase Auth behind the `AuthProvider` seam.
 *
 * It accepts **two kinds of credential**, because two kinds of client exist:
 *
 * | Client | Sends | Why |
 * |---|---|---|
 * | `apps/web` | a Supabase access token (JWT) | it has a cookie session; its proxy forwards the token |
 * | desktop, CLI | a personal access token | there is no browser, no cookie, and no session to forward |
 *
 * Both end up in the same place: a Supabase client acting **as that user**, so
 * RLS is the security boundary either way. That equivalence is the design —
 * adding a second client must not mean adding a second, weaker path to the
 * data.
 *
 * A JWT is verified by asking Supabase (`auth.getUser`), which is the only
 * thing that knows whether a session was revoked or its user deleted; a locally
 * decoded JWT looks valid until its expiry no matter what happened to the
 * account behind it. A PAT is resolved against `access_tokens` and then
 * exchanged for a freshly minted, short-lived JWT — see `jwt.ts` for why that
 * is minted rather than the service role being used.
 */
export class SupabaseAuthProvider implements AuthProvider {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly serviceRoleKey: string | null;
  private readonly jwtSecret: string | null;

  /** Verification only. Holds no session of its own. */
  private readonly verifier: SupabaseClient;

  /**
   * Service-role client, used for exactly one query: resolving a PAT hash to a
   * user. Created lazily so a deployment that never issues PATs is not required
   * to hold the key at all.
   */
  private serviceClient: SupabaseClient | null = null;

  constructor(
    url: string,
    anonKey: string,
    options: { serviceRoleKey?: string | null; jwtSecret?: string | null } = {},
  ) {
    this.url = url;
    this.anonKey = anonKey;
    this.serviceRoleKey = options.serviceRoleKey ?? null;
    this.jwtSecret = options.jwtSecret ?? null;
    this.verifier = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** True when this server can authenticate desktop/CLI clients. */
  get supportsAccessTokens(): boolean {
    return Boolean(this.serviceRoleKey && this.jwtSecret);
  }

  private service(): SupabaseClient {
    if (!this.serviceClient) {
      if (!this.serviceRoleKey) {
        throw new Error(
          "SUPABASE_SERVICE_ROLE_KEY is not set, so personal access tokens cannot be resolved.",
        );
      }
      this.serviceClient = createClient(this.url, this.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.serviceClient;
  }

  async verify(credential: string | null | undefined): Promise<AuthResult> {
    if (!credential) return { ok: false, failure: "missing" };

    return looksLikeJwt(credential)
      ? this.verifyJwt(credential)
      : this.verifyAccessToken(credential);
  }

  private async verifyJwt(jwt: string): Promise<AuthResult> {
    const { data, error } = await this.verifier.auth.getUser(jwt);
    if (error || !data.user) return { ok: false, failure: "invalid" };
    return {
      ok: true,
      credential: jwt,
      user: { id: data.user.id, email: data.user.email ?? null },
    };
  }

  private async verifyAccessToken(token: string): Promise<AuthResult> {
    if (!this.supportsAccessTokens) return { ok: false, failure: "invalid" };

    const db = this.service();
    const resolved = await resolvePersonalAccessToken(db, token);
    if (!resolved.ok) return { ok: false, failure: "invalid" };

    void touchTokenUsage(db, resolved.tokenId);

    // The credential handed back is the MINTED JWT, not the PAT. Everything
    // downstream — `clientFor`, the handlers, PostgREST — then deals in one
    // currency, and no code below this line has to know which door the request
    // came in through.
    return {
      ok: true,
      credential: mintUserJwt({ userId: resolved.userId, secret: this.jwtSecret! }),
      user: { id: resolved.userId, email: null },
    };
  }

  clientFor(credential: string): SupabaseClient {
    // The anon key plus a user JWT. PostgREST reads the JWT, `auth.uid()`
    // resolves to this user, and every RLS policy applies exactly as it does
    // for a browser session. Deliberately NOT the service-role key.
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
