import { expect, test, vi } from "vitest";
import { getActiveWorkspaceId } from "./workspace";
import { SupabaseClient } from "@supabase/supabase-js";

function createMockSupabase(user: any, members: any[], overrides: any = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockImplementation((table) => {
      if (table === "workspace_members") {
        return {
          select: vi.fn().mockResolvedValue({ data: members, error: null }),
          insert: vi.fn().mockResolvedValue({ error: overrides.wmError || null }),
          limit: vi.fn().mockReturnValue({ data: members }),
        };
      }
      if (table === "users") {
        return {
          insert: vi.fn().mockResolvedValue({ error: overrides.userError || null }),
        };
      }
      if (table === "workspaces") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "new-ws-id" }, error: overrides.wsError || null })
            })
          })
        };
      }
    })
  } as unknown as SupabaseClient;
}

test("returns 401 if not authenticated", async () => {
  const supabase = createMockSupabase(null, []);
  const res = await getActiveWorkspaceId(supabase);
  expect(res).toEqual({ error: "Unauthorized", status: 401 });
});

test("returns workspace id if user has 1 membership", async () => {
  const supabase = createMockSupabase({ id: "1" }, [{ workspace_id: "ws-1" }]);
  const res = await getActiveWorkspaceId(supabase);
  expect(res).toEqual({ workspaceId: "ws-1" });
});

test("returns requested workspace if valid for >1 memberships", async () => {
  const supabase = createMockSupabase({ id: "1" }, [
    { workspace_id: "ws-1" },
    { workspace_id: "ws-2" },
  ]);
  const searchParams = new URLSearchParams("workspaceId=ws-2");
  const res = await getActiveWorkspaceId(supabase, searchParams);
  expect(res).toEqual({ workspaceId: "ws-2" });
});

test("returns 400 if >1 memberships and invalid/missing request", async () => {
  const workspaces = [
    { workspace_id: "ws-1", workspaces: { id: "ws-1", name: "w1" } },
    { workspace_id: "ws-2", workspaces: { id: "ws-2", name: "w2" } },
  ];
  const supabase = createMockSupabase({ id: "1" }, workspaces);
  const res = await getActiveWorkspaceId(supabase);
  expect(res.status).toBe(400);
  expect(res.workspaces).toHaveLength(2);
});

test("bootstraps workspace if 0 memberships", async () => {
  const supabase = createMockSupabase({ id: "1", email: "a@b.com" }, []);
  const res = await getActiveWorkspaceId(supabase);
  expect(res).toEqual({ workspaceId: "new-ws-id" });
});
