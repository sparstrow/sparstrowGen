import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";

/**
 * P6 goal domain (engine decided by P6-Q0 head-to-head: LLM-planned-DAG — see
 * docs/archive/fable-handoff/P6-ENGINE-DECISION.md). The Planner LLM authors
 * the plan as nodes + dependency edges; deterministic validation replaces the
 * A* solver; edges are AUTHORITATIVE (recomputed only by plan writes, never
 * hand-mutated).
 *
 * This file is the trust boundary between the Planner's free-text output and
 * everything the executor will spawn — it was P6's mandated first task.
 */

/**
 * Goal lifecycle. `paused` is deliberately NOT a status (it's a flag on the
 * goal) so resume never has to guess which status to restore.
 * - planning: a Planner run is in flight (initial plan or a replan round).
 * - running:  current plan version is executing (materialize → advance).
 * - blocked:  needs the owner — replan cap hit, planner output unusable after
 *             retries, or consensus disagreement (P1 escalation surface).
 * - done:     every node in the current plan version reached `done`.
 * - cancelled: owner cancelled; in-flight node runs are cancelled too.
 */
export const goalStatusSchema = z.enum([
  "planning",
  "running",
  "blocked",
  "done",
  "cancelled",
]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

/**
 * Consensus gate (P6-Q3): "auto" = ON iff the plan's terminal ends in a
 * push-kind node (skipped for pure analysis/planning goals); "on"/"off"
 * override per goal.
 */
export const goalConsensusSchema = z.enum(["auto", "on", "off"]);
export type GoalConsensus = z.infer<typeof goalConsensusSchema>;

/**
 * Node kind, declared by the Planner. `push` marks the export/push/PR action
 * the P6-Q3 consensus gate holds; validation also applies a deterministic
 * label fallback so an unlabelled push node can't slip past the gate.
 */
export const planNodeKindSchema = z.enum(["work", "push"]);
export type PlanNodeKind = z.infer<typeof planNodeKindSchema>;

/**
 * DERIVED node status (EM4 — never stored; computed from the linked task +
 * goal state). Maps 1:1 onto the locked semantic status tokens (design rule
 * 15): pending=muted, ready=muted(outline), running=animated accent,
 * attention=amber, approval=violet, done=emerald, failed=red, skipped=gray.
 * - attention: task in `review` (agent never called task_update — effects NOT
 *   applied) or task `blocked` on a human question.
 * - approval:  task parked `pending_approval`, or the consensus gate is
 *   holding this push node for a Reviewer verdict ("ready-held").
 */
export const planNodeStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "attention",
  "approval",
  "done",
  "failed",
  "skipped",
]);
export type PlanNodeStatus = z.infer<typeof planNodeStatusSchema>;

/** Stable per-action identity: survives replans (completion carry-forward + version diffing key). */
export const planActionIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,63}$/i,
    "action id must be a short slug (letters/digits/_/-)",
  );

/**
 * One action as the Planner emits it (strict JSON, repair-retried). `pre` and
 * `effects` are OPTIONAL ANNOTATIONS for drill-in explainability — the
 * executor never evaluates them for readiness (P6-Q0 consequence); `dependsOn`
 * (edges) is what gates execution.
 */
export const plannerActionSchema = z.object({
  id: planActionIdSchema,
  label: z.string().min(1).max(120),
  /** Becomes the materialized task's description — what the assigned agent is told to do. */
  description: z.string().min(1).max(4000),
  /**
   * Agent reference (slug/name/id) the Planner suggests. Validation resolves
   * it against the enabled roster (team-bounded when the goal has a team) and
   * the P2 resolver (CEO S1-b) — an unresolvable hint bounces the plan back,
   * it never silently materializes unassignable work.
   */
  agentHint: z.string().min(1).max(120).nullable().default(null),
  /** Action ids this node depends on (the authoritative DAG edges). */
  dependsOn: z.array(planActionIdSchema).max(16).default([]),
  kind: planNodeKindSchema.default("work"),
  pre: z.array(z.string().max(160)).max(20).default([]),
  effects: z.array(z.string().max(160)).max(20).default([]),
  cost: z.number().min(0).max(100).default(1),
});
export type PlannerAction = z.infer<typeof plannerActionSchema>;

/** The Planner's whole reply (one plan version). Node cap enforced here AND in validation. */
export const plannerPlanSchema = z.object({
  planSummary: z.string().max(2000).default(""),
  actions: z.array(plannerActionSchema).min(1).max(30),
});
export type PlannerPlan = z.infer<typeof plannerPlanSchema>;

/**
 * Consensus Reviewer verdict (P6-Q3): strict JSON from the Reviewer run before
 * a push node materializes. Disagreement blocks the goal with BOTH positions.
 */
export const consensusVerdictSchema = z.object({
  approve: z.boolean(),
  position: z.string().min(1).max(4000),
});
export type ConsensusVerdict = z.infer<typeof consensusVerdictSchema>;

/**
 * One version-stamped applied effect (EM4 barrier rule): effects apply only on
 * task `done`, stamped with the plan version that applied them; applications
 * from superseded versions are discarded at replan. Audit/explainability
 * trail — NEVER control flow (readiness derives from edges + task status).
 */
export const appliedEffectSchema = z.object({
  fact: z.string(),
  actionId: planActionIdSchema,
  planVersion: z.number().int().min(1),
  at: isoDateSchema,
});
export type AppliedEffect = z.infer<typeof appliedEffectSchema>;

