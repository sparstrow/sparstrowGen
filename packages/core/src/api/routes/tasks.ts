import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { taskStatusSchema } from "@sparstrow/shared";
import { HttpError } from "../../orchestrator/run-manager.js";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  startTaskRun,
  updateTask,
} from "../../taskboard/service.js";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  projectId: z.string().nullable().optional(),
  assignedAgentId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(3).default(1),
  dueAt: z.string().nullable().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  projectId: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
  assignedAgentId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  result: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  projectId: z.string().optional(),
  assignedAgentId: z.string().optional(),
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tasks", async (request) => listTasks(listQuerySchema.parse(request.query)));

  app.post("/tasks", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const task = createTask({ ...body, createdByType: "user" });
    reply.code(201);
    return task;
  });

  app.get("/tasks/:id", async (request) => {
    const { id } = request.params as { id: string };
    const task = getTask(id);
    if (!task) throw new HttpError(404, `task not found: ${id}`);
    return task;
  });

  app.put("/tasks/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);
    return updateTask(id, body);
  });

  app.delete("/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    deleteTask(id);
    reply.code(204);
  });

  app.post("/tasks/:id/assign", async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ agentId: z.string() }).parse(request.body);
    return updateTask(id, { assignedAgentId: body.agentId });
  });

  /** Re-run a task that is stuck or failed. */
  app.post("/tasks/:id/run", async (request) => {
    const { id } = request.params as { id: string };
    const task = getTask(id);
    if (!task) throw new HttpError(404, `task not found: ${id}`);
    if (!task.assignedAgentId) throw new HttpError(409, "task has no assignee");
    return startTaskRun(task) ?? task;
  });
}
