import { describe, expect, it } from "vitest";
import { teamIndexItemSchema, teamDetailSchema } from "@sparstrow/shared";
import { matchRoute } from "./router";
import "./handlers";

/**
 * BUG-2026-08-22-teams-page-crashes-with-real-data: GET /teams and
 * GET /teams/:id did a bare `select("*")` on the `teams` table, so the
 * response never carried `members`/`memberCount`/`projectCount` (index) or
 * `members`/`projects` (detail) that `teamIndexItemSchema`/`teamDetailSchema`
 * (packages/shared/src/schemas/team.ts) declare and the frontend
 * (apps/web/src/app/teams/teams.tsx, teams/[teamId]/team-detail.tsx) reads
 * unconditionally. This was invisible until a real team row existed --
 * every earlier pass only hit the empty state.
 *
 * These tests exercise the handler bodies against a fake Supabase query
 * builder standing in for the `teams` / `team_members` / `team_projects`
 * join, and validate the response against the real Zod schemas the
 * frontend is built against -- not just a 200 and a shape guess.
 */

type Row = Record<string, any>;

/** A minimal chainable stand-in for supabase-js's PostgREST query builder. */
function makeQueryBuilder(rows: Row[]) {
  let filtered = rows;
  const builder: any = {
    select: () => builder,
    eq(col: string, val: any) {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    in(col: string, vals: any[]) {
      const set = new Set(vals);
      filtered = filtered.filter((r) => set.has(r[col]));
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      const asc = opts?.ascending !== false;
      filtered = [...filtered].sort((a, b) => {
        if (a[col] === b[col]) return 0;
        return (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1);
      });
      return builder;
    },
    single() {
      if (filtered.length === 0) {
        return Promise.resolve({ data: null, error: { code: "PGRST116", message: "no rows" } });
      }
      return Promise.resolve({ data: filtered[0], error: null });
    },
    // supabase-js query builders are themselves thenable -- awaiting the
    // builder directly (no terminal call) is how the handlers under test
    // read a list back.
    then(resolve: any, reject?: any) {
      return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
    },
  };
  return builder;
}

function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      return makeQueryBuilder(tables[table] ?? []);
    },
  } as never;
}

const teamsFixture: Row[] = [
  {
    id: "tem_1",
    workspace_id: "ws_1",
    name: "Alpha Squad",
    slug: "alpha-squad",
    description: "Ships things",
    is_ephemeral: false,
    linked_task_id: null,
    archived_at: null,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
  },
  {
    // No members, no projects -- the case that must not crash the
    // aggregation (Map.get returning undefined for a team with no rows).
    id: "tem_2",
    workspace_id: "ws_1",
    name: "Empty Team",
    slug: "empty-team",
    description: "",
    is_ephemeral: false,
    linked_task_id: null,
    archived_at: null,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
  },
];

/** Rows shaped like `team_members.select("...", agents(name, role))`. */
const teamMembersFixture: Row[] = [
  {
    id: "tmb_1",
    workspace_id: "ws_1",
    team_id: "tem_1",
    agent_id: "agt_1",
    team_role: "Lead",
    sort: 0,
    agents: { name: "Ada Lovelace", role: "Engineer" },
  },
  {
    id: "tmb_2",
    workspace_id: "ws_1",
    team_id: "tem_1",
    agent_id: "agt_2",
    team_role: null,
    sort: 1,
    agents: { name: "Bob Wilson", role: "Designer" },
  },
];

/** Rows shaped like `team_projects.select("...", projects(id, name, slug))`. */
const teamProjectsFixture: Row[] = [
  { workspace_id: "ws_1", team_id: "tem_1", project_id: "prj_1", projects: { id: "prj_1", name: "Launch", slug: "launch" } },
  { workspace_id: "ws_1", team_id: "tem_1", project_id: "prj_2", projects: { id: "prj_2", name: "Growth", slug: "growth" } },
];

function tables() {
  return {
    teams: teamsFixture,
    team_members: teamMembersFixture,
    team_projects: teamProjectsFixture,
  };
}

