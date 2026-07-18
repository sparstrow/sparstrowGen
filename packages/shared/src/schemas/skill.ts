import { z } from "zod";
import { idSchema } from "./common.js";

/**
 * A workspace skill: a reusable instruction pack (Markdown body) any agent can
 * be assigned. Assigned skills are injected into the agent's run prompt as a
 * guaranteed block — the Multica pattern adapted to Sparstrowgen's provider-
 * agnostic prompt assembly (no runtime file materialization needed).
 *
 * Distinct from an agent's generated SKILL.md (the agent's own definition) and
 * from P9 skill imports (external repos quarantined into agent drafts).
 */
export const skillSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  /** Markdown instructions injected verbatim under the skill's heading. */
  content: z.string().default(""),
  /** Disabled skills stay assigned but are never injected. */
  enabled: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Skill = z.infer<typeof skillSchema>;

export const skillCreateSchema = skillSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SkillCreate = z.infer<typeof skillCreateSchema>;

export const skillUpdateSchema = skillCreateSchema.partial();
export type SkillUpdate = z.infer<typeof skillUpdateSchema>;

/** One agent↔skill attachment (GET /skills/assignments). */
export const agentSkillAssignmentSchema = z.object({
  agentId: idSchema,
  skillId: idSchema,
});
export type AgentSkillAssignment = z.infer<typeof agentSkillAssignmentSchema>;

/** One skill discovered on a local CLI runtime (GET /skills/local). */
export const localSkillSummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  sourcePath: z.string(),
  provider: z.string(),
  root: z.enum(["provider", "universal"]),
  fileCount: z.number().int(),
});
export type LocalSkillSummary = z.infer<typeof localSkillSummarySchema>;

/** Result of an import (POST /skills/import-local | /skills/import-url). */
export const skillImportResultSchema = z.object({
  action: z.enum(["created", "updated"]),
  skill: skillSchema,
});
export type SkillImportResult = z.infer<typeof skillImportResultSchema>;

/** PUT /agents/:id/skills — replaces the agent's full assignment set. */
export const setAgentSkillsSchema = z.object({
  skillIds: z.array(idSchema),
});
export type SetAgentSkills = z.infer<typeof setAgentSkillsSchema>;
