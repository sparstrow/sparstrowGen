import { z } from "zod";
import { idSchema, isoDateSchema } from "./common";

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timeout",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * `dream` (P5): a dream-cycle consolidator run, queue-routed through the
 * background lane (EH3 — never `completeOnce`). The trigger type IS the
 * recursion guard: signal extraction never scans dream-triggered runs, so
 * extractor output can't feed the next night's extraction.
 */
/**
 * `goal` (P6): a goal-engine run — the Planner authoring/repairing a plan, or
 * the consensus Reviewer gating a push node. triggerRef = the goal id, so the
 * Dashboard cost view can attribute goal-engine spend (cross-cutting rule 5).
 * Node WORK runs are ordinary `task` runs (they execute materialized tasks).
 */
export const runTriggerSchema = z.enum(["manual", "cron", "pipeline", "task", "message", "system", "dream", "goal"]);
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
  /**
   * Local only. Cloud `run_events` is keyed on `(run_id, seq)` and has no `id`
   * column at all — the composite PK is what makes a replayed batch idempotent,
   * and an autoincrement would defeat it.
   *
   * So `GET /runs/:id/events` has always returned rows without this field. It
   * was declared required anyway, which was simply a false statement about data
   * that already flowed; nothing crashed only because `run-transcript.tsx` keys
   * on `seq`. Optional here so the type matches both sources, and so nothing new
   * starts depending on it.
   */
  id: z.number().int().optional(),
  runId: idSchema,
  seq: z.number().int(),
  ts: isoDateSchema,
  type: runEventTypeSchema,
  /** Raw JSON payload (lossless; original provider line or normalized object). */
  payload: z.unknown(),
});
export type RunEvent = z.infer<typeof runEventSchema>;

/**
 * E1 (P5): the injector's structured manifest — which notes and directives
 * actually entered a run's prompt (post budget-trim, so it reflects what was
 * INJECTED, not what was retrieved). Persisted on the run row at spawn.
 * Deliberately NOT named `injected_context`: that column already means the
 * rendered <memory> block string (plan L158-160 naming landmine).
 */
export const injectedMemoryManifestSchema = z.object({
  notes: z.array(
    z.object({
      id: idSchema,
      path: z.string(),
      title: z.string(),
      scope: z.string(),
      projectSlug: z.string().nullable(),
      agentSlug: z.string().nullable(),
      source: z.string(),
      type: z.string(),
    }),
  ),
  directives: z.array(z.object({ id: idSchema, body: z.string() })),
});
export type InjectedMemoryManifest = z.infer<typeof injectedMemoryManifestSchema>;

export const runSchema = z.object({
  id: idSchema,
  /**
   * Cloud-only. `select("*")` on the cloud `runs` table has always returned
   * this column — nothing stripped it, the type simply never named it. M5
   * needs it client-side to build a run's transcript broadcast topic
   * (`run:<workspaceId>:<runId>`), so it is declared rather than read off an
   * untyped response. Optional: local core's SQLite `runs` table has no
   * workspace concept at all, and never will.
   */
  workspaceId: idSchema.optional(),
  agentId: idSchema,
  projectId: idSchema.nullable().default(null),
  pipelineRunId: idSchema.nullable().default(null),
  pipelineStepId: idSchema.nullable().default(null),
  trigger: runTriggerSchema,
  triggerRef: z.string().nullable().default(null),
  mode: runModeSchema,
  prompt: z.string(),
  injectedContext: z.string().nullable().default(null),
  /** E1 (P5): structured provenance of the injected memory + directives. */
  injectedMemory: injectedMemoryManifestSchema.nullable().default(null),
  /**
   * EH6/EH7 (P5): the run consumed untrusted/external content — it ran in a
   * sandbox project, executed a delegated (agent-authored) task, or its
   * transcript used external-content tools (WebFetch/WebSearch/foreign MCP).
   * Stamped at finalize. Signal notes extracted from such runs are quarantined.
   */
  untrusted: z.boolean().default(false),
  status: runStatusSchema,
  sessionId: z.string().nullable().default(null),
  lane: z.string().default("foreground"),
  /**
   * P3/EH4: the project-scoped agent instance this run executed as (null when the
   * run has no project — the template itself). Stamped at spawn; the audit seam
   * for instance-keyed busy tracking and instance-scoped `agent:self` memory.
   */
  agentInstanceId: idSchema.nullable().default(null),
  /**
   * Immutable per-run effective toolset snapshot (P2, EH5). Resolved at spawn from
   * Global→Agent→Project→Task; the provider reads ONLY this, never the live agent
   * row, so mutating a row while the run is queued can't change what it may touch.
   */
  effectiveTools: z
    .object({ allowed: z.array(z.string()), disallowed: z.array(z.string()) })
    .nullable()
    .default(null),
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
  /**
   * M4: a cloud-dispatched run adopts the id the control plane generated, so
   * one id identifies it end to end — which is what lets M5's run_events attach
   * to the run the browser is already watching, with no translation on the hot
   * path. Omitted for locally-created runs, which generate their own.
   */
  id: idSchema.optional(),
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
  // effectiveTools is NOT a create-time input: it is resolved and snapshotted at
  // spawn time in run-manager.start() (P2), so a queued run always reflects the
  // policy in force when it actually runs.
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
