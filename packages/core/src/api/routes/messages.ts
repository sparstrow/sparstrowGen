import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createMessage, listMessages, markMessageRead } from "../../taskboard/service.js";

const createSchema = z.object({
  toAgentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  subject: z.string().max(200).default(""),
  body: z.string().min(1),
  spawnRun: z.boolean().optional(),
});

const listQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
});

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/messages", async (request) => listMessages(listQuerySchema.parse(request.query)));

  app.post("/messages", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const message = createMessage({ ...body, fromType: "user" });
    reply.code(201);
    return message;
  });

  app.post("/messages/:id/mark-read", async (request) => {
    const { id } = request.params as { id: string };
    return markMessageRead(id);
  });
}
