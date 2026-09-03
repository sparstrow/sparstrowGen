import { asc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { Pipeline } from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { pipelineSteps, pipelines, agents, teams } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import {
  getPipelineRun,
  listPipelineRuns,
  startPipeline,
} from "../../orchestrator/pipeline-executor.js";

const nowIso = () => new Date().toISOString();

const stepSchema = z.object({
  agentId: z.string(),
  promptTemplate: z.string().min(1),
  onFailure: z.enum(["abort", "continue"]).default("abort"),
});

const createBody = z.object({
  name: z.string().min(1).max(100),
  projectId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  description: z.string().default(""),
  enabled: z.boolean().default(true),
  steps: z.array(stepSchema).default([]),
});

const updateBody = createBody.partial();

function withSteps(id: string): Pipeline | null {
  const db = getDb();
  const row = db.select().from(pipelines).where(eq(pipelines.id, id)).get();
  if (!row) return null;
  const steps = db
    .select()
    .from(pipelineSteps)
    .where(eq(pipelineSteps.pipelineId, id))
    .orderBy(asc(pipelineSteps.position))
    .all();
  return { ...row, steps } as unknown as Pipeline;
}

function allWithSteps(teamId?: string): Pipeline[] {
  const db = getDb();
  return db
    .select()
    .from(pipelines)
    .where(teamId ? eq(pipelines.teamId, teamId) : undefined)
    .all()
    .map((row) => {
      const steps = db
        .select()
        .from(pipelineSteps)
        .where(eq(pipelineSteps.pipelineId, row.id))
        .orderBy(asc(pipelineSteps.position))
        .all();
      return { ...row, steps } as unknown as Pipeline;
    });
}

function assertAgentsExist(steps: z.infer<typeof stepSchema>[]): void {
  if (steps.length === 0) return;
  const db = getDb();
  const agentIds = Array.from(new Set(steps.map((s) => s.agentId)));
  const existingAgents = db
    .select({ id: agents.id })
    .from(agents)
    .where(inArray(agents.id, agentIds))
    .all();

  const existingIds = new Set(existingAgents.map((a) => a.id));
  const missing = agentIds.filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    throw new HttpError(400, `unknown agentIds: ${missing.join(", ")}`);
  }
}

function replaceSteps(pipelineId: string, inputs: z.infer<typeof stepSchema>[]): void {
  const db = getDb();
  db.delete(pipelineSteps).where(eq(pipelineSteps.pipelineId, pipelineId)).run();
  for (let i = 0; i < inputs.length; i++) {
    const s = inputs[i]!;
    db.insert(pipelineSteps)
      .values({
        id: `ps_${nanoid(10)}`,
        pipelineId,
        position: i,
        agentId: s.agentId,
        promptTemplate: s.promptTemplate,
        onFailure: s.onFailure,
      })
      .run();
  }
}

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  app.get("/pipelines", async (request) => {
    const query = z.object({ teamId: z.string().optional() }).parse(request.query);
    return allWithSteps(query.teamId);
  });

  app.post("/pipelines", async (request, reply) => {
    const db = getDb();
    const body = createBody.parse(request.body);

    if (body.teamId) {
      const team = db.select().from(teams).where(eq(teams.id, body.teamId)).get();
      if (!team) throw new HttpError(400, `unknown teamId: ${body.teamId}`);
    }

    assertAgentsExist(body.steps);

    const id = `pipe_${nanoid(10)}`;
    const ts = nowIso();
    db.insert(pipelines)
      .values({
        id,
        name: body.name,
        projectId: body.projectId ?? null,
        teamId: body.teamId ?? null,
        description: body.description,
        enabled: body.enabled,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    replaceSteps(id, body.steps);
    reply.code(201);
    return withSteps(id);
  });

  app.get("/pipelines/:id", async (request) => {
    const { id } = request.params as { id: string };
    const p = withSteps(id);
    if (!p) throw new HttpError(404, `pipeline not found: ${id}`);
    return p;
  });

  app.put("/pipelines/:id", async (request) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    if (!withSteps(id)) throw new HttpError(404, `pipeline not found: ${id}`);
    const body = updateBody.parse(request.body);
    const { steps, ...rest } = body;
    if (Object.keys(rest).length > 0) {
      db.update(pipelines)
        .set({ ...rest, updatedAt: nowIso() })
        .where(eq(pipelines.id, id))
        .run();
    }
    if (steps !== undefined) {
      assertAgentsExist(steps);
      replaceSteps(id, steps);
    }
    return withSteps(id);
  });

  app.delete("/pipelines/:id", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    if (!withSteps(id)) throw new HttpError(404, `pipeline not found: ${id}`);
    db.delete(pipelineSteps).where(eq(pipelineSteps.pipelineId, id)).run();
    db.delete(pipelines).where(eq(pipelines.id, id)).run();
    reply.code(204);
  });

  app.post("/pipelines/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ prompt: z.string().min(1) }).parse(request.body);
    const pr = startPipeline(id, body.prompt, "manual");
    reply.code(202);
    return pr;
  });

  app.get("/pipelines/:id/runs", async (request) => {
    const { id } = request.params as { id: string };
    if (!withSteps(id)) throw new HttpError(404, `pipeline not found: ${id}`);
    return listPipelineRuns(id);
  });

  app.get("/pipeline-runs/:id", async (request) => {
    const { id } = request.params as { id: string };
    const pr = getPipelineRun(id);
    if (!pr) throw new HttpError(404, `pipeline run not found: ${id}`);
    return pr;
  });
}
