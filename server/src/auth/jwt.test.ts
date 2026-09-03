import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MINTED_JWT_TTL_SECONDS, looksLikeJwt, mintUserJwt, safeEqual } from "./jwt";

/**
 * These tests exist because this module is the hinge the desktop app's whole
 * security posture hangs on. If `mintUserJwt` produced a token PostgREST
 * rejected, the visible symptom would be "the desktop app cannot read
 * anything"; if it produced one with the wrong `role`, the symptom would be
 * nothing at all — every RLS policy quietly bypassed, and no error anywhere.
 *
 * So the `role` assertion below is not box-ticking. It is the test that fails
 * loudly instead of a security boundary failing silently.
 */

const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const USER = "67369a0c-9081-4f33-928d-e6ce17d5d1e0";

function decode(jwt: string) {
  const [h, p, s] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(h!, "base64url").toString()),
    payload: JSON.parse(Buffer.from(p!, "base64url").toString()),
    signature: s!,
    signingInput: `${h}.${p}`,
  };
}

describe("mintUserJwt", () => {
  it("produces a verifiable HS256 signature over header and payload", () => {
    const jwt = mintUserJwt({ userId: USER, secret: SECRET });
    const { header, signature, signingInput } = decode(jwt);

    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    const expected = createHmac("sha256", SECRET).update(signingInput).digest("base64url");
    expect(signature).toBe(expected);
  });

  it("carries `sub` — which is what auth.uid() reads, and therefore what RLS resolves", () => {
    const { payload } = decode(mintUserJwt({ userId: USER, secret: SECRET }));
    expect(payload.sub).toBe(USER);
  });

  it("asks for the `authenticated` role and NEVER service_role", () => {
    // The whole reason this module exists rather than reaching for the service
    // role. `service_role` here would bypass every policy in
    // packages/shared/drizzle/policies/ with no symptom whatsoever.
    const { payload } = decode(mintUserJwt({ userId: USER, secret: SECRET }));
    expect(payload.role).toBe("authenticated");
    expect(payload.aud).toBe("authenticated");
  });

  it("expires, and soon", () => {
    const now = () => 1_700_000_000_000;
    const { payload } = decode(mintUserJwt({ userId: USER, secret: SECRET, now }));
    expect(payload.iat).toBe(1_700_000_000);
    expect(payload.exp).toBe(1_700_000_000 + MINTED_JWT_TTL_SECONDS);
    expect(MINTED_JWT_TTL_SECONDS).toBeLessThanOrEqual(600);
  });

  it("honours an explicit ttl", () => {
    const now = () => 1_700_000_000_000;
    const { payload } = decode(mintUserJwt({ userId: USER, secret: SECRET, ttlSeconds: 30, now }));
    expect(payload.exp - payload.iat).toBe(30);
  });

  it("refuses to mint without a user or a secret, rather than minting something useless", () => {
    // A token with an empty `sub` authenticates as nobody and would fail as a
    // confusing RLS denial far from here.
    expect(() => mintUserJwt({ userId: "", secret: SECRET })).toThrow(/userId/);
    expect(() => mintUserJwt({ userId: USER, secret: "" })).toThrow(/secret/);
  });

  it("produces a different signature under a different secret", () => {
    const a = mintUserJwt({ userId: USER, secret: SECRET, now: () => 1 });
    const b = mintUserJwt({ userId: USER, secret: SECRET + "x", now: () => 1 });
    expect(a).not.toBe(b);
  });
});

describe("looksLikeJwt", () => {
  it("recognises a minted token", () => {
    expect(looksLikeJwt(mintUserJwt({ userId: USER, secret: SECRET }))).toBe(true);
  });

  it("rejects a personal access token", () => {
    // `randomBytes(32).toString("base64url")` — the alphabet cannot contain a
    // dot, which is why "exactly two dots" is a property here and not a guess.
    expect(looksLikeJwt("cGxhaW4tdG9rZW4tYnl0ZXMtd2l0aG91dC1hbnktZG90cw")).toBe(false);
  });

  it("rejects malformed near-misses rather than treating them as JWTs", () => {
    expect(looksLikeJwt("a.b")).toBe(false);
    expect(looksLikeJwt("a.b.c.d")).toBe(false);
    expect(looksLikeJwt("a..c")).toBe(false);
    expect(looksLikeJwt("")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares equal and unequal values of the same length", () => {
    expect(safeEqual("abcdef", "abcdef")).toBe(true);
    expect(safeEqual("abcdef", "abcdeg")).toBe(false);
  });

  it("returns false on a length mismatch instead of throwing", () => {
    // `timingSafeEqual` throws on differing lengths; a comparison helper that
    // throws is one every caller has to wrap.
    expect(safeEqual("short", "much longer value")).toBe(false);
  });
});
