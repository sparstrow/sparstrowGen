import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mint a short-lived Supabase-compatible JWT for a user `server/` has already
 * authenticated by some other means.
 *
 * ─── Why this exists ──────────────────────────────────────────────────────
 *
 * The desktop app and the CLI authenticate with a **personal access token**, not
 * a Supabase session. A PAT resolves to a user id, but PostgREST does not know
 * what a PAT is — `auth.uid()` would be null and every RLS policy would deny
 * the request.
 *
 * The tempting fix is to serve those requests with the service-role key, and it
 * is the wrong one: the service role bypasses RLS entirely, so every
 * workspace-scoping rule in `packages/shared/drizzle/policies/` would stop being
 * enforced for exactly the client we are trying to add. See `provider.ts`.
 *
 * So instead we mint the thing PostgREST *does* understand. Supabase documents
 * this: a JWT carrying `sub` (the user), `role: "authenticated"` and `exp`,
 * signed with the project's JWT secret, is accepted, and `auth.uid()` reads
 * `sub`. RLS then applies to a PAT-authenticated request exactly as it does to
 * a browser session — which is the whole point.
 *
 * ─── Why the signing is hand-rolled ───────────────────────────────────────
 *
 * This module only ever **signs**, never verifies, and that asymmetry is what
 * makes ~15 lines of HMAC acceptable where a hand-rolled verifier would not be.
 * Verification is where JWT libraries earn their keep — `alg: none`, algorithm
 * confusion, unbounded `kid` lookups — and none of those are reachable from a
 * function that takes a user id and returns a string. Adding a dependency to
 * concatenate three base64url segments would be the larger risk surface.
 *
 * Supabase verifies these; we never do.
 */

/**
 * How long a minted token lives.
 *
 * Short on purpose. The token never leaves this process — it is created per
 * request, handed to a Supabase client, and dropped — so a long life buys
 * nothing and only widens the window if one is ever captured in a log or a
 * heap dump. Long enough to survive a slow query, and no longer.
 */
export const MINTED_JWT_TTL_SECONDS = 300;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export type MintOptions = {
  /** The Supabase auth user id. Becomes `sub`, which `auth.uid()` reads. */
  userId: string;
  /** The project's JWT secret. Server-only, like the service-role key. */
  secret: string;
  /** Seconds. Defaults to `MINTED_JWT_TTL_SECONDS`. */
  ttlSeconds?: number;
  /** Injectable so tests are not time-dependent. */
  now?: () => number;
};

export function mintUserJwt({
  userId,
  secret,
  ttlSeconds = MINTED_JWT_TTL_SECONDS,
  now = Date.now,
}: MintOptions): string {
  if (!userId) throw new Error("mintUserJwt: a userId is required");
  if (!secret) throw new Error("mintUserJwt: a JWT secret is required");

  const issuedAt = Math.floor(now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    // The Postgres role PostgREST switches to. `authenticated` is the one every
    // policy in this project is written against; `service_role` here would
    // silently reintroduce the RLS bypass this module exists to avoid.
    role: "authenticated",
    // Supabase's own tokens carry these and some policies/helpers read them.
    aud: "authenticated",
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Is this credential a JWT, or one of our own access tokens?
 *
 * Structural, and reliable because of what the two things are made of: a JWT is
 * three base64url segments separated by dots, and a Sparstrow PAT is
 * `randomBytes(32).toString("base64url")` — an alphabet that **cannot contain a
 * dot**. So "exactly two dots" is not a heuristic here, it is a property.
 *
 * Deliberately not "does it start with ey": that is a fact about the base64 of
 * `{"alg"...`, which is true today and is not a contract.
 */
export function looksLikeJwt(credential: string): boolean {
  const parts = credential.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Constant-time string compare, for the one caller that needs it.
 *
 * Not used for token lookup — those go through a hash and an indexed equality,
 * where timing tells an attacker nothing they did not already supply. Exported
 * for callers comparing a secret directly.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
