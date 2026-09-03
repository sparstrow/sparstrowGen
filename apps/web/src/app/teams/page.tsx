import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderKanban, Users } from "lucide-react";
import type { Project, Team } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActorAvatar } from "@/components/actor-avatar";
import { createClient } from "@web/utils/supabase/server";
import { getActiveWorkspaceId } from "@web/lib/workspace";
import { toCamel } from "@sparstrow/shared";
import { TeamsPageClient } from "./teams-client";

/**
 * T-VR-05 — the phase's worked example of the Server Component pattern
 * `apps/web/CLAUDE.md` mandates for new surfaces. See its Result section for
 * why `teams` was picked over the task's own suggested candidates (machines,
 * runs, imports) — each of those turned out to poll for live status or carry
 * a real create dialog once actually checked, which `teams` also has, but in
 * the smallest, most cleanly isolable form of the three.
 *
 * The team's delegation hierarchy at a glance: the first member (sort order —
 * set on the team detail page) leads, delegating to the workers underneath.
 * Pure and prop-driven, so unlike the old client version it renders on the
 * server with the rest of the list — no hooks, no directive needed.
 */
function TeamHierarchy({ members }: { members: { agentId: string; agentName: string }[] }) {
  if (members.length === 0) {
    return (
      <p className="py-3 text-center text-xs italic text-muted-foreground">
        No agents yet — add members on the team page.
      </p>
    );
  }
  const [leader, ...workers] = members;
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5">
        <ActorAvatar name={leader!.agentName} size="md" />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-medium">
            <Users className="size-3 text-warning" />
            <span className="truncate">{leader!.agentName}</span>
          </p>
          <p className="text-[10px] text-muted-foreground">Team Leader</p>
        </div>
      </div>
      {workers.length > 0 && (
        <>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <div className="flex w-full items-start justify-center gap-1.5 border-t border-dashed pt-2">
            {workers.slice(0, 6).map((w) => (
              <div key={w.agentId} className="flex w-14 flex-col items-center gap-1">
                <ActorAvatar name={w.agentName} size="sm" />
                <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                  {w.agentName}
                </span>
              </div>
            ))}
            {workers.length > 6 && (
              <span className="self-center text-[10px] text-muted-foreground">
                +{workers.length - 6}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type TeamRow = Team & {
  members: { agentId: string; agentName: string }[];
  memberCount: number;
  projectCount: number;
};

/**
 * Reproduces `GET /api/v1/teams`'s aggregation directly against Supabase —
 * the whole point of the exercise (one hop instead of three), not a fetch to
 * our own route handler. The handler is untouched and still serves the
 * client mutations in `teams-client.tsx`; see that handler's own comment for
 * why this needs two extra queries rather than one join.
 */
async function loadTeams(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<{ teams: TeamRow[]; projects: Project[] }> {
  const [{ data: teamRows, error: teamErr }, { data: projectRows, error: projectErr }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("projects")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
    ]);
  if (teamErr) throw teamErr;
  if (projectErr) throw projectErr;

  const teams = (teamRows ?? []) as any[];
  const projects = toCamel(projectRows ?? []) as Project[];
  if (teams.length === 0) return { teams: [], projects };

  const teamIds = teams.map((t) => t.id);
  const [{ data: memberRows, error: memberErr }, { data: projectLinkRows, error: linkErr }] =
    await Promise.all([
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
  if (linkErr) throw linkErr;

  const membersByTeam = new Map<string, { agentId: string; agentName: string }[]>();
  for (const row of (memberRows ?? []) as any[]) {
    const list = membersByTeam.get(row.team_id) ?? [];
    list.push({ agentId: row.agent_id, agentName: row.agents?.name ?? "" });
    membersByTeam.set(row.team_id, list);
  }
  const projectCountByTeam = new Map<string, number>();
  for (const row of (projectLinkRows ?? []) as any[]) {
    projectCountByTeam.set(row.team_id, (projectCountByTeam.get(row.team_id) ?? 0) + 1);
  }

  const result = toCamel(
    teams.map((t) => {
      const members = membersByTeam.get(t.id) ?? [];
      return { ...t, members, member_count: members.length, project_count: projectCountByTeam.get(t.id) ?? 0 };
    }),
  ) as TeamRow[];

  return { teams: result, projects };
}

export default async function TeamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getActiveWorkspaceId(supabase);
  if (ws.error || !ws.workspaceId) redirect("/login");

  const { teams, projects } = await loadTeams(supabase, ws.workspaceId);

  return (
    <div className="space-y-4">
      {/*
       * One `TeamsPageClient` mount, not two. The toolbar's "New team" button
       * and the empty state's own copy of it must open the SAME dialog — two
       * separate mounts would each carry independent dialog state, so
       * whichever button the user didn't click would silently do nothing
       * useful the next time. Passing `hasTeams` lets the one client island
       * decide which of its two trigger positions to render, rather than
       * splitting one piece of shared interactivity across two components.
       */}
      <TeamsPageClient projects={projects} hasTeams={teams.length > 0} />

      {teams.length === 0 ? null : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <Link key={team.id} href={`/teams/${team.id}`} className="block">
              <Card className="group flex h-full cursor-pointer flex-col transition-colors hover:border-primary/50">
                <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base transition-colors group-hover:text-primary">
                      {team.name}
                    </CardTitle>
                    {(team.isEphemeral || team.archivedAt) && (
                      <div className="flex gap-1.5">
                        {team.isEphemeral && (
                          <Badge variant="outline" className="border-info/40 text-[10px] text-info">
                            ephemeral
                          </Badge>
                        )}
                        {team.archivedAt && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            archived
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <Badge variant="secondary" className="flex shrink-0 items-center gap-1">
                    <Users className="size-3" />
                    {team.memberCount ?? 0}
                  </Badge>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <p className="line-clamp-2 min-h-[40px] text-sm text-muted-foreground">
                    {team.description || "No description."}
                  </p>

                  <TeamHierarchy members={team.members} />

                  <div className="flex items-center justify-between border-t pt-3">
                    {(team.projectCount ?? 0) > 0 ? (
                      <Badge variant="outline" className="flex items-center gap-1 font-normal">
                        <FolderKanban className="size-3 text-muted-foreground" />
                        {team.projectCount} project{team.projectCount !== 1 && "s"}
                      </Badge>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">No projects</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {team.memberCount ?? 0} agent{team.memberCount !== 1 && "s"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
