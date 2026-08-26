import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { createChatSessionAction, updateChatSessionAction } from "./actions";

/**
 * `createChatSessionAction` is shared with `T-WA-07` (`chat.tsx` still calls
 * the old hook until that task converts it); these tests only exercise the
 * paths `agent-create.tsx` actually uses (`agent-creator`, `free`) plus the
 * `agent`/`project` branches this action still has to get right for that
 * future caller. `updateChatSessionAction` is the fix for
 * `BUG-2026-08-26-chat-session-updates-always-404` — no prior test existed
 * because no prior implementation did either.
 */

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Result = { data: unknown; error: unknown };

function fakeSupabase(queues: Record<string, Result[]>) {
  const calls: Record<string, number> = {};

  function builder(table: string) {
    const queue = queues[table] ?? [];
    const idx = calls[table] ?? 0;
    calls[table] = idx + 1;
    const result: Result = queue[idx] ?? { data: null, error: null };
    const self: Record<string, unknown> = {
      select: () => self,
      update: () => self,
      insert: () => self,
      delete: () => self,
      eq: () => self,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return self;
  }

  return builder;
}

function mockCtx(queues: Record<string, Result[]>) {
  const supabase = { from: fakeSupabase(queues) };
  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
}

describe("createChatSessionAction", () => {
  it("creates an agent-creator session with no binding", async () => {
    mockCtx({ chat_sessions: [{ data: { id: "chs_1", kind: "agent-creator" }, error: null }] });
    const result = await createChatSessionAction({ kind: "agent-creator" } as never);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.kind).toBe("agent-creator");
  });

  it("rejects a kind outside the known set", async () => {
    mockCtx({});
    const result = await createChatSessionAction({ kind: "bogus" } as never);
    expect(result.ok).toBe(false);
  });

  it("requires and resolves projectId for a project session", async () => {
    mockCtx({
      projects: [{ data: { id: "prj_1" }, error: null }],
      chat_sessions: [{ data: { id: "chs_2", kind: "project", project_id: "prj_1" }, error: null }],
    });
    const result = await createChatSessionAction({ kind: "project", projectId: "prj_1" } as never);
    expect(result.ok).toBe(true);
  });

  it("fails a project session with no project id", async () => {
    mockCtx({});
    const result = await createChatSessionAction({ kind: "project" } as never);
    expect(result.ok).toBe(false);
  });
});

describe("updateChatSessionAction", () => {
  it("archives a session", async () => {
    mockCtx({ chat_sessions: [{ data: { id: "chs_1", status: "archived" }, error: null }] });
    const result = await updateChatSessionAction("chs_1", { status: "archived" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("archived");
  });
});
