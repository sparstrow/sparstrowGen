import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timeout",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runTriggerSchema = z.enum(["manual", "cron", "pipeline", "task", "message"]);
export type RunTrigger = z.infer<typeof runTriggerSchema>;

export const runModeSchema = z.enum(["headless", "interactive"]);
export type RunMode = z.infer<typeof runModeSchema>;

/** Normalized event types emitted by provider stream parsers. */
export const runEventTypeSchema = z.enum([
  "system",
  "assistant",
  "user",
  "tool_use",
  "tool_result",
  "result",
  "stderr",
  "status",
  "raw",
]);
export type RunEventType = z.infer<typeof runEventTypeSchema>;

export const runEventSchema = z.object({
  id: z.number().int(),
  runId: idSchema,
  seq: z.number().int(),
  ts: isoDateSchema,
  type: runEventTypeSchema,
  /** Raw JSON payload (lossless; original provider line or normalized object). */
  payload: z.unknown(),
});
export type RunEvent = z.infer<typeof runEventSchema>;

export const runSchema = z.object({
  id: idSchema,
  agentId: idSchema,
  projectId: idSchema.nullable().default(null),
  pipelineRunId: idSchema.nullable().default(null),
  pipelineStepId: idSchema.nullable().default(null),
  trigger: runTriggerSchema,
  triggerRef: z.string().nullable().default(null),
  mode: runModeSchema,
  prompt: z.string(),
  injectedContext: z.string().nullable().default(null),
  status: runStatusSchema,
  sessionId: z.string().nullable().default(null),
  lane: z.string().default("foreground"),
  /** Immutable per-run effective toolset snapshot (P2); null until P2 lands. */
  effectiveTools: z.array(z.string()).nullable().default(null),
  resultText: z.string().nullable().default(null),
  costUsd: z.number().nullable().default(null),
  numTurns: z.number().int().nullable().default(null),
  durationMs: z.number().int().nullable().default(null),
  pid: z.number().int().nullable().default(null),
  exitCode: z.number().int().nullable().default(null),
  error: z.string().nullable().default(null),
  startedAt: isoDateSchema.nullable().default(null),
  finishedAt: isoDateSchema.nullable().default(null),
  createdAt: isoDateSchema,
});
export type Run = z.infer<typeof runSchema>;

/**
 * Run scheduling lanes (EH3). Background LLM consumers (dream cycle, signal
 * extraction, briefings) run in the `background` lane so they can't starve the
 * founder's foreground work — the tick scheduler bounds them separately.
 */
export const runLaneSchema = z.enum(["foreground", "background"]);
export type RunLane = z.infer<typeof runLaneSchema>;

export const runCreateSchema = z.object({
  agentId: idSchema,
  projectId: idSchema.nullable().optional(),
  prompt: z.string().min(1),
  trigger: runTriggerSchema.default("manual"),
  triggerRef: z.string().nullable().optional(),
  pipelineRunId: idSchema.nullable().optional(),
  pipelineStepId: idSchema.nullable().optional(),
  timeoutMs: z.number().int().positive().optional(),
  /** Resume this provider session instead of a fresh one (claude-code only). */
  resumeSessionId: z.string().nullable().optional(),
  /** Scheduling lane; createRun defaults to "foreground" when omitted. */
  lane: runLaneSchema.optional(),
  /** Immutable per-run effective toolset snapshot (P2 resolver output). */
  effectiveTools: z.array(z.string()).nullable().optional(),
});
export type RunCreate = z.infer<typeof runCreateSchema>;

/** Final structured result a provider extracts from a finished run. */
export interface RunResult {
  resultText: string | null;
  costUsd: number | null;
  numTurns: number | null;
  sessionId: string | null;
  isError: boolean;
  errorMessage?: string;
}
