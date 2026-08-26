import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";

const authenticateDaemon = vi.fn();
vi.mock("@web/lib/daemon/auth", () => ({ authenticateDaemon: (...args: unknown[]) => authenticateDaemon(...args) }));

const ORIGINAL_ENV = process.env.SUPABASE_JWT_SIGNING_KEY;

beforeEach(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  privateJwk.kid = "test-key-1";
  process.env.SUPABASE_JWT_SIGNING_KEY = JSON.stringify(privateJwk);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  if (ORIGINAL_ENV === undefined) delete process.env.SUPABASE_JWT_SIGNING_KEY;
  else process.env.SUPABASE_JWT_SIGNING_KEY = ORIGINAL_ENV;
});

function req() {
  return new Request("https://example.test/api/daemon/realtime/token", { method: "POST" });
}

describe("POST /api/daemon/realtime/token", () => {
  it("returns 401 when there is no token", async () => {
    authenticateDaemon.mockResolvedValue({ ok: false, failure: "unauthenticated" });
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the pairing was revoked", async () => {
    authenticateDaemon.mockResolvedValue({ ok: false, failure: "revoked" });
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(403);
  });

  it("returns 200 with a token that verifies against the signing key, for a valid token", async () => {
    authenticateDaemon.mockResolvedValue({
      ok: true,
      scope: { workspaceId: "ws1", runtimeId: "rt1", tokenId: "tok1" },
    });
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(200);

    const body = (await res.json()) as { token: string; expiresAt: string; supabaseUrl: string; supabaseAnonKey: string };
    expect(typeof body.token).toBe("string");
    expect(typeof body.expiresAt).toBe("string");
    expect(body.supabaseUrl).toBe("https://example.supabase.co");
    expect(body.supabaseAnonKey).toBe("test-anon-key");

    const { d: _d, ...publicJwk } = JSON.parse(process.env.SUPABASE_JWT_SIGNING_KEY as string);
    const publicKey = await importJWK(publicJwk, "ES256");
    const { payload } = await jwtVerify(body.token, publicKey);
    expect(payload.workspace_id).toBe("ws1");
    expect(payload.runtime_id).toBe("rt1");
  });
});
