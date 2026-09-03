import { beforeEach, expect, test, vi } from "vitest";
import { getActiveWorkspaceId } from "./workspace-scope";
import { SupabaseClient } from "@supabase/supabase-js";

// Bootstrap is a single Postgres RPC (see policies/004_bootstrap_rpc.sql), not
// three client-side inserts, so the mock exposes `rpc` rather than per-table
// insert builders. The three-insert version could not be made atomic from the
// client and is what orphaned workspaces / duplicated them under a race.
function createMockSupabase(
  user: any,
  members: any[],
  overrides: { rpcResult?: any; rpcError?: any } = {}
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    rpc: vi.fn().mockResolvedValue({
      // `in` rather than `??` so an explicitly-null rpcResult stays null
      // instead of falling through to the default.
      data: overrides.rpcError
        ? null
        : "rpcResult" in overrides
          ? overrides.rpcResult
          : "new-ws-id",
      error: overrides.rpcError ?? null,
    }),
    from: vi.fn().mockImplementation((table) => {
      if (table === "workspace_members") {
        return {
          // select(...).eq("user_id", id) -- the eq is recorded on `eqCalls`
          // so a test can assert the caller actually scopes to itself.
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              eqCalls.push([col, val]);
              return Promise.resolve({ data: members, error: null });
            }),
          }),
        };
      }
      return {};
    }),
  } as unknown as SupabaseClient;
}

// Populated by the mock above; asserted by the co-member regression test.
let eqCalls: [string, any][] = [];
beforeEach(() => {
  eqCalls = [];
});

test("returns 401 if not authenticated", async () => {
  const supabase = createMockSupabase(null, []);
  const res = await getActiveWorkspaceId(supabase);
  expect(res).toEqual({ error: "Unauthorized", status: 401 });
});

test("returns workspace id if user has 1 membership", async () => {
  const supabase = createMockSupabase({ id: "1" }, [{ workspace_id: "ws-1" }]);
  const res = await getActiveWorkspaceId(supabase);
  expect(res.workspaceId).toBe("ws-1");
  expect(res.error).toBeUndefined();
});

test("returns requested workspace if valid for >1 memberships", async () => {
  const supabase = createMockSupabase({ id: "1" }, [
    { workspace_id: "ws-1" },
    { workspace_id: "ws-2" },
  ]);
  const searchParams = new URLSearchParams("workspaceId=ws-2");
  const res = await getActiveWorkspaceId(supabase, searchParams);
  expect(res.workspaceId).toBe("ws-2");
  expect(res.error).toBeUndefined();
});

// Was a hard 400 that locked the account out of every page, because nothing in
// the interface could choose between two workspaces. There is a switcher now,
// so an unspecified request lands on the first membership rather than erroring
// — and still reports the full list, which is what the switcher renders.
test("falls back to the first membership when >1 and nothing was requested", async () => {
  const workspaces = [
    { workspace_id: "ws-1", workspaces: { id: "ws-1", name: "w1" } },
    { workspace_id: "ws-2", workspaces: { id: "ws-2", name: "w2" } },
  ];
  const supabase = createMockSupabase({ id: "1" }, workspaces);
  const res = await getActiveWorkspaceId(supabase);
  expect(res.error).toBeUndefined();
  expect(res.workspaceId).toBe("ws-1");
  expect(res.workspaces).toHaveLength(2);
});

test("ignores a requested workspace the caller is not a member of", async () => {
  const workspaces = [
    { workspace_id: "ws-1", workspaces: { id: "ws-1", name: "w1" } },
    { workspace_id: "ws-2", workspaces: { id: "ws-2", name: "w2" } },
  ];
  const supabase = createMockSupabase({ id: "1" }, workspaces);
  const res = await getActiveWorkspaceId(supabase, new URLSearchParams("workspaceId=ws-999"));
  expect(res.workspaceId).toBe("ws-1");
});

test("bootstraps via RPC if 0 memberships", async () => {
  const supabase = createMockSupabase({ id: "1", email: "a@b.com" }, []);
  const res = await getActiveWorkspaceId(supabase);
  expect(supabase.rpc).toHaveBeenCalledWith("bootstrap_workspace");
  expect(res.workspaceId).toBe("new-ws-id");
});

test("does not call the bootstrap RPC when a membership already exists", async () => {
  const supabase = createMockSupabase({ id: "1" }, [{ workspace_id: "ws-1" }]);
  await getActiveWorkspaceId(supabase);
  expect(supabase.rpc).not.toHaveBeenCalled();
});

test("returns 500 if the bootstrap RPC fails", async () => {
  const supabase = createMockSupabase({ id: "1" }, [], {
    rpcError: { message: "boom" },
  });
  const res = await getActiveWorkspaceId(supabase);
  expect(res).toEqual({ error: "Failed to bootstrap workspace", status: 500 });
});

test("returns 500 if the bootstrap RPC returns no workspace id", async () => {
  const supabase = createMockSupabase({ id: "1" }, [], { rpcResult: null });
  const res = await getActiveWorkspaceId(supabase);
  expect(res).toEqual({ error: "Failed to bootstrap workspace", status: 500 });
});

// Regression: RLS lets you read your CO-MEMBERS' workspace_members rows, which
// is intended. Without an explicit user_id filter those rows counted as the
// caller's own memberships, so any workspace with two people pushed every
// member into the "Multiple workspaces found" 400 and locked them out of the
// whole API.
test("scopes the membership query to the calling user", async () => {
  const supabase = createMockSupabase({ id: "user-1" }, [
    { workspace_id: "ws-1" },
  ]);
  await getActiveWorkspaceId(supabase);
  expect(eqCalls).toContainEqual(["user_id", "user-1"]);
});