export const goalSchema = z.object({
  id: idSchema,
  projectId: idSchema.nullable().default(null),
  /** Team bound (P3): when set, agentHints must resolve inside this team. */
  teamId: idSchema.nullable().default(null),
  /** The owner's plain-English goal. */
  prompt: z.string().min(1),
  status: goalStatusSchema.default("planning"),
  /** 0 = no accepted plan yet; each accepted (re)plan increments. */
  planVersion: z.number().int().min(0).default(0),
  /** Completed replan rounds; capped by settings (default 3) → blocked. */
  replanCount: z.number().int().min(0).default(0),
  consensus: goalConsensusSchema.default("auto"),
  /** Pause = stop materializing new nodes; in-flight tasks continue (CEO E2). */
  paused: z.boolean().default(false),
  /**
   * Set at node failure (the replan barrier): while non-null, no new nodes
   * materialize; when the last in-flight sibling joins (reaches terminal), the
   * Planner is re-run with this diagnostic. Row-recoverable across restarts.
   */
  pendingReplanReason: z.string().nullable().default(null),
  /** Why the goal is blocked (replan cap, planner diagnostic, consensus positions). */
  blockedReason: z.string().nullable().default(null),
  /** Planner's one-paragraph summary of the current plan version. */
  planSummary: z.string().nullable().default(null),
  /** In-flight Planner run (status=planning) — the startup-reconciliation seam. */
  plannerRunId: idSchema.nullable().default(null),
  /**
   * LLM-loop retries consumed in the CURRENT round (planner bounce-backs while
   * planning; reviewer repair-retries while a consensus verdict is pending).
   * Reset whenever a round succeeds.
   */
  plannerAttempts: z.number().int().min(0).default(0),
  /** P6-Q3: the in-flight consensus Reviewer run (null = no verdict pending). */
  consensusRunId: idSchema.nullable().default(null),
  /** The plan version the Reviewer approved — a replan invalidates approval. */
  consensusApprovedVersion: z.number().int().nullable().default(null),
  /** Version-stamped applied-effects audit trail (annotation, not control flow). */
  worldState: z.array(appliedEffectSchema).default([]),
  /** Append-only replan timeline ("v2 — replanned after node X failed"). */
  versionLog: z
    .array(
      z.object({
        planVersion: z.number().int().min(1),
        reason: z.string(),
        at: isoDateSchema,
        nodeCount: z.number().int().min(0),
      }),
    )
    .default([]),
  /** Tenancy forward-marker (D6-followup) — no users table yet; see PHASE6-NOTES. */
  userId: idSchema.nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Goal = z.infer<typeof goalSchema>;

export const planNodeSchema = z.object({
  id: idSchema,
  goalId: idSchema,
  /** Which plan version this row belongs to; only rows matching goals.plan_version execute. */
  planVersion: z.number().int().min(1),
  /** Stable identity across versions (replan diffing + completion carry-forward). */
  actionId: planActionIdSchema,
  label: z.string(),
  description: z.string(),
  /** The Planner's raw hint, kept for provenance/display. */
  agentHint: z.string().nullable().default(null),
  /** The RESOLVED assignee (validation output) — what the executor spawns with. */
  agentId: idSchema.nullable().default(null),
  kind: planNodeKindSchema.default("work"),
  pre: z.array(z.string()).default([]),
  effects: z.array(z.string()).default([]),
  cost: z.number().default(1),
  /** The materialized task (null until this node's dependencies are met). */
  taskId: idSchema.nullable().default(null),
  /** React Flow layout position, computed at plan insert (layered by depth). */
  position: z.object({ x: z.number(), y: z.number() }).nullable().default(null),
  userId: idSchema.nullable().default(null),
  createdAt: isoDateSchema,
});
export type PlanNode = z.infer<typeof planNodeSchema>;

export const planEdgeSchema = z.object({
  id: z.number().int(),
  goalId: idSchema,
  planVersion: z.number().int().min(1),
  fromNodeId: idSchema,
  toNodeId: idSchema,
  userId: idSchema.nullable().default(null),
});
export type PlanEdge = z.infer<typeof planEdgeSchema>;

/** POST /goals body. */
export const goalCreateSchema = z.object({
  prompt: z.string().min(1).max(8000),
  projectId: idSchema.nullable().optional(),
  teamId: idSchema.nullable().optional(),
  consensus: goalConsensusSchema.optional(),
});
export type GoalCreate = z.infer<typeof goalCreateSchema>;

/**
 * A node as the API/UI sees it: the row plus its DERIVED status (EM4) and a
 * human-readable reason when the status needs one ("agent never reported —
 * review the result", "awaiting cross-team approval", "consensus gate:
 * awaiting Reviewer verdict").
 */
export const planNodeViewSchema = planNodeSchema.extend({
  status: planNodeStatusSchema,
  statusDetail: z.string().nullable().default(null),
});
export type PlanNodeView = z.infer<typeof planNodeViewSchema>;

/** GET /goals/:id — the goal with its full current graph (versions ride on goal.versionLog). */
export interface GoalDetail {
  goal: Goal;
  /** Nodes of the CURRENT plan version, with derived statuses. */
  nodes: PlanNodeView[];
  edges: PlanEdge[];
}
