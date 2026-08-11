import { z } from "zod";
import { idSchema, isoDateSchema } from "./common";

export const taskStatusSchema = z.enum([
  "inbox",
  "todo",
  "in_progress",
  "review",
  "done",
  "failed",
  // P1 escalation state machine (migration 0004). blocked = agent hit a dead end
  // and is waiting on a human answer; blocked_answered = answer written, awaiting
  // the wake transition; pending_approval = a cross-team spawn awaiting the owner
  // (P3); waiting_children = a lead suspended until its delegated children finish
  // (P3). blocked_answered/waiting_children are internal transition states and are
  // never surfaced to agents (see agentTaskStatusSchema).
  "blocked",
  "blocked_answered",
  "pending_approval",
  "waiting_children",
  /**
   * M4, cloud-only: the machine this work was aimed at has no `runtime_projects`
   * binding for the task's project, or the directory it named is gone.
   *
   * NOT a failure — the task still needs doing and nothing about it is wrong.
   * The UI offers relink, clone from `gitRemote`, unbind, or reassign to a
   * machine that has it. A local SQLite task never carries this: a daemon
   * running its own work has the project by definition.
   *
   * The cloud schema documented this vocabulary from M1 and the enum was never
   * widened to match, so T-M4-03 was writing a status the type system did not
   * admit and the board had no column for — the task became invisible rather
   * than actionable.
   */
  "project_not_available",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * The status subset an agent is allowed to see/set via task_update. Internal
 * transition states (blocked_answered, waiting_children) never appear in
 * agent-read text — DX-M4.
 */
export const agentTaskStatusSchema = z.enum([
  "in_progress",
  "review",
  "done",
  "failed",
  "blocked",
]);
export type AgentTaskStatus = z.infer<typeof agentTaskStatusSchema>;

/** Statuses a wake transition may move a task OUT of (the sole double-wake gate). */
export const WAKEABLE_STATUSES = ["blocked_answered", "waiting_children"] as const;
/** Terminal statuses — a task in one of these is done, nothing wakes it. */
export const TERMINAL_TASK_STATUSES = ["done", "failed"] as const;

export const actorTypeSchema = z.enum(["user", "agent"]);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const taskSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  projectId: idSchema.nullable().default(null),
  status: taskStatusSchema.default("inbox"),
  createdByType: actorTypeSchema.default("user"),
  createdByAgentId: idSchema.nullable().default(null),
  assignedAgentId: idSchema.nullable().default(null),
  priority: z.number().int().min(0).max(3).default(1),
  runId: idSchema.nullable().default(null),
  result: z.string().nullable().default(null),
  /**
   * M4 — which machine should execute this. Null means any capable online
   * runtime; a set value is obeyed exactly and never substituted, because a
   * user who pinned work to their desktop did so for a reason.
   *
   * Cloud-only in practice: the column lives on the control-plane `tasks`
   * table, and a local SQLite task has nowhere to target. It is optional here
   * so a local row parses unchanged.
   */
  targetRuntimeId: idSchema.nullable().default(null).optional(),
  /**
   * The self-contained wake note assembled for the next run when a blocked task
   * is answered (buildWakePrompt output). Distinct from runs.injected_context
   * (the memory-audit block) — DX-C1: reusing that name across tables is a bug.
   */
  wakePayload: z.string().nullable().default(null),
  /** P2 task-level tool policy — the most specific level; deny always wins. */
  allowedTools: z.array(z.string()).default([]),
  disallowedTools: z.array(z.string()).default([]),
  /** P3 delegation tree: set by spawn_subtask, self-FK onto tasks (N levels, cap enforced). */
  parentTaskId: idSchema.nullable().default(null),
  /**
   * P3 S1-a: the delegating parent run's effective toolset, snapshotted at
   * spawn_subtask time. The child run's resolution is intersected with this bound
   * (LEAST privilege) — kept separate from the owner-editable allowed/disallowed
   * columns so an owner edit can't silently lift a delegation clamp.
   */
  parentEffectiveTools: z
    .object({ allowed: z.array(z.string()), disallowed: z.array(z.string()) })
    .nullable()
    .default(null),
  dueAt: isoDateSchema.nullable().default(null),
  /** Tenancy forward-marker (D6-followup) — no users table yet; see PHASE6-NOTES. */
  userId: idSchema.nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Task = z.infer<typeof taskSchema>;

/**
 * A single question an agent raised via task_block, stored one-row-per-question
 * (EM5 + DX-H4) so the attention queue, per-question composer, "Answered today",
 * and median-time-to-answer are indexed queries and concurrent writes are
 * row-level (no lost-update race on a JSON blob).
 */
export const taskQuestionSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  question: z.string().min(1),
  whyBlocked: z.string().default(""),
  /** Options the operator can pick from — render as buttons in the composer. */
  options: z.array(z.string()).nullable().default(null),
  recommendation: z.string().nullable().default(null),
  defaultIfNoAnswer: z.string().nullable().default(null),
  answer: z.string().nullable().default(null),
  askedByRunId: idSchema.nullable().default(null),
  askedAt: isoDateSchema,
  answeredAt: isoDateSchema.nullable().default(null),
  /** Set when the answer has been folded into a wake run (S4-a "saved not applied"). */
  appliedAt: isoDateSchema.nullable().default(null),
  userId: idSchema.nullable().default(null),
});
export type TaskQuestion = z.infer<typeof taskQuestionSchema>;

/** What an agent supplies per question when it calls task_block. */
export const taskBlockQuestionSchema = z.object({
  question: z.string().min(1),
  whyBlocked: z.string().default(""),
  options: z.array(z.string()).min(1).nullable().default(null),
  recommendation: z.string().nullable().default(null),
  defaultIfNoAnswer: z.string().nullable().default(null),
});
export type TaskBlockQuestion = z.infer<typeof taskBlockQuestionSchema>;

/** Body of PATCH /api/v1/tasks/:id/answer — one answer per open question. */
export const taskAnswerSchema = z.object({
  answers: z
    .array(z.object({ questionId: idSchema, answer: z.string().min(1) }))
    .min(1),
});
export type TaskAnswer = z.infer<typeof taskAnswerSchema>;

export const taskCreateSchema = taskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  runId: true,
  result: true,
  // Not create-time inputs (set by the escalation flow / tool-policy edits /
  // the spawn_subtask delegation path).
  wakePayload: true,
  allowedTools: true,
  disallowedTools: true,
  parentTaskId: true,
  parentEffectiveTools: true,
  userId: true,
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  result: z.string().nullable().optional(),
});
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const messageStatusSchema = z.enum(["unread", "read", "processed"]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const messageSchema = z.object({
  id: idSchema,
  fromType: actorTypeSchema,
  fromAgentId: idSchema.nullable().default(null),
  /** null = the user's inbox */
  toAgentId: idSchema.nullable().default(null),
  projectId: idSchema.nullable().default(null),
  taskId: idSchema.nullable().default(null),
  subject: z.string().max(200).default(""),
  body: z.string(),
  status: messageStatusSchema.default("unread"),
  spawnedRunId: idSchema.nullable().default(null),
  createdAt: isoDateSchema,
});
export type Message = z.infer<typeof messageSchema>;

export const messageCreateSchema = messageSchema.omit({
  id: true,
  createdAt: true,
  status: true,
  spawnedRunId: true,
});
export type MessageCreate = z.infer<typeof messageCreateSchema>;
