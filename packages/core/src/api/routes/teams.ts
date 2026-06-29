import type { FastifyInstance } from "fastify";
import { eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  teamCreateSchema,
  teamUpdateSchema,
  teamMemberCreateSchema,
  teamMemberUpdateSchema,
  slugify,
  type TeamIndexItem,
  type TeamDetail,
  type Team,
} from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { teams, teamMembers, teamProjects, agents, projects } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";

const nowIso = () => new Date().toISOString();

function rowToTeam(row: typeof teams.$inferSelect): Team {
  return { ...row } as unknown as Team;
}

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  app.get("/teams", async () => {
    const db = getDb();
    
    // Fetch all teams
    const allTeams = db.select().from(teams).orderBy(teams.name).all().map(rowToTeam);
    
    if (allTeams.length === 0) return [];

    const teamIds = allTeams.map((t) => t.id);

    // Fetch project counts
    const projCounts = db
      .select({
        teamId: teamProjects.teamId,
        count: sql<number>`count(*)`,
      })
      .from(teamProjects)
      .where(inArray(teamProjects.teamId, teamIds))
      .groupBy(teamProjects.teamId)
      .all();
    const projMap = new Map(projCounts.map((r) => [r.teamId, r.count]));

    // Fetch members with agent names (flat query for all teams)
    const allMembers = db
      .select({
        teamId: teamMembers.teamId,
        agentId: teamMembers.agentId,
        agentName: agents.name,
      })
      .from(teamMembers)
      .innerJoin(agents, eq(teamMembers.agentId, agents.id))
      .where(inArray(teamMembers.teamId, teamIds))
      .orderBy(teamMembers.sort)
      .all();
      
    const memberMap = new Map<string, typeof allMembers>();
    for (const m of allMembers) {
      if (!memberMap.has(m.teamId)) memberMap.set(m.teamId, []);
      memberMap.get(m.teamId)!.push(m);
    }

    // Assemble index items
    return allTeams.map((team): TeamIndexItem => {
      const members = memberMap.get(team.id) || [];
      return {
        ...team,
        projectCount: projMap.get(team.id) || 0,
        memberCount: members.length,
        members: members.slice(0, 5).map(m => ({
          agentId: m.agentId,
          agentName: m.agentName
        })),
      };
    });
  });

  app.post("/teams", async (request, reply) => {
    const body = teamCreateSchema.parse(request.body);
    const id = `team_${nanoid(10)}`;
    const ts = nowIso();
    const slug = body.slug ?? slugify(body.name);
    if (!slug) throw new HttpError(400, "team name must contain at least one alphanumeric character");
    
    getDb()
      .insert(teams)
      .values({ ...body, id, slug, createdAt: ts, updatedAt: ts })
      .run();
      
    reply.code(201);
    return rowToTeam(getDb().select().from(teams).where(eq(teams.id, id)).get()!);
  });

  app.get("/teams/:id", async (request) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    
    const row = db.select().from(teams).where(eq(teams.id, id)).get();
    if (!row) throw new HttpError(404, `team not found: ${id}`);
    
    const team = rowToTeam(row);

    // Fetch members
    const members = db
      .select({
        id: teamMembers.id,
        agentId: teamMembers.agentId,
        agentName: agents.name,
        agentRole: agents.role,
        teamRole: teamMembers.teamRole,
        sort: teamMembers.sort,
      })
      .from(teamMembers)
      .innerJoin(agents, eq(teamMembers.agentId, agents.id))
      .where(eq(teamMembers.teamId, id))
      .orderBy(teamMembers.sort)
      .all();

    // Fetch projects
    const assignedProjects = db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
      })
      .from(teamProjects)
      .innerJoin(projects, eq(teamProjects.projectId, projects.id))
      .where(eq(teamProjects.teamId, id))
      .all();

    return {
      ...team,
      members,
      projects: assignedProjects,
    } satisfies TeamDetail;
  });

  app.put("/teams/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = teamUpdateSchema.parse(request.body);
    const db = getDb();
    
    const existing = db.select().from(teams).where(eq(teams.id, id)).get();
    if (!existing) throw new HttpError(404, `team not found: ${id}`);
    
    db.update(teams)
      .set({ ...body, updatedAt: nowIso() })
      .where(eq(teams.id, id))
      .run();
      
    return rowToTeam(db.select().from(teams).where(eq(teams.id, id)).get()!);
  });

  app.delete("/teams/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getDb().select().from(teams).where(eq(teams.id, id)).get();
    if (!existing) throw new HttpError(404, `team not found: ${id}`);
    
    getDb().delete(teams).where(eq(teams.id, id)).run();
    reply.code(204);
  });

  // ── Member Management ───────────────────────────────────────────────────

  app.post("/teams/:id/members", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = teamMemberCreateSchema.parse(request.body);
    const db = getDb();

    const teamExists = db.select().from(teams).where(eq(teams.id, id)).get();
    if (!teamExists) throw new HttpError(404, `team not found: ${id}`);

    const agentExists = db.select().from(agents).where(eq(agents.id, body.agentId)).get();
    if (!agentExists) throw new HttpError(400, `agent not found: ${body.agentId}`);

    const existingMembership = db
      .select()
      .from(teamMembers)
      .where(sql`${teamMembers.teamId} = ${id} AND ${teamMembers.agentId} = ${body.agentId}`)
      .get();
      
    if (existingMembership) {
      throw new HttpError(409, `agent ${body.agentId} is already a member of team ${id}`);
    }

    const memberId = `tmb_${nanoid(10)}`;
    db.insert(teamMembers)
      .values({
        id: memberId,
        teamId: id,
        agentId: body.agentId,
        teamRole: body.teamRole ?? null,
        sort: body.sort ?? 0,
      })
      .run();

    reply.code(201);
    return db.select().from(teamMembers).where(eq(teamMembers.id, memberId)).get();
  });

  app.put("/teams/:id/members/:memberId", async (request) => {
    const { id, memberId } = request.params as { id: string; memberId: string };
    const body = teamMemberUpdateSchema.parse(request.body);
    const db = getDb();

    const existing = db.select().from(teamMembers).where(sql`${teamMembers.id} = ${memberId} AND ${teamMembers.teamId} = ${id}`).get();
    if (!existing) throw new HttpError(404, `team member not found: ${memberId}`);

    db.update(teamMembers)
      .set(body)
      .where(eq(teamMembers.id, memberId))
      .run();

    return db.select().from(teamMembers).where(eq(teamMembers.id, memberId)).get();
  });

  app.delete("/teams/:id/members/:memberId", async (request, reply) => {
    const { id, memberId } = request.params as { id: string; memberId: string };
    const db = getDb();
    
    const existing = db.select().from(teamMembers).where(sql`${teamMembers.id} = ${memberId} AND ${teamMembers.teamId} = ${id}`).get();
    if (!existing) throw new HttpError(404, `team member not found: ${memberId}`);

    db.delete(teamMembers).where(eq(teamMembers.id, memberId)).run();
    reply.code(204);
  });

  // ── Project Management ──────────────────────────────────────────────────

  app.put("/teams/:id/projects", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { projectIds: string[] };
    if (!body || !Array.isArray(body.projectIds)) {
      throw new HttpError(400, "projectIds array is required");
    }
    const db = getDb();

    const teamExists = db.select().from(teams).where(eq(teams.id, id)).get();
    if (!teamExists) throw new HttpError(404, `team not found: ${id}`);

    // Verify all projects exist
    if (body.projectIds.length > 0) {
      const existingProjects = db
        .select({ id: projects.id })
        .from(projects)
        .where(inArray(projects.id, body.projectIds))
        .all();
        
      if (existingProjects.length !== body.projectIds.length) {
        throw new HttpError(400, "one or more projects not found");
      }
    }

    db.transaction(() => {
      // Delete existing assignments
      db.delete(teamProjects).where(eq(teamProjects.teamId, id)).run();
      
      // Insert new assignments
      if (body.projectIds.length > 0) {
        for (const projectId of body.projectIds) {
          db.insert(teamProjects).values({ teamId: id, projectId }).run();
        }
      }
    });

    reply.code(204);
  });
}
