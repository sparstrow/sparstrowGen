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

  it("leaves the two adjacent chat-turn stubs legible, without a false milestone promise", async () => {
    // These used to say "Arriving in M5" -- fixed in
    // BUG-2026-08-23-chat-stub-stale-m5-promise once M5 shipped
    // (2026-08-11/12) without ever including chat turn-sending. Now scoped
    // as its own feature: doc/specs/2026-08-23-chat-message-sending.md.
    for (const path of ["/chat/sessions/chs_1/messages", "/chat/sessions/chs_1/retry"]) {
      const matched = matchRoute("POST", path);
      expect(matched, path).not.toBeNull();
      const res = await matched!.route.handler({
        supabase: {} as never,
        workspaceId: "ws_1",
        params: { id: "chs_1" },
        searchParams: new URLSearchParams(),
        body: {},
      });
      expect(res.status, path).toBe(501);
      const json = await res.json();
      expect(json.error, path).toMatch(/paired machine/i);
      expect(json.error, path).not.toMatch(/M5/);
      expect(json.error, path).toMatch(/not scheduled yet/i);
    }
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
