import type { FastifyInstance } from "fastify";
import { and, asc, eq, gt } from "drizzle-orm";
import { runCreateSchema } from "@sparstrow/shared";
import { z } from "zod";
import { getDb } from "../../db/connection.js";
import { runEvents } from "../../db/schema.js";
import { HttpError, runManager } from "../../orchestrator/run-manager.js";

const listQuerySchema = z.object({
  agentId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const eventsQuerySchema = z.object({
  afterSeq: z.coerce.number().int().min(-1).default(-1),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export async function runRoutes(app: FastifyInstance): Promise<void> {
  app.get("/runs", async (request) => {
    const query = listQuerySchema.parse(request.query);
    return runManager.listRuns(query);
  });

  app.post("/runs", async (request, reply) => {
    const body = runCreateSchema.parse(request.body);
    const run = runManager.createRun(body);
    reply.code(202);
    return run;
  });

  app.get("/runs/:id", async (request) => {
    const { id } = request.params as { id: string };
    const run = runManager.getRun(id);
    if (!run) throw new HttpError(404, `run not found: ${id}`);
    return run;
  });

  app.get("/runs/:id/events", async (request) => {
    const { id } = request.params as { id: string };
    const query = eventsQuerySchema.parse(request.query);
    const run = runManager.getRun(id);
    if (!run) throw new HttpError(404, `run not found: ${id}`);
    return getDb()
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, id), gt(runEvents.seq, query.afterSeq)))
      .orderBy(asc(runEvents.seq))
      .limit(query.limit)
      .all();
  });

  app.post("/runs/:id/cancel", async (request) => {
    const { id } = request.params as { id: string };
    return runManager.cancel(id);
  });
}
