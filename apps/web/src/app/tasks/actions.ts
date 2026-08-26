"use server";

import { revalidatePath } from "next/cache";
import type { EnqueueFailureReason, Task, TaskQuestion, TaskStatus } from "@sparstrow/shared";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  toCamel,
  toSnake,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";
import { enqueueFailureFrom } from "@web/lib/api/enqueue";

const TASKS_OPAQUE = ["parent_effective_tools"];

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  projectId?: string | null;
  assignedAgentId?: string | null;
  /** P3: two or more agents ⇒ ephemeral team + one child task per agent. */
  assignedAgentIds?: string[];
  priority?: number;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assignedAgentId?: string | null;
  priority?: number;
  result?: string | null;
  /** M4 — reassign to a specific machine, or clear the pin with null. */
  targetRuntimeId?: string | null;
}

/** Moved verbatim from the `POST /tasks` handler this replaces. */
export async function createTaskAction(input: TaskCreateInput): Promise<ActionResult<Task>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const payload = {
    ...toSnake(input),
    workspace_id: ctx.workspaceId,
    id: generateId("tsk_"),
  };
  const { data, error } = await ctx.supabase.from("tasks").insert(payload).select().single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/tasks");
  return actionOk(toCamel(data, TASKS_OPAQUE) as Task);
}

/** Moved verbatim from the `PUT /tasks/:id` handler this replaces. */
export async function updateTaskAction(
  id: string,
  data: TaskUpdateInput,
): Promise<ActionResult<Task>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: row, error } = await ctx.supabase
    .from("tasks")
    .update(toSnake(data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/tasks");
  return actionOk(toCamel(row, TASKS_OPAQUE) as Task);
}

/** Moved verbatim from the `DELETE /tasks/:id` handler this replaces. */
export async function deleteTaskAction(id: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: deleted, error } = await ctx.supabase
    .from("tasks")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!deleted || deleted.length === 0) return actionFail("Not Found");

  revalidatePath("/tasks");
  return actionOk(undefined);
}

/**
 * Which dispatch failures park a task rather than erroring, and where. Moved
 * verbatim from the `POST /tasks/:id/run` handler this replaces — see that
 * handler's original comment (git history) for the full rationale.
 */
const TASK_PARK_STATUS: Partial<Record<EnqueueFailureReason, string>> = {
  project_not_available: "project_not_available",
  no_runtime_available: "todo",
};

/** Moved verbatim from the `POST /tasks/:id/run` handler this replaces. */
export async function runTaskAction(id: string): Promise<ActionResult<Task>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: task, error: readError } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .single();
  if (readError || !task) return actionFail("Not Found");

  if (!task.assigned_agent_id) {
    return actionFail("This task has no assigned agent.", "no_agent_assigned");
  }

  const { data, error } = await ctx.supabase.rpc("start_run", {
    p_agent_id: task.assigned_agent_id,
    p_prompt: task.description?.trim() || task.title,
    p_project_id: task.project_id ?? null,
    p_task_id: task.id,
    p_target_runtime_id: task.target_runtime_id ?? null,
    p_trigger: "task",
    p_trigger_ref: task.id,
    p_lane: "foreground",
  });

  if (error) {
    const failure = enqueueFailureFrom(error);
    if (!failure) return actionErrorFrom(error);

    const parkedStatus = TASK_PARK_STATUS[failure.reason];
    if (!parkedStatus) return actionFail(failure.message, failure.reason);

    const { data: parked, error: parkError } = await ctx.supabase
      .from("tasks")
      .update({ status: parkedStatus, result: failure.message })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", task.id)
      .select()
      .single();
    if (parkError) return actionErrorFrom(parkError);

    revalidatePath("/tasks");
    return actionOk(toCamel(parked, TASKS_OPAQUE) as Task);
  }

  // start_run already moved the task to in_progress and stamped run_id, in
  // the same transaction as the run and the command. Re-read rather than
  // returning the stale copy this action started with.
  const { data: updated } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", task.id)
    .single();

  revalidatePath("/tasks");
  return actionOk(
    toCamel(updated ?? { ...task, run_id: (data as { id?: string } | null)?.id ?? null }, TASKS_OPAQUE) as Task,
  );
}

/** Moved verbatim from the `POST /tasks/:id/approve` handler this replaces. */
export async function approveTaskAction(id: string): Promise<ActionResult<Task>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({ status: "todo" })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/");
  revalidatePath("/tasks");
  return actionOk(toCamel(data, TASKS_OPAQUE) as Task);
}

/**
 * Moved verbatim from the `POST /tasks/:id/deny` handler this replaces —
 * including that handler's existing gap: `reason` is accepted here only to
 * match the call site's shape. The original handler never read `body` at
 * all, so the deny reason the owner types has never been persisted or sent
 * anywhere. Not fixed here; this is an unchanged, pre-existing behavior.
 */
export async function denyTaskAction(id: string, _reason?: string): Promise<ActionResult<Task>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({ status: "failed" })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/");
  revalidatePath("/tasks");
  return actionOk(toCamel(data, TASKS_OPAQUE) as Task);
}

export interface AnswerResult {
  applied: boolean;
  reason?: string;
  task: Task | null;
  questions: TaskQuestion[];
}

/**
 * `PATCH /tasks/:id/answer` never actually existed as a reachable route —
 * only a `POST` version was registered, and the hook this replaces called
 * `PATCH`, so it 404'd unconditionally before this task. That POST handler
 * also only handled one `{questionId, answer}` pair, not the array
 * `AnswerInput.answers` actually carries, and always returned
 * `{applied: false, reason: "no runtime paired"}` — nothing was ever
 * reachably "moved verbatim" here.
 *
 * This writes every answer in the array to `task_questions`, then advances
 * the task from `blocked` to `blocked_answered` — the exact transition
 * `packages/shared/src/schemas/task.ts`'s `TaskStatus` comment names for this
 * moment ("answer written, awaiting the wake transition"). It does not, and
 * cannot from here, confirm a live run picked the answer up — that "wake" is
 * a runtime-side concern this Server Action has no path to. `applied` stays
 * `false` so the caller shows the same honest "answer saved" messaging it
 * always has; this is not a regression, since no caller ever observed
 * anything else (the route never worked).
 */
export async function answerTaskAction(
  taskId: string,
  answers: { questionId: string; answer: string }[],
): Promise<ActionResult<AnswerResult>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  for (const a of answers) {
    const { error } = await ctx.supabase
      .from("task_questions")
      .update({ answer: a.answer, answered_at: new Date().toISOString() })
      .eq("workspace_id", ctx.workspaceId)
      .eq("task_id", taskId)
      .eq("id", a.questionId);
    if (error) return actionErrorFrom(error);
  }

  const { data: task, error: taskErr } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", taskId)
    .single();
  if (taskErr) return actionErrorFrom(taskErr);

  let updatedTask = task;
  if (task && task.status === "blocked") {
    const { data: woken, error: wakeErr } = await ctx.supabase
      .from("tasks")
      .update({ status: "blocked_answered" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", taskId)
      .select()
      .single();
    if (wakeErr) return actionErrorFrom(wakeErr);
    updatedTask = woken;
  }

  const { data: questions, error: qErr } = await ctx.supabase
    .from("task_questions")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("task_id", taskId);
  if (qErr) return actionErrorFrom(qErr);

  revalidatePath("/");
  revalidatePath("/tasks");
  return actionOk({
    applied: false,
    task: updatedTask ? (toCamel(updatedTask, TASKS_OPAQUE) as Task) : null,
    questions: toCamel(questions ?? []) as TaskQuestion[],
  });
}
