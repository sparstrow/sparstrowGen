import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";

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
   * The self-contained wake note assembled for the next run when a blocked task
   * is answered (buildWakePrompt output). Distinct from runs.injected_context
   * (the memory-audit block) — DX-C1: reusing that name across tables is a bug.
   */
  wakePayload: z.string().nullable().default(null),
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
