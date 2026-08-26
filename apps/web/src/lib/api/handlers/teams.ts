import { registerRoute, ok, fail, HandlerContext } from "../router";

/*
 * The nine team WRITE handlers that stood in this file -- POST /teams,
 * PUT|PATCH /teams/:id, DELETE /teams/:id, POST /teams/:id/members,
 * PUT|PATCH /teams/:id/members/:memberId, DELETE /teams/:id/members/:memberId,
 * and PUT /teams/:id/projects -- were deleted by `T-WA-01`.
 *
 * They are Server Actions now: `app/teams/actions.ts` and
 * `app/teams/[teamId]/actions.ts`. Deleted in the same change that converted
 * their last caller, deliberately: leaving a handler and an action both
 * accepting the same write is how M2's defect 5 happened, where POST /goals
 * had a stub and a real handler and import order decided which won.
 *
 * The GET handlers below stay. `/api/v1` thins in band 22; it does not
 * disappear (plan DD-5, and `doc/Deferred.md` D-25).
 *
 * Plan: doc/plans/2026-08-24-server-action-write-conversion.md
 */

registerRoute({
  method: "GET",
  pattern: "/teams",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data: teams, error } = await supabase
      .from("teams")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!teams || teams.length === 0) return ok([]);

    // teamIndexItemSchema (packages/shared/src/schemas/team.ts) needs
    // memberCount/projectCount/members per team -- fields the bare `teams`
    // row never carries (BUG-2026-08-22-teams-page-crashes-with-real-data).
    // Two round-trips against the same join tables /teams/:id/members and
    // /teams/:id/projects already read, aggregated once for every team in
    // the workspace rather than one query per team.
    const teamIds = teams.map((t: any) => t.id);

    const [{ data: memberRows, error: memberErr }, { data: projectRows, error: projectErr }] = await Promise.all([
      supabase
        .from("team_members")
        .select("team_id, agent_id, sort, agents(name)")
        .eq("workspace_id", workspaceId)
        .in("team_id", teamIds)
        .order("sort", { ascending: true }),
      supabase
        .from("team_projects")
        .select("team_id")
        .eq("workspace_id", workspaceId)
        .in("team_id", teamIds),
    ]);
    if (memberErr) throw memberErr;
    if (projectErr) throw projectErr;

    const membersByTeam = new Map<string, { agentId: string; agentName: string }[]>();
    for (const row of (memberRows ?? []) as any[]) {
      const list = membersByTeam.get(row.team_id) ?? [];
      list.push({ agentId: row.agent_id, agentName: row.agents?.name ?? "" });
      membersByTeam.set(row.team_id, list);
    }

    const projectCountByTeam = new Map<string, number>();
    for (const row of (projectRows ?? []) as any[]) {
      projectCountByTeam.set(row.team_id, (projectCountByTeam.get(row.team_id) ?? 0) + 1);
    }

    const result = teams.map((t: any) => {
      const members = membersByTeam.get(t.id) ?? [];
      return {
        ...t,
        members,
        memberCount: members.length,
        projectCount: projectCountByTeam.get(t.id) ?? 0,
      };
    });

    return ok(result);
  }
});


registerRoute({
  method: "GET",
  pattern: "/teams/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data: team, error } = await supabase
      .from("teams")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");

    // teamDetailSchema (packages/shared/src/schemas/team.ts) needs the fuller
    // members/projects shape -- same join tables /teams/:id/members and
    // /teams/:id/projects already read (BUG-2026-08-22-teams-page-crashes-with-real-data).
    const [{ data: memberRows, error: memberErr }, { data: projectRows, error: projectErr }] = await Promise.all([
      supabase
        .from("team_members")
        .select("id, agent_id, team_role, sort, agents(name, role)")
        .eq("workspace_id", workspaceId)
        .eq("team_id", params.id)
        .order("sort", { ascending: true }),
      supabase
        .from("team_projects")
        .select("projects(id, name, slug)")
        .eq("workspace_id", workspaceId)
        .eq("team_id", params.id),
    ]);
    if (memberErr) throw memberErr;
    if (projectErr) throw projectErr;

    const members = ((memberRows ?? []) as any[]).map((m) => ({
      id: m.id,
      agentId: m.agent_id,
      agentName: m.agents?.name ?? "",
      agentRole: m.agents?.role ?? "",
      teamRole: m.team_role,
      sort: m.sort,
    }));

    const projects = ((projectRows ?? []) as any[])
      .map((p) => p.projects)
      .filter(Boolean);

    return ok({ ...team, members, projects });
  }
});


registerRoute({
  method: "GET",
  pattern: "/teams/:id/members",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("team_members")
      .select("*, agents(*)") // assuming team_members joins agents
      .eq("workspace_id", workspaceId)
      .eq("team_id", params.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ok(data);
  }
});


registerRoute({
  method: "GET",
  pattern: "/teams/:id/projects",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("team_projects")
      .select("*, projects(*)")
      .eq("workspace_id", workspaceId)
      .eq("team_id", params.id);
    if (error) throw error;
    return ok(data);
  }
});

