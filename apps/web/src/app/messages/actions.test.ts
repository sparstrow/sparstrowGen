import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { markMessageReadAction, sendMessageAction } from "./actions";

/**
 * Moved verbatim from `POST /messages` and `POST /messages/:id/mark-read`
 * (`T-WA-07`) — same validation, same defaults, now returning an
 * `ActionResult` instead of throwing on a missing `body`.
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
      eq: () => self,
      single: () => Promise.resolve(result),
    };
    return self;
  }

  return builder;
}

function mockCtx(queues: Record<string, Result[]>) {
  const supabase = { from: fakeSupabase(queues) };
  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
}

describe("sendMessageAction", () => {
  it("fails an empty body before inserting", async () => {
    mockCtx({});
    const result = await sendMessageAction({ body: "" } as never);
    expect(result.ok).toBe(false);
  });

  it("defaults fromType, subject and status the same way the route did", async () => {
    mockCtx({
      messages: [
        {
          data: { id: "msg_1", from_type: "user", subject: "", body: "hi", status: "unread" },
          error: null,
        },
      ],
    });
    const result = await sendMessageAction({ toAgentId: "agt_1", body: "hi" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fromType).toBe("user");
      expect(result.data.status).toBe("unread");
    }
  });
});

describe("markMessageReadAction", () => {
  it("marks a message read", async () => {
    mockCtx({ messages: [{ data: { id: "msg_1", status: "read" }, error: null }] });
    const result = await markMessageReadAction("msg_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("read");
  });
});
