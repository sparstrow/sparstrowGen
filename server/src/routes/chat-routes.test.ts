import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";
import "./handlers";

/**
 * `POST /chat/sessions`, `.../messages` and `.../retry` used to be tested
 * here (`BUG-2026-08-22-chat-new-session-404s`, M13). `T-WA-07` moved all
 * three writes to `app/chat/actions.ts` (`createChatSessionAction`,
 * `postChatTurnAction`, `retryChatTurnAction`) and deleted the routes —
 * their behavioural coverage moved with them to `app/chat/actions.test.ts`,
 * same fixtures and assertions, so nothing was lost. Only the two GET routes
 * (reads stay out of scope for the whole WA phase, plan DD-5) are route-level
 * tests here.
 */

type Row = Record<string, unknown>;

/** A minimal but real filter/order/limit table, thenable so an un-terminated
 *  query (`turnStateRow`'s messages lookup) resolves the same way the real
 *  supabase-js query builder does. */
function fakeTable(rows: Row[]) {
  const filters: Array<(r: Row) => boolean> = [];
  let orderSpec: { col: string; ascending: boolean } | null = null;
  let limitN: number | null = null;

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
    if (limitN != null) result = result.slice(0, limitN);
    return result;
  }

  const builder: any = {
    select: () => builder,
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return builder;
    },
    // T-CS6-01 -- `attachmentsByMessageId` batches its lookup with `.in()`.
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]));
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
    async single() {
      const row = apply()[0];
      return row ? { data: row, error: null } : { data: null, error: { code: "PGRST116" } };
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      resolve({ data: apply(), error: null });
    },
  };
  return builder;
}

function fakeChatSupabase(opts: {
  sessions?: Row[];
  turns?: Row[];
  messages?: Row[];
  attachments?: Row[];
}) {
  const supabase = {
    from(table: string) {
      if (table === "chat_sessions") return fakeTable(opts.sessions ?? []);
      if (table === "chat_turns") return fakeTable(opts.turns ?? []);
      if (table === "chat_messages") return fakeTable(opts.messages ?? []);
      if (table === "chat_message_attachments") return fakeTable(opts.attachments ?? []);
      throw new Error(`fakeChatSupabase: unexpected table ${table}`);
    },
  };
  return { supabase: supabase as never };
}

const FREE_SESSION: Row = { id: "chs_1", workspace_id: "ws_1", kind: "free" };

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

async function callRoute(
  method: "GET",
  path: string,
  opts: Parameters<typeof fakeChatSupabase>[0],
) {
  const matched = matchRoute(method, path);
  if (!matched) throw new Error(`${method} ${path} is not registered`);
  const { supabase } = fakeChatSupabase(opts);
  const res = await matched.route.handler({
    supabase,
    workspaceId: "ws_1",
    params: matched.params,
    searchParams: new URLSearchParams(),
    body: {},
  });
  return { status: res.status, json: (await res.json()) as any };
}

describe("dispatch", () => {
  it("no longer serves the writes T-WA-07 moved to Server Actions", () => {
    expect(matchRoute("POST", "/chat/sessions")).toBeNull();
    expect(matchRoute("POST", "/chat/sessions/chs_1/messages")).toBeNull();
    expect(matchRoute("POST", "/chat/sessions/chs_1/retry")).toBeNull();
  });

  it("still serves the GET routes", () => {
    expect(matchRoute("GET", "/chat/sessions")).not.toBeNull();
    expect(matchRoute("GET", "/chat/sessions/chs_1")).not.toBeNull();
  });
});

describe("GET /chat/sessions/:id", () => {
  it("nests the session under `session`, matching ChatSessionDetail -- not spread onto the top level", async () => {
    // Regression pin: the handler used to return `{...session, messages}`
    // (session's own columns spread flat), while ChatSessionDetail --
    // and every consumer, chat.tsx/agent-create.tsx alike -- reads
    // `detail.data.session.id`. Undetected by any prior test because
    // nothing here asserted on `json.session` at all; only caught by
    // actually walking a real cloud session through the browser (T-M13-05).
    const { json } = await callRoute("GET", "/chat/sessions/chs_1", {
      sessions: [{ ...FREE_SESSION, status: "active", draft: null, provider: "claude-code", model: "sonnet" }],
      turns: [],
      messages: [],
    });
    expect(json.session).toMatchObject({ id: "chs_1", kind: "free", status: "active" });
    expect(json.id).toBeUndefined();
    expect(json.kind).toBeUndefined();
  });

  it("activeTurn is null when the session has never had a turn", async () => {
    const { json } = await callRoute("GET", "/chat/sessions/chs_1", {
      sessions: [{ ...FREE_SESSION, status: "active", draft: null, provider: "claude-code", model: "sonnet" }],
      turns: [],
      messages: [],
    });
    expect(json.activeTurn).toBeNull();
  });

  it("carries the most recent turn, with its messages attached", async () => {
    const { json } = await callRoute("GET", "/chat/sessions/chs_1", {
      sessions: [{ ...FREE_SESSION, status: "active", draft: null, provider: "claude-code", model: "sonnet" }],
      turns: [WAITING_TURN],
      messages: [USER_MSG],
    });
    expect(json.activeTurn.status).toBe("waiting");
    expect(json.activeTurn.userMessage.content).toBe(USER_MSG.content);
  });

  // T-CS6-01 (US4 scenario 2) -- a sent message's attachment persists on
  // reload because it's read from `chat_message_attachments`, not local
  // React state. Both the flat `messages` list AND the active turn's own
  // `userMessage` need it embedded, since chat.tsx reads from either
  // depending on whether a page load or a live send/retry produced it.
  it("embeds each message's attachments, in both the flat list and the active turn's userMessage", async () => {
    const attachmentRow = {
      id: "cma_1",
      workspace_id: "ws_1",
      message_id: USER_MSG.id,
      storage_path: "ws_1/chs_1/a.txt",
      filename: "notes.txt",
      mime_type: "text/plain",
      size_bytes: 42,
    };
    const { json } = await callRoute("GET", "/chat/sessions/chs_1", {
      sessions: [{ ...FREE_SESSION, status: "active", draft: null, provider: "claude-code", model: "sonnet" }],
      turns: [WAITING_TURN],
      messages: [USER_MSG],
      attachments: [attachmentRow],
    });
    expect(json.messages[0].attachments).toEqual([
      { id: "cma_1", storagePath: "ws_1/chs_1/a.txt", filename: "notes.txt", mimeType: "text/plain", sizeBytes: 42 },
    ]);
    expect(json.activeTurn.userMessage.attachments).toEqual(json.messages[0].attachments);
  });

  it("a message with no attachment gets an empty array, not a missing field", async () => {
    const { json } = await callRoute("GET", "/chat/sessions/chs_1", {
      sessions: [{ ...FREE_SESSION, status: "active", draft: null, provider: "claude-code", model: "sonnet" }],
      turns: [],
      messages: [USER_MSG],
      attachments: [],
    });
    expect(json.messages[0].attachments).toEqual([]);
  });
});
