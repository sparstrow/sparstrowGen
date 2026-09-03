import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken, resolvePersonalAccessToken } from "./pat";
import { SupabaseAuthProvider } from "./supabase";

/**
 * The desktop/CLI credential path.
 *
 * The behaviour worth pinning is mostly about **what is refused and how**: a
 * revoked token must be distinguishable from an unknown one internally (so the
 * owner who just revoked a machine gets the truth) while both look identical
 * from outside (so the boundary is not an oracle).
 */

const TOKEN = "cGxhaW4tdG9rZW4tYnl0ZXMtd2l0aG91dC1hbnktZG90cw";
const USER = "67369a0c-9081-4f33-928d-e6ce17d5d1e0";
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

/** A Supabase client stub that answers exactly one `access_tokens` lookup. */
function dbReturning(result: { data: unknown; error: unknown }) {
  const eq = vi.fn(() => ({ maybeSingle: async () => result }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, update: () => ({ eq: async () => ({}) }) }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq };
}

describe("hashToken", () => {
  it("is a stable sha256 hex digest", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("resolvePersonalAccessToken", () => {
  it("looks the token up by HASH, never by the secret itself", async () => {
    const { client, eq, select } = dbReturning({
      data: { id: "tok_1", user_id: USER, machine_id: "m_1", revoked_at: null },
      error: null,
    });

    await resolvePersonalAccessToken(client, TOKEN);

    expect(select).toHaveBeenCalledWith("id, user_id, machine_id, revoked_at");
    expect(eq).toHaveBeenCalledWith("token_hash", hashToken(TOKEN));
    // The raw token must never appear in a query.
    expect(eq).not.toHaveBeenCalledWith("token_hash", TOKEN);
  });

  it("resolves a live token to its person", async () => {
    const { client } = dbReturning({
      data: { id: "tok_1", user_id: USER, machine_id: "m_1", revoked_at: null },
      error: null,
    });
    await expect(resolvePersonalAccessToken(client, TOKEN)).resolves.toEqual({
      ok: true,
      userId: USER,
      tokenId: "tok_1",
      machineId: "m_1",
    });
  });

  it("reports a revoked token AS revoked, not as unknown", async () => {
    // Filtering `revoked_at` in the query would make revocation
    // indistinguishable from a typo, and the owner who just revoked a machine
    // would get a support question instead of an answer.
    const { client } = dbReturning({
      data: { id: "tok_1", user_id: USER, machine_id: null, revoked_at: "2026-09-01T00:00:00Z" },
      error: null,
    });
    await expect(resolvePersonalAccessToken(client, TOKEN)).resolves.toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  it("distinguishes a database failure from a missing token", async () => {
    const missing = dbReturning({ data: null, error: null });
    await expect(resolvePersonalAccessToken(missing.client, TOKEN)).resolves.toEqual({
      ok: false,
      reason: "unknown",
    });

    // Still fails closed — a database that cannot answer authenticates nobody —
    // but it says which failure it was, so "the migration was never applied"
    // does not read as "every credential is wrong".
    const broken = dbReturning({ data: null, error: { message: "relation does not exist" } });
    await expect(resolvePersonalAccessToken(broken.client, TOKEN)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("SupabaseAuthProvider with access tokens", () => {
  it("cannot accept an access token unless BOTH secrets are configured", async () => {
    // Half-configured must not half-work. Without the service role it cannot
    // resolve the token; without the JWT secret it cannot mint one that RLS
    // would honour — and silently falling back to either would be worse than
    // refusing.
    const neither = new SupabaseAuthProvider("http://localhost:54321", "anon");
    expect(neither.supportsAccessTokens).toBe(false);
    await expect(neither.verify(TOKEN)).resolves.toEqual({ ok: false, failure: "invalid" });

    const onlyService = new SupabaseAuthProvider("http://localhost:54321", "anon", {
      serviceRoleKey: "svc",
    });
    expect(onlyService.supportsAccessTokens).toBe(false);

    const onlySecret = new SupabaseAuthProvider("http://localhost:54321", "anon", {
      jwtSecret: SECRET,
    });
    expect(onlySecret.supportsAccessTokens).toBe(false);

    const both = new SupabaseAuthProvider("http://localhost:54321", "anon", {
      serviceRoleKey: "svc",
      jwtSecret: SECRET,
    });
    expect(both.supportsAccessTokens).toBe(true);
  });

  it("refuses a missing credential before deciding what kind it is", async () => {
    const provider = new SupabaseAuthProvider("http://localhost:54321", "anon");
    await expect(provider.verify(null)).resolves.toEqual({ ok: false, failure: "missing" });
    await expect(provider.verify("")).resolves.toEqual({ ok: false, failure: "missing" });
  });
});
