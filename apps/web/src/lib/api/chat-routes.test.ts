import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";
import "./handlers";

/**
 * BUG-2026-08-22-chat-new-session-404s.
 *
 * `POST /chat/sessions` had no route at all — real or stub — so the
 * empty-chat composer's first message hit the shared catch-all 404 instead
 * of a handled error. This pins the fix: the route exists, sits ahead of the
 * GET routes it was missing beside, and the two adjacent M5 stubs
 * (`.../messages`, `.../retry`) are untouched.
 */

type Row = Record<string, unknown>;

function fakeSupabase(opts: {
  projects?: Row[];
  agents?: Row[];
  insertError?: { code?: string; message: string } | null;
}) {
  const inserted: Row[] = [];
  const projects = opts.projects ?? [];
  const agents = opts.agents ?? [];

  function readChain(rows: Row[]) {
    const filters: Record<string, unknown> = {};
    const self = {
      select: () => self,
      eq(col: string, val: unknown) {
        filters[col] = val;
        return self;
      },
      async maybeSingle() {
        const match = rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        return { data: match ?? null, error: null };
      },
    };
    return self;
  }

  function insertChain() {
    let row: Row | null = null;
    const self = {
      insert(payload: Row) {
        row = payload;
        inserted.push(payload);
        return self;
      },
      select: () => self,
      async single() {
        if (opts.insertError) return { data: null, error: opts.insertError };
        return { data: { ...row }, error: null };
      },
    };
    return self;
  }

  const supabase = {
    from(table: string) {
      if (table === "projects") return readChain(projects);
      if (table === "agents") return readChain(agents);
      if (table === "chat_sessions") return insertChain();
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
  };

  return { supabase: supabase as never, inserted };
}

async function post(body: unknown, opts: Parameters<typeof fakeSupabase>[0] = {}) {
  const matched = matchRoute("POST", "/chat/sessions");
  if (!matched) throw new Error("POST /chat/sessions is not registered");
  const { supabase, inserted } = fakeSupabase(opts);
  const res = await matched.route.handler({
    supabase,
    workspaceId: "ws_1",
    params: {},
    searchParams: new URLSearchParams(),
    body,
  });
  return { status: res.status, json: await res.json(), inserted };
}

describe("dispatch", () => {
  it("registers POST /chat/sessions", () => {
    expect(matchRoute("POST", "/chat/sessions")).not.toBeNull();
  });

  it("is a real handler, not the /chat/sessions/:id/messages stub", () => {
    expect(matchRoute("POST", "/chat/sessions")?.route.pattern).toBe("/chat/sessions");
  });

  it("wires the two chat-turn routes to real handlers, not the stub (M13)", () => {
    // Used to say "Arriving in M5" -- fixed in
    // BUG-2026-08-23-chat-stub-stale-m5-promise once M5 shipped
    // (2026-08-11/12) without ever including chat turn-sending, then scoped
    // as its own feature (doc/specs/2026-08-23-chat-message-sending.md) and
    // built in M13. Team manager chat is the one adjacent stub still legible.
    expect(matchRoute("POST", "/chat/sessions/chs_1/messages")).not.toBeNull();
    expect(matchRoute("POST", "/chat/sessions/chs_1/retry")).not.toBeNull();

    const managerChat = matchRoute("POST", "/teams/team_1/manager/chat");
    expect(managerChat).not.toBeNull();
    expect(managerChat!.route.pattern).toBe("/teams/:id/manager/chat");
  });

  it("still serves the GET routes it was missing beside", () => {
    expect(matchRoute("GET", "/chat/sessions")).not.toBeNull();
    expect(matchRoute("GET", "/chat/sessions/chs_1")).not.toBeNull();
  });
});

describe("POST /chat/sessions — free chat", () => {
  it("creates a session with default provider/model", async () => {
    const { status, json, inserted } = await post({ kind: "free" });
    expect(status).toBe(200);
    expect(json.kind).toBe("free");
    expect(json.provider).toBe("claude-code");
    expect(json.model).toBe("sonnet");
    expect(json.status).toBe("active");
    expect(inserted[0]).toMatchObject({ workspace_id: "ws_1", kind: "free" });
    expect(typeof inserted[0]!.id).toBe("string");
  });

  it("rejects a non-CLI provider (the daemon's assertCliProvider rule, mirrored)", async () => {
    const { status, json } = await post({ kind: "free", provider: "ollama" });
    expect(status).toBe(400);
    expect(json.error).toMatch(/CLI providers only/);
  });

  it("400s an unknown kind", async () => {
    const { status, json } = await post({ kind: "bogus" });
    expect(status).toBe(400);
    expect(json.error).toContain("kind must be one of");
  });
});

describe("POST /chat/sessions — project chat", () => {
  it("requires projectId", async () => {
    const { status, json } = await post({ kind: "project" });
    expect(status).toBe(400);
    expect(json.error).toMatch(/projectId is required/);
  });

  it("404s a project outside the workspace (RLS-shaped: not found, not forbidden)", async () => {
    const { status, json } = await post(
      { kind: "project", project_id: "prj_other" },
      { projects: [] },
    );
    expect(status).toBe(404);
    expect(json.error).toContain("prj_other");
  });

  it("binds the project and defaults provider/model", async () => {
    const { status, json, inserted } = await post(
      { kind: "project", project_id: "prj_1" },
      { projects: [{ id: "prj_1", workspace_id: "ws_1" }] },
    );
    expect(status).toBe(200);
    expect(json.projectId).toBe("prj_1");
    expect(json.provider).toBe("claude-code");
    expect(inserted[0]).toMatchObject({ project_id: "prj_1" });
  });
});

describe("POST /chat/sessions — agent chat", () => {
  it("requires agentId", async () => {
    const { status, json } = await post({ kind: "agent" });
    expect(status).toBe(400);
    expect(json.error).toMatch(/agentId is required/);
  });

  it("404s an unknown agent", async () => {
    const { status } = await post({ kind: "agent", agent_id: "agt_missing" }, { agents: [] });
    expect(status).toBe(404);
  });

  it("mirrors the agent's own provider/model rather than trusting the client's", async () => {
    const { json, inserted } = await post(
      { kind: "agent", agent_id: "agt_1", provider: "ollama", model: "llama3" },
      {
        agents: [{ id: "agt_1", workspace_id: "ws_1", provider: "claude-code", model: "haiku" }],
      },
    );
    expect(json.agentId).toBe("agt_1");
    expect(json.provider).toBe("claude-code");
    expect(json.model).toBe("haiku");
    expect(inserted[0]).toMatchObject({ agent_id: "agt_1", provider: "claude-code", model: "haiku" });
  });

  it("rejects an agent whose own provider is not CLI-capable", async () => {
    const { status, json } = await post(
      { kind: "agent", agent_id: "agt_1" },
      { agents: [{ id: "agt_1", workspace_id: "ws_1", provider: "anthropic-api", model: "sonnet" }] },
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/CLI providers only/);
  });
});

describe("POST /chat/sessions — agent-creator", () => {
  it("starts with an empty draft object, not null", async () => {
    const { json, inserted } = await post({ kind: "agent-creator" });
    expect(json.draft).toEqual({});
    expect(inserted[0]).toMatchObject({ draft: {} });
  });
});

// ─── M13 — messages / retry / activeTurn ─────────────────────────────────

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
  rpc?: Record<string, { data?: Row | null; error?: { code?: string; message: string } | null }>;
}) {
  const rpcCalls: Array<{ name: string; params: unknown }> = [];
  const supabase = {
    from(table: string) {
      if (table === "chat_sessions") return fakeTable(opts.sessions ?? []);
      if (table === "chat_turns") return fakeTable(opts.turns ?? []);
      if (table === "chat_messages") return fakeTable(opts.messages ?? []);
      throw new Error(`fakeChatSupabase: unexpected table ${table}`);
    },
    async rpc(name: string, params: unknown) {
      rpcCalls.push({ name, params });
      const cfg = opts.rpc?.[name];
      if (!cfg) throw new Error(`fakeChatSupabase: unexpected rpc ${name}`);
      if (cfg.error) return { data: null, error: cfg.error };
      return { data: cfg.data ?? null, error: null };
    },
  };
  return { supabase: supabase as never, rpcCalls };
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

async function callRoute(
  method: "POST" | "GET",
  path: string,
  opts: Parameters<typeof fakeChatSupabase>[0],
  body: unknown = {},
) {
  const matched = matchRoute(method, path);
  if (!matched) throw new Error(`${method} ${path} is not registered`);
  const { supabase, rpcCalls } = fakeChatSupabase(opts);
  const res = await matched.route.handler({
    supabase,
    workspaceId: "ws_1",
    params: matched.params,
    searchParams: new URLSearchParams(),
    body,
  });
  return { status: res.status, json: await res.json(), rpcCalls };
}

const postMessage = (
  opts: Parameters<typeof fakeChatSupabase>[0],
  body: unknown,
  sessionId = "chs_1",
) => callRoute("POST", `/chat/sessions/${sessionId}/messages`, opts, body);
const postRetry = (
  opts: Parameters<typeof fakeChatSupabase>[0],
  body: unknown = {},
  sessionId = "chs_1",
) => callRoute("POST", `/chat/sessions/${sessionId}/retry`, opts, body);

describe("POST /chat/sessions/:id/messages", () => {
  it("enqueues via enqueue_chat_turn and returns a ChatTurnState with the user message attached", async () => {
    const { status, json, rpcCalls } = await postMessage(
      {
        sessions: [FREE_SESSION],
        messages: [USER_MSG],
        rpc: { enqueue_chat_turn: { data: WAITING_TURN } },
      },
      { content: "what does this repo do?" },
    );
    expect(status).toBe(200);
    expect(json.status).toBe("waiting");
    expect(json.waitingReason).toBe("no_runtime_paired");
    expect(json.userMessage.content).toBe("what does this repo do?");
    expect(json.assistantMessage).toBeNull();
    expect(rpcCalls[0]).toMatchObject({
      name: "enqueue_chat_turn",
      params: { p_session_id: "chs_1", p_content: "what does this repo do?" },
    });
  });

  it("404s a session that does not exist", async () => {
    const { status, json } = await postMessage({ sessions: [] }, { content: "hi" });
    expect(status).toBe(404);
    expect(json.error).toMatch(/does not exist/);
  });

  it("refuses an agent-creator session without calling enqueue_chat_turn", async () => {
    const { status, json, rpcCalls } = await postMessage(
      { sessions: [CREATOR_SESSION] },
      { content: "hi" },
      "chs_2",
    );
    expect(status).toBe(501);
    expect(json.error).toMatch(/Agent Creator/);
    expect(json.error).toMatch(/local daemon/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("400s empty content", async () => {
    const { status, json } = await postMessage({ sessions: [FREE_SESSION] }, { content: "   " });
    expect(status).toBe(400);
    expect(json.error).toMatch(/content is required/);
  });

  it("400s content over the byte ceiling (DD-8's one clamp)", async () => {
    const { status, json } = await postMessage(
      { sessions: [FREE_SESSION] },
      { content: "a".repeat(64_001) },
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/must not exceed/);
  });

  it("maps SPG16 (turn already in flight) to a legible 409, not a 500", async () => {
    // FR-004: a second send must refuse legibly. handleError has no branch
    // for SPG16 -- if chatTurnFailureFrom weren't wired, this would 500.
    const { status, json } = await postMessage(
      {
        sessions: [FREE_SESSION],
        rpc: {
          enqueue_chat_turn: {
            error: { code: "SPG16", message: "This session already has a reply in progress." },
          },
        },
      },
      { content: "another message" },
    );
    expect(status).toBe(409);
    expect(json.error).toBe("This session already has a reply in progress.");
    expect(json.reason).toBe("turn_in_progress");
  });

  it("rethrows an unrecognised database error rather than laundering it into a 409", async () => {
    await expect(
      postMessage(
        {
          sessions: [FREE_SESSION],
          rpc: { enqueue_chat_turn: { error: { code: "08006", message: "connection failure" } } },
        },
        { content: "hi" },
      ),
    ).rejects.toBeTruthy();
  });
});

describe("POST /chat/sessions/:id/retry", () => {
  it("resolves the session's latest turn and passes ITS id to retry_chat_turn", async () => {
    const olderTurn = { ...WAITING_TURN, id: "ct_0", status: "failed", created_at: "2026-08-22T00:00:00Z" };
    const { status, rpcCalls } = await postRetry(
      {
        sessions: [FREE_SESSION],
        turns: [olderTurn, WAITING_TURN],
        messages: [USER_MSG],
        rpc: { retry_chat_turn: { data: { ...WAITING_TURN, id: "ct_2", attempt: 2, retry_of_turn_id: "ct_1" } } },
      },
      { provider: "claude-code", model: "opus" },
    );
    expect(status).toBe(200);
    // NOT params.id ("chs_1") -- retry_chat_turn takes a turn id, and the
    // latest turn by created_at is ct_1, not the older ct_0.
    expect(rpcCalls[0]).toMatchObject({
      name: "retry_chat_turn",
      params: { p_turn_id: "ct_1", p_provider: "claude-code", p_model: "opus" },
    });
  });

  it("404s a session with no turn to retry", async () => {
    const { status, json } = await postRetry({ sessions: [FREE_SESSION], turns: [] });
    expect(status).toBe(404);
    expect(json.error).toMatch(/no turn to retry/);
  });

  it("refuses an agent-creator session", async () => {
    const { status, json } = await postRetry({ sessions: [CREATOR_SESSION] }, {}, "chs_2");
    expect(status).toBe(501);
    expect(json.error).toMatch(/Agent Creator/);
  });

  it("maps SPG19 (not retryable yet) to 409", async () => {
    const { status, json } = await postRetry({
      sessions: [FREE_SESSION],
      turns: [WAITING_TURN],
      rpc: { retry_chat_turn: { error: { code: "SPG19", message: "This turn cannot be retried yet." } } },
    });
    expect(status).toBe(409);
    expect(json.reason).toBe("turn_not_retryable");
  });
});

describe("GET /chat/sessions/:id — activeTurn", () => {
  it("is null when the session has never had a turn", async () => {
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
});
