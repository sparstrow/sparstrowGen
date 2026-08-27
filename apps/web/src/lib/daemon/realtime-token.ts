import { SignJWT, importJWK, type JWK } from "jose";
import { DAEMON_REALTIME_TOKEN_TTL_S, type RealtimeCredential } from "@sparstrow/shared";
import { supabaseAnonKey, supabaseUrl } from "@web/utils/supabase/env";

/**
 * T-M16-02 — mints the short-lived credential a paired daemon presents to
 * Supabase Realtime, from the bearer-token scope `authenticateDaemon` already
 * resolved. One route (`/api/daemon/realtime/token`) calls this; nothing else
 * should.
 *
 * ─── Which signing path ──────────────────────────────────────────────────────
 *
 * This project's Realtime accepts asymmetric signing keys, not the legacy
 * shared HS256 secret — confirmed against its own JWKS endpoint
 * (`GET /auth/v1/.well-known/jwks.json`) rather than inferred from the anon
 * key's algorithm, per this task's own instruction: it returned one `ES256`
 * key, so this signs with the project's current ES256 private signing key and
 * sets `kid` to that key's id so Realtime can select the matching public key
 * from the JWKS it already serves.
 *
 * The private key never ships in this repo. It is read whole, as a JSON JWK
 * (the format Supabase's dashboard exports it in), from a server-only env var
 * — see doc/runbooks/README.md for the one-time owner step.
 */

export interface RealtimeTokenClaims {
  workspaceId: string;
  runtimeId: string;
}

function signingJwk(): JWK {
  const raw = process.env.SUPABASE_JWT_SIGNING_KEY;
  if (!raw) {
    throw new Error(
      "SUPABASE_JWT_SIGNING_KEY is not set. The realtime token route cannot mint a " +
        "credential without it. Set it from Supabase → Project Settings → API → " +
        "JWT Keys → the current ES256 private key, exported as JSON. It must never " +
        "be prefixed NEXT_PUBLIC_.",
    );
  }
  let jwk: JWK;
  try {
    jwk = JSON.parse(raw) as JWK;
  } catch {
    throw new Error("SUPABASE_JWT_SIGNING_KEY is not valid JSON. Expected a JWK, not a PEM or raw key.");
  }
  if (!jwk.kid) {
    throw new Error("SUPABASE_JWT_SIGNING_KEY has no `kid` — Realtime cannot select it from the JWKS without one.");
  }
  return jwk;
}

/**
 * Mint a Realtime-scoped JWT for one machine.
 *
 * No `sub`. A nanoid there would make `auth.uid()` raise on its `uuid` cast
 * inside `private.current_workspace_ids()` — which `010_transcript_broadcast.sql`
 * and `015_chat_broadcast.sql` both call — the moment this machine's admin
 * subscribed to a run transcript or a chat turn on the side, breaking two
 * features this token was never meant to touch.
 */
export async function mintRealtimeToken({ workspaceId, runtimeId }: RealtimeTokenClaims): Promise<RealtimeCredential> {
  const jwk = signingJwk();
  const key = await importJWK(jwk, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + DAEMON_REALTIME_TOKEN_TTL_S;

  const token = await new SignJWT({
    role: "authenticated",
    workspace_id: workspaceId,
    runtime_id: runtimeId,
  })
    .setProtectedHeader({ alg: "ES256", kid: jwk.kid })
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    supabaseUrl: supabaseUrl(),
    supabaseAnonKey: supabaseAnonKey(),
  };
}
