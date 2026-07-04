import { and, asc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { TaskBlockQuestion, TaskQuestion } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { taskQuestions, tasks } from "../db/schema.js";
import { bus } from "../events/bus.js";
import { HttpError } from "../orchestrator/run-manager.js";
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
