import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { goalCreateSchema } from "@sparstrow/shared";
import {
  cancelGoal,
  createGoal,
  deleteGoal,
  getGoalDetail,
  listGoals,
  pauseGoal,
  replanGoal,
  resumeGoal,
  retryNode,
} from "../../goap/service.js";

const listQuerySchema = z.object({
  projectId: z.string().optional(),
  status: z.string().optional(),
});

const replanBodySchema = z.object({ reason: z.string().max(2000).nullable().optional() });

/** P6 goal engine routes (P6-Q1: the UI mounts these under the /tasks surface). */
export async function goalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/goals", async (request) => listGoals(listQuerySchema.parse(request.query)));

  app.post("/goals", async (request, reply) => {
    const body = goalCreateSchema.parse(request.body);
    reply.code(201);
    return createGoal(body);
  });

  app.get("/goals/:id", async (request) => {
    const { id } = request.params as { id: string };
    return getGoalDetail(id);
  });

  app.post("/goals/:id/pause", async (request) => {
    const { id } = request.params as { id: string };
    return pauseGoal(id);
  });

  app.post("/goals/:id/resume", async (request) => {
    const { id } = request.params as { id: string };
    return resumeGoal(id);
  });

  app.post("/goals/:id/cancel", async (request) => {
    const { id } = request.params as { id: string };
    return cancelGoal(id);
  });

  app.post("/goals/:id/replan", async (request) => {
    const { id } = request.params as { id: string };
    const body = replanBodySchema.parse(request.body ?? {});
    return replanGoal(id, body.reason ?? null);
  });

  app.post("/goals/:id/nodes/:nodeId/retry", async (request) => {
    const { id, nodeId } = request.params as { id: string; nodeId: string };
    return retryNode(id, nodeId);
  });

  app.delete("/goals/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    deleteGoal(id);
    reply.code(204);
  });
}
