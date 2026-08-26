import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { DAEMON_REALTIME_TOKEN_TTL_S } from "@sparstrow/shared";
import { mintRealtimeToken } from "./realtime-token";

const ORIGINAL_ENV = process.env.SUPABASE_JWT_SIGNING_KEY;

let publicKey: Awaited<ReturnType<typeof importJWK>>;

beforeEach(async () => {
  // A throwaway ES256 keypair per test, never the project's real one — this
  // only proves mintRealtimeToken signs and shapes claims correctly.
  const { privateKey, publicKey: pub } = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(pub);
  const kid = "test-key-1";
  privateJwk.kid = kid;
  publicJwk.kid = kid;
  process.env.SUPABASE_JWT_SIGNING_KEY = JSON.stringify(privateJwk);
  publicKey = await importJWK(publicJwk, "ES256");
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.SUPABASE_JWT_SIGNING_KEY;
  else process.env.SUPABASE_JWT_SIGNING_KEY = ORIGINAL_ENV;
});

describe("mintRealtimeToken", () => {
  it("mints a token that verifies against the matching public key", async () => {
    const { token } = await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    const { payload, protectedHeader } = await jwtVerify(token, publicKey);

    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.kid).toBe("test-key-1");
    expect(payload.role).toBe("authenticated");
    expect(payload.aud).toBe("authenticated");
    expect(payload.workspace_id).toBe("ws1");
    expect(payload.runtime_id).toBe("rt1");
  });

  it("never includes a sub claim", async () => {
    const { token } = await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    const { payload } = await jwtVerify(token, publicKey);
    expect(payload.sub).toBeUndefined();
  });

  it("sets exp exactly DAEMON_REALTIME_TOKEN_TTL_S ahead of iat", async () => {
    const { token } = await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    const { payload } = await jwtVerify(token, publicKey);
    expect((payload.exp as number) - (payload.iat as number)).toBe(DAEMON_REALTIME_TOKEN_TTL_S);
  });

  it("returns expiresAt as an ISO string matching the token's exp", async () => {
    const { token, expiresAt } = await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    const { payload } = await jwtVerify(token, publicKey);
    expect(new Date(expiresAt).getTime()).toBe((payload.exp as number) * 1000);
  });

  it("throws naming the missing env var when the signing key is absent", async () => {
    delete process.env.SUPABASE_JWT_SIGNING_KEY;
    await expect(mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" })).rejects.toThrow(
      "SUPABASE_JWT_SIGNING_KEY is not set",
    );
  });

  it("throws a clear error when the env var is not valid JSON", async () => {
    process.env.SUPABASE_JWT_SIGNING_KEY = "not-json";
    await expect(mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" })).rejects.toThrow(
      "not valid JSON",
    );
  });
});
