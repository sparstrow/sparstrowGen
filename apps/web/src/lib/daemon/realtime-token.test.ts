import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `T-DI-03`. These prove the shape of the credential and the identity
 * lifecycle around it — not that Supabase's own Auth works.
 *
 * The pre-DI version of this suite generated a throwaway ES256 keypair and
 * verified a self-signed JWT. There is nothing left to verify that way: the
 * token is now minted by Supabase, so what matters is that the right admin
 * calls are made, in the right order, exactly once per identity.
 */

const db = {
  from: vi.fn(),
  auth: {
    admin: { createUser: vi.fn(), generateLink: vi.fn() },
    verifyOtp: vi.fn(),
  },
};

vi.mock("./auth", () => ({ daemonDb: () => db }));

import { daemonIdentityEmail, mintRealtimeToken } from "./realtime-token";

/** One row of `daemon_identities`, or none. */
let identityRow: { user_id: string } | null = null;
/** Every `insert()` payload seen this test. */
let inserted: Record<string, unknown>[] = [];
let insertError: { message: string } | null = null;

const EXPIRES_AT = Math.floor(Date.now() / 1000) + 3600;

function selectChain() {
  return {
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: identityRow, error: null }) }),
    }),
    insert: async (payload: Record<string, unknown>) => {
      inserted.push(payload);
      if (insertError) return { error: insertError };
      identityRow = { user_id: payload.user_id as string };
      return { error: null };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  identityRow = null;
  inserted = [];
  insertError = null;

  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

  db.from.mockImplementation(() => selectChain());
  db.auth.admin.createUser.mockResolvedValue({ data: { user: { id: "user-uuid-1" } }, error: null });
  db.auth.admin.generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "hashed-1" } },
    error: null,
  });
  db.auth.verifyOtp.mockResolvedValue({
    data: { session: { access_token: "supabase-signed-jwt", expires_at: EXPIRES_AT } },
    error: null,
  });
});

describe("daemonIdentityEmail", () => {
  it("uses a reserved domain that can never receive mail", () => {
    // RFC 2606 reserves `.invalid`. This matters beyond tidiness: the project's
    // mailer is capped and org-only (D-14), so an address that could actually
    // be delivered to would generate bounces on every refresh.
    expect(daemonIdentityEmail("rt_1")).toBe("daemon+rt_1@runtime.sparstrow.invalid");
    expect(daemonIdentityEmail("rt_1").endsWith(".invalid")).toBe(true);
  });

  it("is distinct per runtime", () => {
    expect(daemonIdentityEmail("rt_1")).not.toBe(daemonIdentityEmail("rt_2"));
  });
});

describe("mintRealtimeToken", () => {
  it("returns the Supabase-signed access token, not one it signed itself", async () => {
    const credential = await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    expect(credential.token).toBe("supabase-signed-jwt");
  });

  it("takes expiresAt from the session, not from a constant", async () => {
    const credential = await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    expect(new Date(credential.expiresAt).getTime()).toBe(EXPIRES_AT * 1000);
  });

  it("includes the Supabase URL and anon key, so a machine needs no separate config", async () => {
    const credential = await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    expect(credential.supabaseUrl).toBe("https://example.supabase.co");
    expect(credential.supabaseAnonKey).toBe("test-anon-key");
  });

  it("creates the identity on first use and maps it to this runtime and workspace", async () => {
    await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });

    expect(db.auth.admin.createUser).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([{ user_id: "user-uuid-1", runtime_id: "rt1", workspace_id: "ws1" }]);
  });

  it("never puts the daemon flag in user_metadata, which is user-editable", async () => {
    await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });

    const attrs = db.auth.admin.createUser.mock.calls[0][0];
    expect(attrs.app_metadata).toMatchObject({ sparstrow_daemon: true });
    expect(attrs.user_metadata).toBeUndefined();
  });

  it("confirms the email at creation, since nothing can ever deliver a confirmation", async () => {
    await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    expect(db.auth.admin.createUser.mock.calls[0][0].email_confirm).toBe(true);
  });

  it("reuses an existing identity rather than creating a second", async () => {
    await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });

    expect(db.auth.admin.createUser).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
    // Both mints still produced a credential — reuse is not a partial path.
    expect(db.auth.verifyOtp).toHaveBeenCalledTimes(2);
  });

  it("recovers when a concurrent first request wins the insert race", async () => {
    // The unique constraint on runtime_id is what makes this safe: the loser's
    // insert fails, it re-reads, and both callers proceed on one identity.
    insertError = { message: "duplicate key value violates unique constraint" };
    db.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            // Absent on the first read, present by the time we re-read.
            data: inserted.length === 0 ? null : { user_id: "winner-uuid" },
            error: null,
          }),
        }),
      }),
      insert: async (payload: Record<string, unknown>) => {
        inserted.push(payload);
        return { error: insertError };
      },
    }));

    const credential = await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });
    expect(credential.token).toBe("supabase-signed-jwt");
  });

  it("mints through generateLink then verifyOtp, storing no reusable secret", async () => {
    await mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" });

    expect(db.auth.admin.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "daemon+rt1@runtime.sparstrow.invalid",
    });
    expect(db.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hashed-1",
      type: "magiclink",
    });
    // Nothing password-shaped is ever written to the mapping row.
    expect(inserted[0]).not.toHaveProperty("password");
  });

  it("throws rather than returning a credential when generateLink fails", async () => {
    db.auth.admin.generateLink.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" })).rejects.toThrow();
  });

  it("throws rather than returning a credential when verifyOtp fails", async () => {
    db.auth.verifyOtp.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" })).rejects.toThrow();
  });

  it("throws when the session carries no expires_at, rather than shipping a credential with no refresh timer", async () => {
    db.auth.verifyOtp.mockResolvedValue({
      data: { session: { access_token: "t", expires_at: undefined } },
      error: null,
    });
    await expect(mintRealtimeToken({ workspaceId: "ws1", runtimeId: "rt1" })).rejects.toThrow(
      "no expires_at",
    );
  });
});
