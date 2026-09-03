import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { memorySearchRequestSchema } from "@sparstrow/shared";
import {
  agentMemorySave,
  agentMemorySearch,
  resolveRunContext,
} from "../../memory/agent-memory.js";

const saveSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  scope: z.enum(["global", "project", "agent"]).default("agent"),
  projectSlug: z.string().optional(),
  agentSlug: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

/**
 * REST twin of the /mcp tools, used by the sparstrow-memory CLI (antigravity,
 * humans) with the same per-run header auth and scope enforcement.
 */
export async function agentGatewayRoutes(app: FastifyInstance): Promise<void> {
  app.post("/agent/memory/search", async (request) => {
    const ctx = resolveRunContext(request.headers["x-sparstrow-run"]);
    const body = memorySearchRequestSchema.parse(request.body);
    return agentMemorySearch(ctx, body.query, body.k);
  });

  app.post("/agent/memory/save", async (request, reply) => {
    const ctx = resolveRunContext(request.headers["x-sparstrow-run"]);
    const body = saveSchema.parse(request.body);
    const note = agentMemorySave(ctx, body);
    reply.code(201);
    return note;
  });
}
