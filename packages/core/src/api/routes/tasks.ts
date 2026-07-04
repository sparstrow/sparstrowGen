import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { taskAnswerSchema, taskStatusSchema } from "@sparstrow/shared";
import { HttpError } from "../../orchestrator/run-manager.js";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  startTaskRun,
  updateTask,
} from "../../taskboard/service.js";
import {
  answerTaskQuestions,
  listAttentionQueue,
  listQuestions,
} from "../../taskboard/questions.js";
import {
  approveSubtask,
  createMultiAssignTask,
  denySubtask,
} from "../../taskboard/delegation.js";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  projectId: z.string().nullable().optional(),
  assignedAgentId: z.string().nullable().optional(),
  /** P3: two or more agents ⇒ ephemeral team + one child task per agent. */
  assignedAgentIds: z.array(z.string()).optional(),
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
    reply.code(201);
    // Multi-assign (P3): a swarm of assignees becomes an ephemeral team with one
    // child task per agent under a waiting_children container.
    if (body.assignedAgentIds && body.assignedAgentIds.length > 1) {
      const { parent } = createMultiAssignTask({
        title: body.title,
        description: body.description,
        projectId: body.projectId,
        agentIds: body.assignedAgentIds,
        priority: body.priority,
      });
      return parent;
    }
    const assignedAgentId = body.assignedAgentId ?? body.assignedAgentIds?.[0] ?? null;
    return createTask({ ...body, assignedAgentId, createdByType: "user" });
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

  /** The Human Attention Required queue: blocked tasks with their open questions. */
  app.get("/tasks/attention/queue", async () => listAttentionQueue());

  /** Questions raised on a task (for the task-detail panel). */
  app.get("/tasks/:id/questions", async (request) => {
    const { id } = request.params as { id: string };
    if (!getTask(id)) throw new HttpError(404, `task not found: ${id}`);
    return listQuestions(id);
  });

  /**
   * Answer a blocked task's question(s) and wake it. Always 200: the answers are
   * saved regardless. `applied` is false with a reason when the prior run is still
   * in flight (S4-a "answer saved, applies on next wake") — the client branches on
   * it rather than treating a saved answer as a failed request.
   */
  app.patch("/tasks/:id/answer", async (request) => {
    const { id } = request.params as { id: string };
    const body = taskAnswerSchema.parse(request.body);
    return answerTaskQuestions(id, body);
  });

  /** P3: approve a cross-team spawn — the child runs, the lead wakes on its result. */
  app.post("/tasks/:id/approve", async (request) => {
    const { id } = request.params as { id: string };
    return approveSubtask(id);
  });

  /** P3: deny a cross-team spawn — the child fails with the denial; the lead is woken with it. */
  app.post("/tasks/:id/deny", async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().optional() }).parse(request.body ?? {});
    return denySubtask(id, body.reason ?? null);
  });

  /** P3: the delegation tree — direct children of a task (detail-panel tree). */
  app.get("/tasks/:id/children", async (request) => {
    const { id } = request.params as { id: string };
    if (!getTask(id)) throw new HttpError(404, `task not found: ${id}`);
    return listTasks({ parentTaskId: id });
  });
}
