import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  buildWakePrompt,
  WAKEABLE_STATUSES,
  type Task,
  type TaskAnswer,
  type TaskBlockQuestion,
  type TaskQuestion,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { runs, taskQuestions, tasks } from "../db/schema.js";
import { bus } from "../events/bus.js";
import { HttpError, runManager } from "../orchestrator/run-manager.js";
import { getTask, updateTask } from "./service.js";

const nowIso = () => new Date().toISOString();

const rowToQuestion = (row: typeof taskQuestions.$inferSelect): TaskQuestion =>
  ({ ...row }) as unknown as TaskQuestion;

/** Open questions = raised, not yet answered. Ordered oldest-first for the queue. */
export function listOpenQuestions(taskId: string): TaskQuestion[] {
  return getDb()
    .select()
    .from(taskQuestions)
    .where(and(eq(taskQuestions.taskId, taskId), isNull(taskQuestions.answer)))
    .orderBy(asc(taskQuestions.askedAt))
    .all()
    .map(rowToQuestion);
}

export function listQuestions(taskId: string): TaskQuestion[] {
  return getDb()
    .select()
    .from(taskQuestions)
    .where(eq(taskQuestions.taskId, taskId))
    .orderBy(asc(taskQuestions.askedAt))
    .all()
    .map(rowToQuestion);
}

/**
 * One taxonomy of typed rows for the Human Attention Required queue (design C1).
 * Later phases add types (approval P3, contradiction P5, git-failure P7) — they
 * append row TYPES, never new sections. P1 emits `question` (blocked tasks) and
 * `ready-for-review` (tasks awaiting a human sign-off).
 */
export type AttentionRowType = "question" | "ready-for-review";
export interface AttentionRow {
  type: AttentionRowType;
  task: Task;
  questions: TaskQuestion[];
  ageMs: number;
}

export function listAttentionQueue(): AttentionRow[] {
  const rows = getDb()
    .select()
    .from(tasks)
    .where(inArray(tasks.status, ["blocked", "review"]))
    .orderBy(asc(tasks.updatedAt))
    .all()
    .map((r) => ({ ...r }) as unknown as Task);
  const now = Date.now();
  return rows.map((task) => ({
    type: task.status === "blocked" ? "question" : ("ready-for-review" as AttentionRowType),
    task,
    questions: task.status === "blocked" ? listOpenQuestions(task.id) : [],
    ageMs: Math.max(0, now - new Date(task.updatedAt).getTime()),
  }));
}

/**
 * The task_block core: an agent declares a dead end. Authorizes the caller,
 * records one row per question, captures the partial-progress note, and moves
 * the task to `blocked` so it lands in the human attention queue. The run itself
 * ends normally (the agent stops after this call) — no process sleeps.
 */
export function blockTaskWithQuestions(input: {
  taskId: string;
  agentId: string;
  runId?: string | null;
  questions: TaskBlockQuestion[];
  progressNote?: string | null;
}): { task: ReturnType<typeof getTask>; questions: TaskQuestion[] } {
  const { taskId, agentId, runId, questions, progressNote } = input;
  if (questions.length === 0) throw new HttpError(400, "task_block requires at least one question");

  const task = getTask(taskId);
  if (!task) throw new HttpError(404, `task not found: ${taskId}`);
  if (task.assignedAgentId !== agentId && task.createdByAgentId !== agentId) {
    throw new HttpError(403, "you may only block a task you created or were assigned");
  }

  const db = getDb();
  const ts = nowIso();
  const rows = questions.map((q) => ({
    id: `tq_${nanoid(10)}`,
    taskId,
    question: q.question,
    whyBlocked: q.whyBlocked ?? "",
    options: q.options ?? null,
    recommendation: q.recommendation ?? null,
    defaultIfNoAnswer: q.defaultIfNoAnswer ?? null,
    answer: null,
    askedByRunId: runId ?? null,
    askedAt: ts,
    answeredAt: null,
    appliedAt: null,
    userId: null,
  }));
  db.insert(taskQuestions).values(rows).run();

  // Move to blocked and capture the partial-progress note for the attention card.
  updateTask(
    taskId,
    { status: "blocked", ...(progressNote != null ? { result: progressNote } : {}) },
    { triggerRun: false },
  );
  const updated = getTask(taskId);
  bus.publish({ type: "task.updated", task: updated! });

  return { task: updated, questions: rows.map(rowToQuestion) };
}

