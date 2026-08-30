import { describe, expect, it } from "vitest";
import { sessionAttachments } from "./chat-attachments";

// T-AM3-01 (US2). Coverage for `sessionAttachments()` only — this repo has no
// React Testing Library (per `AGENTS.md` §3.11 / the task's own note), so
// `ConversationItems`'s grouping/label rendering is verified live instead;
// see the task's Result section for what that covered.

type Row = Record<string, unknown>;

/** A minimal filter/order/`in` table, thenable so an un-terminated query
 *  resolves the same way the real supabase-js query builder does — same
 *  shape `actions.test.ts`'s `fakeTable` uses for the sibling reads in this
 *  file's own `attachmentsByMessageId`. */
function fakeTable(rows: Row[]) {
  const filters: Array<(r: Row) => boolean> = [];
  let orderSpec: { col: string; ascending: boolean } | null = null;

  function apply(): Row[] {
    let result = rows.filter((r) => filters.every((f) => f(r)));
    if (orderSpec) {
      const { col, ascending } = orderSpec;
      result = [...result].sort((a, b) => {
        const av = a[col] as string;
        const bv = b[col] as string;
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    return result;
  }

  const builder: any = {
    select: () => builder,
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]));
      return builder;
    },
    order(col: string, o: { ascending: boolean }) {
      orderSpec = { col, ascending: o.ascending };
      return builder;
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      resolve({ data: apply(), error: null });
    },
  };
  return builder;
}

function fakeSupabase(opts: { messages?: Row[]; attachments?: Row[] }) {
  return {
    from(table: string) {
      if (table === "chat_messages") return fakeTable(opts.messages ?? []);
      if (table === "chat_message_attachments") return fakeTable(opts.attachments ?? []);
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
  } as never;
}

const SESSION_ID = "chs_1";

const USER_MSG_1: Row = {
  id: "msg_1",
  session_id: SESSION_ID,
  role: "user",
  content: "build me a chart of last quarter's sales",
  created_at: "2026-08-20T10:00:00Z",
};
const ASSISTANT_MSG_1: Row = {
  id: "msg_2",
  session_id: SESSION_ID,
  role: "assistant",
  content: "Here's the chart.",
  created_at: "2026-08-20T10:01:00Z",
};
const USER_MSG_2: Row = {
  id: "msg_3",
  session_id: SESSION_ID,
  role: "user",
  content: "now add a trend line",
  created_at: "2026-08-21T09:00:00Z",
};
const ASSISTANT_MSG_2: Row = {
  id: "msg_4",
  session_id: SESSION_ID,
  role: "assistant",
  content: "Added.",
  created_at: "2026-08-21T09:01:00Z",
};

describe("sessionAttachments", () => {
  it("returns [] when the session has no messages", async () => {
    const supabase = fakeSupabase({ messages: [], attachments: [] });
    const rows = await sessionAttachments(supabase, SESSION_ID);
    expect(rows).toEqual([]);
  });

  it("returns [] when the session's messages carry no attachments", async () => {
    const supabase = fakeSupabase({ messages: [USER_MSG_1, ASSISTANT_MSG_1], attachments: [] });
    const rows = await sessionAttachments(supabase, SESSION_ID);
    expect(rows).toEqual([]);
  });

  it("orders newest message/group first, newest attachment within a group first", async () => {
    const supabase = fakeSupabase({
      messages: [USER_MSG_1, ASSISTANT_MSG_1, USER_MSG_2, ASSISTANT_MSG_2],
      attachments: [
        {
          id: "cma_1",
          message_id: "msg_2",
          storage_path: "ws/chs_1/chart-v1.png",
          filename: "chart-v1.png",
          mime_type: "image/png",
          size_bytes: 100,
          created_at: "2026-08-20T10:01:00Z",
        },
        {
          id: "cma_2",
          message_id: "msg_4",
          storage_path: "ws/chs_1/chart-v2.png",
          filename: "chart-v2.png",
          mime_type: "image/png",
          size_bytes: 200,
          created_at: "2026-08-21T09:01:00Z",
        },
        // A second file bound to the SAME (newest) assistant message,
        // created a moment after the first one there.
        {
          id: "cma_3",
          message_id: "msg_4",
          storage_path: "ws/chs_1/chart-v2-notes.txt",
          filename: "chart-v2-notes.txt",
          mime_type: "text/plain",
          size_bytes: 20,
          created_at: "2026-08-21T09:01:05Z",
        },
      ],
    });

    const rows = await sessionAttachments(supabase, SESSION_ID);
    expect(rows.map((r) => r.id)).toEqual(["cma_3", "cma_2", "cma_1"]);
  });

  it("carries the immediately preceding user message's content", async () => {
    const supabase = fakeSupabase({
      messages: [USER_MSG_1, ASSISTANT_MSG_1, USER_MSG_2, ASSISTANT_MSG_2],
      attachments: [
        {
          id: "cma_1",
          message_id: "msg_2",
          storage_path: "ws/chs_1/chart-v1.png",
          filename: "chart-v1.png",
          mime_type: "image/png",
          size_bytes: 100,
          created_at: "2026-08-20T10:01:00Z",
        },
        {
          id: "cma_2",
          message_id: "msg_4",
          storage_path: "ws/chs_1/chart-v2.png",
          filename: "chart-v2.png",
          mime_type: "image/png",
          size_bytes: 200,
          created_at: "2026-08-21T09:01:00Z",
        },
      ],
    });

    const rows = await sessionAttachments(supabase, SESSION_ID);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("cma_1")?.precedingUserContent).toBe("build me a chart of last quarter's sales");
    expect(byId.get("cma_2")?.precedingUserContent).toBe("now add a trend line");
  });

  // Phase trap 2 / AM1's FR-013 path: a session whose first message is an
  // assistant one (no preceding user message at all).
  it("returns null precedingUserContent for an assistant message with nothing before it", async () => {
    const FILES_ONLY_REPLY: Row = {
      id: "msg_0",
      session_id: SESSION_ID,
      role: "assistant",
      content: "",
      created_at: "2026-08-19T00:00:00Z",
    };
    const supabase = fakeSupabase({
      messages: [FILES_ONLY_REPLY],
      attachments: [
        {
          id: "cma_0",
          message_id: "msg_0",
          storage_path: "ws/chs_1/report.pdf",
          filename: "report.pdf",
          mime_type: "application/pdf",
          size_bytes: 500,
          created_at: "2026-08-19T00:00:01Z",
        },
      ],
    });

    const rows = await sessionAttachments(supabase, SESSION_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.precedingUserContent).toBeNull();
  });

  // Trap: the query deliberately returns BOTH roles (AM4 needs no new query)
  // — `ConversationItems` is what filters to `role: "assistant"`, not this
  // function. This proves the row survives with its role labeled correctly
  // rather than silently dropped here.
  it("returns a role: user row (an owner's own attachment) with messageRole tagged, not filtered out", async () => {
    const supabase = fakeSupabase({
      messages: [USER_MSG_1],
      attachments: [
        {
          id: "cma_user",
          message_id: "msg_1",
          storage_path: "ws/chs_1/spec.pdf",
          filename: "spec.pdf",
          mime_type: "application/pdf",
          size_bytes: 300,
          created_at: "2026-08-20T09:59:00Z",
        },
      ],
    });

    const rows = await sessionAttachments(supabase, SESSION_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.messageRole).toBe("user");
  });
});
