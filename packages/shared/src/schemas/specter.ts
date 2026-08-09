import { z } from "zod";
import { isoDateSchema } from "./common";

/**
 * P9 — Skill Specter security review + external-skill ingestion contracts.
 *
 * These are the trust-boundary shapes shared by core (the ingestion pipeline +
 * Skill Specter agent) and the UI (the quarantine review page). Every type here
 * describes data reconstructed from an EXTERNAL repo, so none of it is ever
 * treated as instructions — see agents/ingestion.ts + agents/specter.ts.
 */

/** Provenance of an agents row: operator/Creator-made vs reconstructed on import. */
export const agentOriginSchema = z.enum(["user", "import"]);
export type AgentOrigin = z.infer<typeof agentOriginSchema>;

/** Lifecycle of an agents row. Imported skills land `quarantined` (enabled=false,
 *  no tool grants) until the operator promotes them; `discarded` is a soft reject. */
export const agentStatusSchema = z.enum(["active", "quarantined", "discarded"]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

/** Skill Specter's overall gate for one imported skill. */
export const specterVerdictSchema = z.enum(["pass", "flag", "block"]);
export type SpecterVerdict = z.infer<typeof specterVerdictSchema>;

export const specterSeveritySchema = z.enum(["info", "warn", "critical"]);
export type SpecterSeverity = z.infer<typeof specterSeveritySchema>;

export const specterFindingSchema = z.object({
  severity: specterSeveritySchema,
  category: z.string().min(1).max(80),
  detail: z.string().min(1).max(1000),
});
export type SpecterFinding = z.infer<typeof specterFindingSchema>;

/**
 * The report card produced per imported skill: core-side static heuristics
 * (`staticFlags`) fused with the Skill Specter agent's LLM review (`findings`,
 * `suggestedModifications`). `verdict` is decided SERVER-SIDE from the fused
 * signals, never taken from the model's self-assessment (mirrors readyToCreate).
 */
export const specterReportSchema = z.object({
  verdict: specterVerdictSchema,
  summary: z.string().max(2000).default(""),
  findings: z.array(specterFindingSchema).max(100).default([]),
  suggestedModifications: z.array(z.string().max(500)).max(50).default([]),
  staticFlags: z.array(z.string().max(80)).max(50).default([]),
  llmReviewed: z.boolean().default(false),
  reviewedAt: isoDateSchema,
});
export type SpecterReport = z.infer<typeof specterReportSchema>;

/**
 * One agent/skill definition the Intelligence Extractor reconstructed from the
 * cloned repo. `requestedTools` is what the skill ASKS for — Specter reviews it
 * against policy; the quarantined draft is created with NO grants regardless.
 */
export const foundSkillSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(400).default(""),
  systemPrompt: z.string().max(20000).default(""),
  requestedTools: z.array(z.string().max(120)).max(100).default([]),
  sourcePath: z.string().max(500).default(""),
});
export type FoundSkill = z.infer<typeof foundSkillSchema>;

/** Strict shape the Extractor run must return as JSON (parsed from resultText). */
export const extractorOutputSchema = z.object({
  skills: z.array(foundSkillSchema).max(50).default([]),
});
export type ExtractorOutput = z.infer<typeof extractorOutputSchema>;

/** Lifecycle of a skill-import batch. */
export const skillImportStatusSchema = z.enum([
  "cloning",
  "extracting",
  "reviewing",
  "ready",
  "failed",
]);
export type SkillImportStatus = z.infer<typeof skillImportStatusSchema>;

export const skillImportSchema = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  sandboxProjectId: z.string().nullable().default(null),
  status: skillImportStatusSchema,
  extractorRunId: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  foundSkillCount: z.number().int().nonnegative().default(0),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type SkillImport = z.infer<typeof skillImportSchema>;

/** POST /agents/imports body — the operator supplies a repo URL to ingest. */
export const skillImportCreateSchema = z.object({
  sourceUrl: z.string().url().max(500),
});
export type SkillImportCreate = z.infer<typeof skillImportCreateSchema>;

/**
 * POST /agents/:id/promote body. The operator explicitly grants the tool scopes
 * (re-clamped server-side) and MUST acknowledge they read the raw SKILL.md — the
 * report is advisory, the human read is the gate (P9 lock: "explicit ack").
 */
export const promoteAgentSchema = z.object({
  allowedTools: z.array(z.string()).max(100).default([]),
  disallowedTools: z.array(z.string()).max(100).default([]),
  memoryReadScopes: z.array(z.string()).max(50).default([]),
  memoryWriteScopes: z.array(z.string()).max(50).default([]),
  acknowledgedReadSkill: z.literal(true),
});
export type PromoteAgent = z.infer<typeof promoteAgentSchema>;