export interface AnswerResult {
  applied: boolean;
  reason?: string;
  task: Task | null;
  questions: TaskQuestion[];
}

/**
 * Fold operator answers into a blocked task and wake it (EC1 + S4-a). Answers are
 * always saved (row-level, no lost-update race). If the task's prior run is still
 * in flight the wake is deferred (409 "answer saved, not applied"); otherwise the
 * task is flipped blocked → blocked_answered, a self-contained wake note is built,
 * and wakeTask performs the single conditional transition + fresh requeue.
 */
export function answerTaskQuestions(taskId: string, input: TaskAnswer): AnswerResult {
  const db = getDb();
  const task = getTask(taskId);
  if (!task) throw new HttpError(404, `task not found: ${taskId}`);

  const ts = nowIso();
  // Save every answer to its own row (idempotent: only fills still-open questions).
  for (const a of input.answers) {
    db.update(taskQuestions)
      .set({ answer: a.answer, answeredAt: ts })
      .where(
        and(
          eq(taskQuestions.id, a.questionId),
          eq(taskQuestions.taskId, taskId),
          isNull(taskQuestions.answer),
        ),
      )
      .run();
  }

  // S4-a: a run is still in flight — save the answers but do NOT transition; the
  // answer applies on the next wake. Route surfaces this as a 409.
  const activeRun = task.runId
    ? db.select().from(runs).where(eq(runs.id, task.runId)).get()
    : null;
  if (activeRun && activeRun.status === "running") {
    return {
      applied: false,
      reason: "run in flight — answer saved, applies on next wake",
      task,
      questions: listQuestions(taskId),
    };
  }

  if (task.status !== "blocked") {
    throw new HttpError(409, `task is not awaiting an answer (status: ${task.status})`);
  }

  // Flip blocked → blocked_answered, then build the wake note from the full Q&A.
  db.update(tasks)
    .set({ status: "blocked_answered", updatedAt: ts })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, "blocked")))
    .run();
  const answered = listQuestions(taskId)
    .filter((q) => q.answer != null)
    .map((q) => ({ question: q.question, answer: q.answer! }));
  const wakePayload = buildWakePrompt({
    taskTitle: task.title,
    taskDescription: task.description,
    answeredQuestions: answered,
    progressNote: task.result,
  });
  db.update(tasks).set({ wakePayload }).where(eq(tasks.id, taskId)).run();

  const woke = wakeTask(taskId);
  if (woke) {
    db.update(taskQuestions)
      .set({ appliedAt: ts })
      .where(and(eq(taskQuestions.taskId, taskId), isNotNull(taskQuestions.answer), isNull(taskQuestions.appliedAt)))
      .run();
  }
  return { applied: woke, task: getTask(taskId), questions: listQuestions(taskId) };
}

/**
 * The sole double-wake gate (EC1). A wake is a single conditional transition out
 * of a wakeable status; if it changed no row (someone already woke it, or the task
 * moved on) it is a no-op. On success it requeues a FRESH run with the wake note,
 * bypassing the auto-spawn throttle — wakes are not throttleable background spawns.
 */
export function wakeTask(taskId: string): boolean {
  const db = getDb();
  const res = db
    .update(tasks)
    .set({ status: "in_progress", updatedAt: nowIso() })
    .where(and(eq(tasks.id, taskId), inArray(tasks.status, [...WAKEABLE_STATUSES])))
    .run();
  if (res.changes === 0) return false;

  const task = getTask(taskId);
  if (!task?.assignedAgentId) {
    bus.publish({ type: "task.updated", task: task! });
    return true;
  }
  const run = runManager.createRun({
    agentId: task.assignedAgentId,
    projectId: task.projectId ?? null,
    prompt: task.wakePayload ?? task.description,
    trigger: "task",
    triggerRef: task.id,
  });
  db.update(tasks).set({ runId: run.id, updatedAt: nowIso() }).where(eq(tasks.id, taskId)).run();
  bus.publish({ type: "task.updated", task: getTask(taskId)! });
  return true;
}
