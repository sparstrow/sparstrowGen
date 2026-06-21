import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createCronJob,
  deleteCronJob,
  fireJobNow,
  getCronJob,
  listCronJobs,
  updateCronJob,
} from "../../scheduler/service.js";
import { HttpError } from "../../orchestrator/run-manager.js";

const createBody = z.object({
  name: z.string().min(1).max(100),
  cronExpr: z.string().min(1),
  timezone: z.string().default("system"),
  targetType: z.enum(["agent", "pipeline"]),
  targetId: z.string().min(1),
  prompt: z.string().min(1),
  projectId: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
});

const updateBody = createBody.partial();

export async function cronRoutes(app: FastifyInstance): Promise<void> {
  app.get("/cron-jobs", async () => listCronJobs());

  app.post("/cron-jobs", async (request, reply) => {
    const body = createBody.parse(request.body);
    const job = createCronJob(body);
    reply.code(201);
    return job;
  });

  app.get("/cron-jobs/:id", async (request) => {
    const { id } = request.params as { id: string };
    const job = getCronJob(id);
    if (!job) throw new HttpError(404, `cron job not found: ${id}`);
    return job;
  });

  app.put("/cron-jobs/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = updateBody.parse(request.body);
    return updateCronJob(id, body);
  });

  app.delete("/cron-jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    deleteCronJob(id);
    reply.code(204);
  });

  app.post("/cron-jobs/:id/run-now", async (request, reply) => {
    const { id } = request.params as { id: string };
    fireJobNow(id);
    reply.code(202);
    return { ok: true };
  });
}