describe("GET /teams", () => {
  it("resolves and returns 200 with a populated team", async () => {
    const matched = matchRoute("GET", "/teams");
    if (!matched) throw new Error("GET /teams is not registered");
    const res = await matched.route.handler({
      supabase: fakeSupabase(tables()),
      workspaceId: "ws_1",
      params: {},
      searchParams: new URLSearchParams(),
      body: {},
    });
    expect(res.status).toBe(200);
  });

  it("matches teamIndexItemSchema for every team, not just a 200", async () => {
    // The bug's exact shape: a 200 whose body the frontend still cannot
    // render. Validate the real contract, not just the status code.
    const matched = matchRoute("GET", "/teams");
    if (!matched) throw new Error("GET /teams is not registered");
    const res = await matched.route.handler({
      supabase: fakeSupabase(tables()),
      workspaceId: "ws_1",
      params: {},
      searchParams: new URLSearchParams(),
      body: {},
    });
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
    for (const item of json) {
      expect(() => teamIndexItemSchema.parse(item), JSON.stringify(item)).not.toThrow();
    }
  });

  it("aggregates memberCount/projectCount/members correctly per team", async () => {
    const matched = matchRoute("GET", "/teams");
    if (!matched) throw new Error("GET /teams is not registered");
    const res = await matched.route.handler({
      supabase: fakeSupabase(tables()),
      workspaceId: "ws_1",
      params: {},
      searchParams: new URLSearchParams(),
      body: {},
    });
    const json = await res.json();
    const alpha = json.find((t: any) => t.id === "tem_1");
    const empty = json.find((t: any) => t.id === "tem_2");

    expect(alpha.memberCount).toBe(2);
    expect(alpha.projectCount).toBe(2);
    expect(alpha.members).toEqual([
      { agentId: "agt_1", agentName: "Ada Lovelace" },
      { agentId: "agt_2", agentName: "Bob Wilson" },
    ]);

    // The case that used to crash TeamHierarchy: no rows joined at all.
    expect(empty.memberCount).toBe(0);
    expect(empty.projectCount).toBe(0);
    expect(empty.members).toEqual([]);
  });

  it("returns an empty array, not an error, when the workspace has no teams", async () => {
    const matched = matchRoute("GET", "/teams");
    if (!matched) throw new Error("GET /teams is not registered");
    const res = await matched.route.handler({
      supabase: fakeSupabase({ teams: [], team_members: [], team_projects: [] }),
      workspaceId: "ws_1",
      params: {},
      searchParams: new URLSearchParams(),
      body: {},
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /teams/:id", () => {
  it("matches teamDetailSchema, with full member and project shapes", async () => {
    const matched = matchRoute("GET", "/teams/:id");
    if (!matched) throw new Error("GET /teams/:id is not registered");
    const res = await matched.route.handler({
      supabase: fakeSupabase(tables()),
      workspaceId: "ws_1",
      params: { id: "tem_1" },
      searchParams: new URLSearchParams(),
      body: {},
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(() => teamDetailSchema.parse(json), JSON.stringify(json)).not.toThrow();

    expect(json.members).toEqual([
      { id: "tmb_1", agentId: "agt_1", agentName: "Ada Lovelace", agentRole: "Engineer", teamRole: "Lead", sort: 0 },
      { id: "tmb_2", agentId: "agt_2", agentName: "Bob Wilson", agentRole: "Designer", teamRole: null, sort: 1 },
    ]);
    expect(json.projects).toEqual([
      { id: "prj_1", name: "Launch", slug: "launch" },
      { id: "prj_2", name: "Growth", slug: "growth" },
    ]);
  });

  it("matches teamDetailSchema for a team with no members and no projects", async () => {
    const matched = matchRoute("GET", "/teams/:id");
    if (!matched) throw new Error("GET /teams/:id is not registered");
    const res = await matched.route.handler({
      supabase: fakeSupabase(tables()),
      workspaceId: "ws_1",
      params: { id: "tem_2" },
      searchParams: new URLSearchParams(),
      body: {},
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(() => teamDetailSchema.parse(json), JSON.stringify(json)).not.toThrow();
    expect(json.members).toEqual([]);
    expect(json.projects).toEqual([]);
  });

  it("404s when the team does not exist (or is hidden by RLS)", async () => {
    const matched = matchRoute("GET", "/teams/:id");
    if (!matched) throw new Error("GET /teams/:id is not registered");
    const res = await matched.route.handler({
      supabase: fakeSupabase(tables()),
      workspaceId: "ws_1",
      params: { id: "tem_missing" },
      searchParams: new URLSearchParams(),
      body: {},
    });
    expect(res.status).toBe(404);
  });
});
