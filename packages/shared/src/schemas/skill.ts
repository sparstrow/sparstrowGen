import { z } from "zod";
import { idSchema } from "./common.js";

/** Where a skill came from — drives the detail page's Origin panel. */
export const skillSourceTypeSchema = z.enum(["manual", "url", "runtime"]);
export type SkillSourceType = z.infer<typeof skillSourceTypeSchema>;

/**
 * A workspace skill: a reusable instruction pack (SKILL.md body plus optional
 * supporting files) any agent can be assigned. The body is injected into the
 * agent's run prompt as a guaranteed block; supporting files are materialized
 * on disk and referenced from that block so the agent can read them on demand
 * — the Multica pattern adapted to Sparstrowgen's single-machine shape.
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
  sourceType: skillSourceTypeSchema.default("manual"),
  /** Runtime source path or import URL; null for manual skills. */
  sourceRef: z.string().nullable().default(null),
  /** Runtime provider the skill was copied from (e.g. antigravity). */
  sourceProvider: z.string().nullable().default(null),
  fileCount: z.number().int().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Skill = z.infer<typeof skillSchema>;

export const skillCreateSchema = skillSchema.omit({
  id: true,
  sourceType: true,
  sourceRef: true,
  sourceProvider: true,
  fileCount: true,
  createdAt: true,
  updatedAt: true,
});
export type SkillCreate = z.infer<typeof skillCreateSchema>;

export const skillUpdateSchema = skillCreateSchema.partial();
export type SkillUpdate = z.infer<typeof skillUpdateSchema>;

/** One supporting file in a skill's bundle (path is relative to the skill dir). */
export const skillFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type SkillFile = z.infer<typeof skillFileSchema>;

/** GET /skills/:id — the skill plus its full file bundle. */
export const skillDetailSchema = skillSchema.extend({
  files: z.array(skillFileSchema),
});
export type SkillDetail = z.infer<typeof skillDetailSchema>;

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
