import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";

/**
 * P3 agent instances (locked D5): an agent template deployed into a project.
 * Created lazily on the first run of a template inside a project; `agent:self`
 * memory resolves to the instance (vault dir `agents/<template>/<project>/`),
 * so per-project expertise never bleeds across projects. Template self-notes
 * are COPIED on first instantiate (P3-Q1) — divergence starts there.
 */
export const agentInstanceSchema = z.object({
  id: idSchema,
  /** The agent template this instance was deployed from. */
  agentId: idSchema,
  projectId: idSchema,
  createdAt: isoDateSchema,
});
export type AgentInstance = z.infer<typeof agentInstanceSchema>;
