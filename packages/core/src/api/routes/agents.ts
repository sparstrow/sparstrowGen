import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  agentCreateSchema,
  agentUpdateSchema,
  draftRequestSchema,
  slugify,
  type Agent,
} from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { agents } from "../../db/schema.js";
import { HttpError, runManager } from "../../orchestrator/run-manager.js";
import { getProvider } from "../../providers/index.js";
import { runAgentDraftTurn } from "../../agents/draft-service.js";
import { removeAgentSkillDir, writeAgentSkillMd } from "../../agents/skill-writer.js";

const nowIso = () => new Date().toISOString();

function rowToAgent(row: typeof agents.$inferSelect): Agent {
  return { ...row } as unknown as Agent;
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/agents", async () => {
    // Hide factory-managed system agents (Project Indexer/Reporter) from the
    // roster by default — they are still individually gettable by id.
    return getDb()
      .select()
      .from(agents)
      .where(eq(agents.isSystem, false))
      .orderBy(agents.name)
      .all()
      .map(rowToAgent);
  });

  /**
   * Agent Creator turn (F3). Runs the Creator interview against Claude via the
   * one-shot transport and returns a validated, permission-clamped draft.
   * Inherits the /api bearer auth. Registered before `/agents/:id` paths — it
   * is a distinct POST route, so there is no collision with `POST /agents`.
   */
  app.post("/agents/draft", async (request) => {
    const body = draftRequestSchema.parse(request.body);
    return runAgentDraftTurn(body);
  });

  app.post("/agents", async (request, reply) => {
    const body = agentCreateSchema.parse(request.body);
    // Validate the provider exists before persisting.
    getProvider(body.provider);
    const id = `agt_${nanoid(10)}`;
    const ts = nowIso();
    const slug = body.slug ?? slugify(body.name);
    if (!slug) throw new HttpError(400, "agent name must contain at least one alphanumeric character");
    getDb()
      .insert(agents)
      .values({ ...body, id, slug, createdAt: ts, updatedAt: ts })
      .run();
    const created = rowToAgent(getDb().select().from(agents).where(eq(agents.id, id)).get()!);
    writeAgentSkillMd(created); // best-effort projection to disk; never fatal
    reply.code(201);
    return created;
  });

  app.get("/agents/:id", async (request) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(agents).where(eq(agents.id, id)).get();
    if (!row) throw new HttpError(404, `agent not found: ${id}`);
    return rowToAgent(row);
  });

  app.put("/agents/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = agentUpdateSchema.parse(request.body);
    const db = getDb();
    const existing = db.select().from(agents).where(eq(agents.id, id)).get();
    if (!existing) throw new HttpError(404, `agent not found: ${id}`);
    if (body.provider) getProvider(body.provider);
    db.update(agents)
      .set({ ...body, updatedAt: nowIso() })
      .where(eq(agents.id, id))
      .run();
    const updated = rowToAgent(db.select().from(agents).where(eq(agents.id, id)).get()!);
    writeAgentSkillMd(updated); // regenerate the on-disk projection
    return updated;
  });

  app.delete("/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getDb().select().from(agents).where(eq(agents.id, id)).get();
    if (!existing) throw new HttpError(404, `agent not found: ${id}`);
    getDb().delete(agents).where(eq(agents.id, id)).run();
    removeAgentSkillDir(id); // clean up the generated SKILL.md dir (no orphans)
    reply.code(204);
  });

  /** Spawn a real headless run as a smoke test for this agent's CLI config. */
  app.post("/agents/:id/test-spawn", async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = runManager.createRun({
      agentId: id,
      prompt: "Health check. Reply with the single word: pong",
      trigger: "manual",
      triggerRef: "test-spawn",
    });
    reply.code(202);
    return run;
  });
}
