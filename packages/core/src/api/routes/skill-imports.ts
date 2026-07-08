import type { FastifyInstance } from "fastify";
import { promoteAgentSchema, skillImportCreateSchema } from "@sparstrow/shared";
import { HttpError } from "../../orchestrator/run-manager.js";
import { writeAgentSkillMd } from "../../agents/skill-writer.js";
import {
  discardAgent,
  getSkillImportDetail,
  listSkillImports,
  promoteAgent,
  startSkillImport,
} from "../../agents/ingestion.js";

/**
 * P9 §3-5 skill ingestion routes. Inherits the /api bearer auth. The static
 * `/agents/imports*` paths are matched ahead of `/agents/:id` by find-my-way, so
 * registration order relative to agentRoutes doesn't matter.
 */
export async function skillImportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/agents/imports", async () => listSkillImports());

  app.post("/agents/imports", async (request, reply) => {
    const { sourceUrl } = skillImportCreateSchema.parse(request.body);
    const imported = startSkillImport(sourceUrl);
    // The clone → extract → review pipeline runs in the background; the client
    // polls GET /agents/imports/:id for status transitions.
    reply.code(202);
    return imported;
  });

  app.get("/agents/imports/:id", async (request) => {
    const { id } = request.params as { id: string };
    const detail = getSkillImportDetail(id);
    if (!detail) throw new HttpError(404, `skill import not found: ${id}`);
    return detail;
  });

  /**
   * Promote a quarantined draft to an active agent. The body carries the tool
   * scopes the operator approved (re-clamped server-side) and an explicit
   * `acknowledgedReadSkill: true` — promoteAgentSchema rejects anything else, so
   * the human read of the raw SKILL.md is enforced at the boundary (P9 lock).
   */
  app.post("/agents/:id/promote", async (request) => {
    const { id } = request.params as { id: string };
    const grant = promoteAgentSchema.parse(request.body);
    const promoted = promoteAgent(id, grant);
    writeAgentSkillMd(promoted); // now active — project the SKILL.md to disk
    return promoted;
  });

  app.post("/agents/:id/discard", async (request) => {
    const { id } = request.params as { id: string };
    return discardAgent(id);
  });
}
