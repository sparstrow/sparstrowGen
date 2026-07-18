import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  setAgentSkillsSchema,
  skillCreateSchema,
  skillUpdateSchema,
  type Skill,
} from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { agents, agentSkills, skills } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import { listSkillsForAgent, setSkillsForAgent } from "../../agents/agent-skills.js";

const nowIso = () => new Date().toISOString();

function rowToSkill(row: typeof skills.$inferSelect): Skill {
  return { ...row };
}

function requireAgent(id: string): void {
  const row = getDb().select({ id: agents.id }).from(agents).where(eq(agents.id, id)).get();
  if (!row) throw new HttpError(404, `agent not found: ${id}`);
}

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  app.get("/skills", async () => {
    return getDb().select().from(skills).orderBy(skills.name).all().map(rowToSkill);
  });

  /** Every agent↔skill pair — lets list surfaces show chips without N+1 calls. */
  app.get("/skills/assignments", async () => {
    return getDb().select().from(agentSkills).all();
  });

  app.post("/skills", async (request, reply) => {
    const body = skillCreateSchema.parse(request.body);
    const id = `skl_${nanoid(10)}`;
    const ts = nowIso();
    const db = getDb();
    const duplicate = db.select({ id: skills.id }).from(skills).where(eq(skills.name, body.name)).get();
    if (duplicate) throw new HttpError(409, `a skill named "${body.name}" already exists`);
    db.insert(skills).values({ ...body, id, createdAt: ts, updatedAt: ts }).run();
    reply.code(201);
    return rowToSkill(db.select().from(skills).where(eq(skills.id, id)).get()!);
  });

  app.get("/skills/:id", async (request) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(skills).where(eq(skills.id, id)).get();
    if (!row) throw new HttpError(404, `skill not found: ${id}`);
    return rowToSkill(row);
  });

  app.put("/skills/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = skillUpdateSchema.parse(request.body);
    const db = getDb();
    const existing = db.select().from(skills).where(eq(skills.id, id)).get();
    if (!existing) throw new HttpError(404, `skill not found: ${id}`);
    if (body.name && body.name !== existing.name) {
      const duplicate = db.select({ id: skills.id }).from(skills).where(eq(skills.name, body.name)).get();
      if (duplicate) throw new HttpError(409, `a skill named "${body.name}" already exists`);
    }
    db.update(skills).set({ ...body, updatedAt: nowIso() }).where(eq(skills.id, id)).run();
    return rowToSkill(db.select().from(skills).where(eq(skills.id, id)).get()!);
  });

  app.delete("/skills/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getDb().select({ id: skills.id }).from(skills).where(eq(skills.id, id)).get();
    if (!existing) throw new HttpError(404, `skill not found: ${id}`);
    getDb().delete(skills).where(eq(skills.id, id)).run();
    reply.code(204);
  });

  app.get("/agents/:id/skills", async (request) => {
    const { id } = request.params as { id: string };
    requireAgent(id);
    return listSkillsForAgent(id);
  });

  app.put("/agents/:id/skills", async (request) => {
    const { id } = request.params as { id: string };
    requireAgent(id);
    const body = setAgentSkillsSchema.parse(request.body);
    try {
      return setSkillsForAgent(id, body.skillIds);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
  });
}
