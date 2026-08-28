import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import {
  createChatSessionAction,
  postChatTurnAction,
  retryChatTurnAction,
  updateChatSessionAction,
} from "./actions";

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

// ─── postChatTurnAction / retryChatTurnAction (T-WA-07) ────────────────────
//
// Ports the behavioural coverage `chat-routes.test.ts` had for
// `POST /chat/sessions/:id/messages` and `.../retry` before those routes were
// deleted in favour of these two actions — same fixtures, same assertions,
// so no coverage was lost in the conversion.

type Row = Record<string, unknown>;

/** A minimal but real filter/order/limit table, thenable so an un-terminated
 *  query (`turnStateRow`'s messages lookup) resolves the same way the real
 *  supabase-js query builder does. */
function fakeTable(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  let orderSpec: { col: string; ascending: boolean } | null = null;
  let limitN: number | null = null;

  function apply(): Row[] {
    let result = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    if (orderSpec) {
      const { col, ascending } = orderSpec;
      result = [...result].sort((a, b) => {
        const av = a[col] as string;
        const bv = b[col] as string;
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (limitN != null) result = result.slice(0, limitN);
    return result;
  }

  const builder: any = {
    select: () => builder,
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    order(col: string, o: { ascending: boolean }) {
      orderSpec = { col, ascending: o.ascending };
      return builder;
    },
    limit(n: number) {
      limitN = n;
      return builder;
    },
    async maybeSingle() {
      return { data: apply()[0] ?? null, error: null };
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      resolve({ data: apply(), error: null });
    },
  };
  return builder;
}

function mockChatTurnCtx(opts: {
  sessions?: Row[];
  turns?: Row[];
  messages?: Row[];
  rpc?: Record<string, { data?: Row | null; error?: { code?: string; message: string } | null }>;
  /** T-CS5-02 -- set to make the attachments insert itself fail, to prove a
   *  failed attachment insert does not fail an already-sent message. */
  attachmentInsertError?: { message: string } | null;
}) {
  const rpcCalls: Array<{ name: string; params: unknown }> = [];
  const attachmentInserts: Row[] = [];
  const supabase = {
    from(table: string) {
      if (table === "chat_sessions") return fakeTable(opts.sessions ?? []);
      if (table === "chat_turns") return fakeTable(opts.turns ?? []);
      if (table === "chat_messages") return fakeTable(opts.messages ?? []);
      if (table === "chat_message_attachments") {
        return {
          insert(rows: Row[]) {
            attachmentInserts.push(...rows);
            return Promise.resolve({
              data: null,
              error: opts.attachmentInsertError ?? null,
            });
          },
        };
      }
      throw new Error(`mockChatTurnCtx: unexpected table ${table}`);
    },
    async rpc(name: string, params: unknown) {
      rpcCalls.push({ name, params });
      const cfg = opts.rpc?.[name];
      if (!cfg) throw new Error(`mockChatTurnCtx: unexpected rpc ${name}`);
      if (cfg.error) return { data: null, error: cfg.error };
      return { data: cfg.data ?? null, error: null };
    },
  };
  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
  return { rpcCalls, attachmentInserts };
}

const FREE_SESSION: Row = { id: "chs_1", workspace_id: "ws_1", kind: "free" };
const CREATOR_SESSION: Row = { id: "chs_2", workspace_id: "ws_1", kind: "agent-creator" };

const WAITING_TURN: Row = {
  id: "ct_1",
  workspace_id: "ws_1",
  session_id: "chs_1",
  status: "waiting",
  waiting_reason: "no_runtime_paired",
  provider: null,
  model: null,
  attempt: 1,
  retry_of_turn_id: null,
  reply_text: "",
  reply_seq: 0,
  error: null,
  created_at: "2026-08-23T00:00:00Z",
};

const USER_MSG: Row = {
  id: "msg_1",
  workspace_id: "ws_1",
  session_id: "chs_1",
  turn_id: "ct_1",
  role: "user",
  content: "what does this repo do?",
  meta: null,
  created_at: "2026-08-23T00:00:00Z",
};

describe("postChatTurnAction", () => {
  it("enqueues via enqueue_chat_turn and returns a ChatTurnState with the user message attached", async () => {
    const { rpcCalls } = mockChatTurnCtx({
      sessions: [FREE_SESSION],
      messages: [USER_MSG],
      rpc: { enqueue_chat_turn: { data: WAITING_TURN } },
    });
    const result = await postChatTurnAction("chs_1", { content: "what does this repo do?" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("waiting");
      expect(result.data.waitingReason).toBe("no_runtime_paired");
      expect(result.data.userMessage.content).toBe("what does this repo do?");
      expect(result.data.assistantMessage).toBeNull();
    }
    expect(rpcCalls[0]).toMatchObject({
      name: "enqueue_chat_turn",
      params: { p_session_id: "chs_1", p_content: "what does this repo do?" },
    });
  });

  it("fails a session that does not exist", async () => {
    mockChatTurnCtx({ sessions: [] });
    const result = await postChatTurnAction("chs_missing", { content: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not exist/);
  });

  it("refuses an agent-creator session without calling enqueue_chat_turn", async () => {
    const { rpcCalls } = mockChatTurnCtx({ sessions: [CREATOR_SESSION] });
    const result = await postChatTurnAction("chs_2", { content: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Agent Creator/);
      expect(result.error).toMatch(/local daemon/);
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("fails empty content", async () => {
    mockChatTurnCtx({ sessions: [FREE_SESSION] });
    const result = await postChatTurnAction("chs_1", { content: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/content is required/);
  });

  it("fails content over the byte ceiling (DD-8's one clamp)", async () => {
    mockChatTurnCtx({ sessions: [FREE_SESSION] });
    const result = await postChatTurnAction("chs_1", { content: "a".repeat(64_001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/must not exceed/);
  });

  it("maps SPG16 (turn already in flight) to field=turn_in_progress, not a throw", async () => {
    // FR-004: a second send must refuse legibly. If chatTurnFailureFrom
    // weren't wired, this would fall through to actionErrorFrom's generic
    // branch instead of naming the reason.
    mockChatTurnCtx({
      sessions: [FREE_SESSION],
      rpc: {
        enqueue_chat_turn: {
          error: { code: "SPG16", message: "This session already has a reply in progress." },
        },
      },
    });
    const result = await postChatTurnAction("chs_1", { content: "another message" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("This session already has a reply in progress.");
      expect(result.field).toBe("turn_in_progress");
    }
  });

  // T-CS5-02
  it("attaches uploaded files to the real user message enqueue_chat_turn just created", async () => {
    const { attachmentInserts } = mockChatTurnCtx({
      sessions: [FREE_SESSION],
      messages: [USER_MSG],
      rpc: { enqueue_chat_turn: { data: WAITING_TURN } },
    });
    const result = await postChatTurnAction("chs_1", {
      content: "see attached",
      attachments: [
        { storagePath: "ws_1/chs_1/a.txt", filename: "notes.txt", mimeType: "text/plain", sizeBytes: 42 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(attachmentInserts).toHaveLength(1);
    expect(attachmentInserts[0]).toMatchObject({
      workspace_id: "ws_1",
      message_id: USER_MSG.id, // the REAL message id, not a placeholder invented before enqueue_chat_turn ran
      storage_path: "ws_1/chs_1/a.txt",
      filename: "notes.txt",
      mime_type: "text/plain",
      size_bytes: 42,
    });
  });

  it("does not touch chat_message_attachments when no attachments were sent", async () => {
    const { attachmentInserts } = mockChatTurnCtx({
      sessions: [FREE_SESSION],
      messages: [USER_MSG],
      rpc: { enqueue_chat_turn: { data: WAITING_TURN } },
    });
    await postChatTurnAction("chs_1", { content: "no attachments here" });
    expect(attachmentInserts).toHaveLength(0);
  });

  it("still reports the send as successful when the attachment insert itself fails", async () => {
    // The message and its turn are already real by this point (enqueue_chat_turn
    // already succeeded) -- a failed attachment insert is a secondary-effect
    // failure, not a reason to tell the owner their message wasn't sent.
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockChatTurnCtx({
      sessions: [FREE_SESSION],
      messages: [USER_MSG],
      rpc: { enqueue_chat_turn: { data: WAITING_TURN } },
      attachmentInsertError: { message: "boom" },
    });
    const result = await postChatTurnAction("chs_1", {
      content: "see attached",
      attachments: [
        { storagePath: "ws_1/chs_1/a.txt", filename: "notes.txt", mimeType: "text/plain", sizeBytes: 42 },
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe("retryChatTurnAction", () => {
  it("resolves the session's latest turn and passes ITS id to retry_chat_turn", async () => {
    const olderTurn = {
      ...WAITING_TURN,
      id: "ct_0",
      status: "failed",
      created_at: "2026-08-22T00:00:00Z",
    };
    const { rpcCalls } = mockChatTurnCtx({
      sessions: [FREE_SESSION],
      turns: [olderTurn, WAITING_TURN],
      messages: [USER_MSG],
      rpc: {
        retry_chat_turn: {
          data: { ...WAITING_TURN, id: "ct_2", attempt: 2, retry_of_turn_id: "ct_1" },
        },
      },
    });
    const result = await retryChatTurnAction("chs_1", { provider: "claude-code", model: "opus" });
    expect(result.ok).toBe(true);
    // NOT the session id ("chs_1") -- retry_chat_turn takes a turn id, and
    // the latest turn by created_at is ct_1, not the older ct_0.
    expect(rpcCalls[0]).toMatchObject({
      name: "retry_chat_turn",
      params: { p_turn_id: "ct_1", p_provider: "claude-code", p_model: "opus" },
    });
  });

  it("fails a session with no turn to retry", async () => {
    mockChatTurnCtx({ sessions: [FREE_SESSION], turns: [] });
    const result = await retryChatTurnAction("chs_1", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no turn to retry/);
  });

  it("refuses an agent-creator session", async () => {
    mockChatTurnCtx({ sessions: [CREATOR_SESSION] });
    const result = await retryChatTurnAction("chs_2", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Agent Creator/);
  });

  it("maps SPG19 (not retryable yet) to field=turn_not_retryable", async () => {
    mockChatTurnCtx({
      sessions: [FREE_SESSION],
      turns: [WAITING_TURN],
      rpc: {
        retry_chat_turn: {
          error: { code: "SPG19", message: "This turn cannot be retried yet." },
        },
      },
    });
    const result = await retryChatTurnAction("chs_1", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("turn_not_retryable");
  });
});
