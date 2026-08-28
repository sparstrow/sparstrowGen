import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route's own contract: who is refused, and that a success carries the
 * credential shape core expects. **Not** how the credential is produced — that
 * is `lib/daemon/realtime-token.test.ts`, and mocking the mint here is what
 * keeps this file about routing.
 *
 * Rewritten by `T-DI-03`. The previous version generated an ES256 keypair and
 * verified the returned JWT against it; there is nothing to verify that way any
 * more, because Supabase signs the token now.
 */

const authenticateDaemon = vi.fn();
vi.mock("@web/lib/daemon/auth", () => ({
  authenticateDaemon: (...args: unknown[]) => authenticateDaemon(...args),
}));

const mintRealtimeToken = vi.fn();
vi.mock("@web/lib/daemon/realtime-token", () => ({
  mintRealtimeToken: (...args: unknown[]) => mintRealtimeToken(...args),
}));

beforeEach(() => {
  mintRealtimeToken.mockResolvedValue({
    token: "supabase-signed-jwt",
    expiresAt: "2026-08-27T12:00:00.000Z",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "test-anon-key",
  });
});

afterEach(() => {
  vi.clearAllMocks();
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
    expect(mintRealtimeToken).not.toHaveBeenCalled();
  });

  it("returns 403 when the pairing was revoked", async () => {
    authenticateDaemon.mockResolvedValue({ ok: false, failure: "revoked" });
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(403);
    // A revoked pairing must never reach the mint — otherwise it would create
    // a daemon identity for a machine that has just been cut off.
    expect(mintRealtimeToken).not.toHaveBeenCalled();
  });

  it("returns 200 with the full credential for a valid token", async () => {
    authenticateDaemon.mockResolvedValue({
      ok: true,
      scope: { workspaceId: "ws1", runtimeId: "rt1", tokenId: "tok1" },
    });
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      token: string;
      expiresAt: string;
      supabaseUrl: string;
      supabaseAnonKey: string;
    };
    expect(body.token).toBe("supabase-signed-jwt");
    expect(body.expiresAt).toBe("2026-08-27T12:00:00.000Z");
    expect(body.supabaseUrl).toBe("https://example.supabase.co");
    expect(body.supabaseAnonKey).toBe("test-anon-key");
  });

  it("mints for the scope the bearer token resolved to, never a request body", async () => {
    authenticateDaemon.mockResolvedValue({
      ok: true,
      scope: { workspaceId: "ws1", runtimeId: "rt1", tokenId: "tok1" },
    });
    const { POST } = await import("./route");
    await POST(req());
    expect(mintRealtimeToken).toHaveBeenCalledWith({ workspaceId: "ws1", runtimeId: "rt1" });
  });

  it("returns 500 without leaking the failure detail when minting throws", async () => {
    authenticateDaemon.mockResolvedValue({
      ok: true,
      scope: { workspaceId: "ws1", runtimeId: "rt1", tokenId: "tok1" },
    });
    mintRealtimeToken.mockRejectedValue(new Error("supabase admin api exploded"));
    const { POST } = await import("./route");
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("exploded");
  });
});
