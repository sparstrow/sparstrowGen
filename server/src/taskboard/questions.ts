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
import { agents, memoryContradictions, memoryNotes, runs, taskQuestions, tasks } from "../db/schema.js";
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
 * Later phases add types (git-failure P7) — they append row TYPES, never new
 * sections. P1 emits `question` (blocked tasks) and `ready-for-review`; P3
 * adds `approval` (cross-team spawns awaiting the owner); P5 adds
 * `contradiction` (dream-cycle memory flags, P5-Q3 flag-only).
 */
export type AttentionRowType = "question" | "ready-for-review" | "approval" | "contradiction";

/**
 * EM3: the injection carrier — the verbatim agent-authored description — must be
 * the PRIMARY thing the owner reads on an approval card, alongside the target
 * agent and the exact tool bound the child would run under.
 */
export interface ApprovalDetails {
  targetAgentName: string | null;
  delegatedByAgentName: string | null;
  parentTaskId: string | null;
  parentTaskTitle: string | null;
  /** The S1-a LEAST bound the child would run under (null = unbounded/default). */
  effectiveBound: { allowed: string[]; disallowed: string[] } | null;
  verbatimDescription: string;
}
/**
 * P5: a dream-cycle contradiction flag as an attention row (flag-only — the
 * owner resolves by editing/archiving a note and dismissing the flag).
 */
export interface ContradictionDetails {
  id: string;
  projectSlug: string | null;
  axis: string;
  severity: string;
  confidence: number;
  noteAId: string;
  noteATitle: string;
  noteBId: string;
  noteBTitle: string;
}

export interface AttentionRow {
  type: AttentionRowType;
  /** Null for non-task rows (P5 contradiction flags). */
  task: Task | null;
  questions: TaskQuestion[];
  approval?: ApprovalDetails;
  contradiction?: ContradictionDetails;
  ageMs: number;
}

export function listAttentionQueue(): AttentionRow[] {
  const db = getDb();
  const rows = db
    .select()
    .from(tasks)
    .where(inArray(tasks.status, ["blocked", "review", "pending_approval"]))
    .orderBy(asc(tasks.updatedAt))
    .all()
    .map((r) => ({ ...r }) as unknown as Task);
  const now = Date.now();
  const agentName = (id: string | null): string | null =>
    id ? (db.select({ name: agents.name }).from(agents).where(eq(agents.id, id)).get()?.name ?? null) : null;
  const taskRows = rows.map((task) => {
    const type: AttentionRowType =
      task.status === "blocked" ? "question" : task.status === "pending_approval" ? "approval" : "ready-for-review";
    const row: AttentionRow = {
      type,
      task,
      questions: type === "question" ? listOpenQuestions(task.id) : [],
      ageMs: Math.max(0, now - new Date(task.updatedAt).getTime()),
    };
    if (type === "approval") {
      const parent = task.parentTaskId
        ? db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, task.parentTaskId)).get()
        : null;
      row.approval = {
        targetAgentName: agentName(task.assignedAgentId),
        delegatedByAgentName: agentName(task.createdByAgentId),
        parentTaskId: task.parentTaskId,
        parentTaskTitle: parent?.title ?? null,
        effectiveBound: task.parentEffectiveTools,
        verbatimDescription: task.description,
      };
    }
    return row;
  });

  // P5: open contradiction flags append as their own row type (never a section).
  const noteTitle = (id: string): string =>
    db.select({ title: memoryNotes.title }).from(memoryNotes).where(eq(memoryNotes.id, id)).get()?.title ??
    "(deleted note)";
  const contradictionRows: AttentionRow[] = db
    .select()
    .from(memoryContradictions)
    .where(isNull(memoryContradictions.resolvedAt))
    .orderBy(asc(memoryContradictions.detectedAt))
    .all()
    .map((c) => ({
      type: "contradiction" as const,
      task: null,
      questions: [],
      contradiction: {
        id: c.id,
        projectSlug: c.projectSlug,
        axis: c.axis,
        severity: c.severity,
        confidence: c.confidence,
        noteAId: c.noteA,
        noteATitle: noteTitle(c.noteA),
        noteBId: c.noteB,
        noteBTitle: noteTitle(c.noteB),
      },
      ageMs: Math.max(0, now - new Date(c.detectedAt).getTime()),
    }));

  return [...taskRows, ...contradictionRows];
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
