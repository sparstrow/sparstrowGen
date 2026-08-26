import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";
import { enqueueFailureFrom } from "../enqueue";
import type { EnqueueFailureReason } from "@sparstrow/shared";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Which dispatch failures park a task rather than erroring, and where.
 *
 * Only the ones a user can act on from the board. `project_not_available` is
 * the status the four recovery actions hang off; `no_runtime_available` goes
 * back to `todo`, because "every machine is off right now" is a statement about
 * this moment, not about the task — parking it under a project-shaped status
 * would send the user hunting for a project problem that does not exist.
 *
 * Anything absent from this map is returned as an HTTP error: a disabled agent
 * or a missing one is a configuration mistake, and quietly parking it would
 * hide the mistake behind a status that blames the machines.
 */
const TASK_PARK_STATUS: Partial<Record<EnqueueFailureReason, string>> = {
  project_not_available: "project_not_available",
  no_runtime_available: "todo",
};

registerRoute({
  method: "GET",
  pattern: "/tasks",
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    let query = supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    
    const status = searchParams.get("status");
    const assignedAgentId = searchParams.get("assignedAgentId");
    const teamId = searchParams.get("teamId");
    const projectId = searchParams.get("projectId");

    if (status) query = query.eq("status", status);
    if (assignedAgentId) query = query.eq("assigned_agent_id", assignedAgentId);
    if (teamId) query = query.eq("team_id", teamId);
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.tasks as string[]);
  }
});

registerRoute({
  method: "POST",
  pattern: "/tasks",
  opaqueKeys: OPAQUE_COLUMNS.tasks as string[],
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const payload = {
      ...body,
      workspace_id: workspaceId,
      id: body.id || generateId("tsk_")
    };
    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.tasks as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/tasks/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data, OPAQUE_COLUMNS.tasks as string[]);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/tasks/:id",
  opaqueKeys: OPAQUE_COLUMNS.tasks as string[],
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("tasks")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.tasks as string[]);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/tasks/:id",
  opaqueKeys: OPAQUE_COLUMNS.tasks as string[],
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("tasks")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.tasks as string[]);
  }
});

registerRoute({
  method: "DELETE",
  pattern: "/tasks/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // .select() makes PostgREST return the deleted rows. Without it a
    // delete that matched nothing -- because the id is unknown OR because
    // RLS hid another workspace's row -- still resolves without error, and
    // this would answer 204. The client then optimistically drops a row it
    // never actually deleted.
    const { data: deleted, error } = await supabase
      .from("tasks")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select("id");
    if (error) throw error;
    if (!deleted || deleted.length === 0) return fail(404, "Not Found");
    return noContent();
  }
});

registerRoute({
  method: "POST",
  pattern: "/tasks/:id/answer",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    // "/tasks/:id/answer writes the answer only ... write task_questions.answer and answered_at ... return { applied: false, reason: "no runtime paired" }"
    const questionId = body.questionId || body.question_id;
    const answerStr = body.answer;
    
    // update the task_question
    const { error } = await supabase
      .from("task_questions")
      .update({
        answer: answerStr,
        answered_at: new Date().toISOString()
      })
      .eq("workspace_id", workspaceId)
      .eq("task_id", params.id)
      .eq("id", questionId);
      
    if (error) throw error;

    return ok({ applied: false, reason: "no runtime paired" });
  }
});

registerRoute({
  method: "POST",
  pattern: "/tasks/:id/approve",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: "todo" })
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.tasks as string[]);
  }
});

registerRoute({
  method: "POST",
  pattern: "/tasks/:id/deny",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: "failed" })
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.tasks as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/tasks/attention/queue",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const queue = [];

    // 1. question
    const { data: qData, error: qErr } = await supabase
      .from("task_questions")
      .select("*, tasks(*)")
      .eq("workspace_id", workspaceId)
      .is("answered_at", null);
    if (qErr) throw qErr;
    
    const now = Date.now();

    // task_questions timestamps the ask as `asked_at`; there is no created_at
    // column on this table. Reading created_at yields undefined -> NaN ageMs,
    // which sorts unpredictably and shows the queue in the wrong order.
    const tasksWithQuestions = new Map();
    for (const q of (qData || [])) {
      const qAge = now - new Date(q.asked_at).getTime();
      if (!tasksWithQuestions.has(q.task_id)) {
        tasksWithQuestions.set(q.task_id, {
          type: "question",
          task: q.tasks,
          questions: [],
          ageMs: qAge
        });
      }
      const item = tasksWithQuestions.get(q.task_id);
      item.questions.push(q);
      if (qAge > item.ageMs) item.ageMs = qAge;
    }
    for (const item of tasksWithQuestions.values()) {
      queue.push(item);
    }

    // 2. approval
    const { data: approvalData, error: approvalErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending_approval");
    if (approvalErr) throw approvalErr;
    for (const t of (approvalData || [])) {
      queue.push({
        type: "approval",
        task: t,
        ageMs: now - new Date(t.updated_at || t.created_at).getTime()
      });
    }

    // 3. review
    const { data: reviewData, error: reviewErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "review");
    if (reviewErr) throw reviewErr;
    for (const t of (reviewData || [])) {
      queue.push({
        type: "review",
        task: t,
        ageMs: now - new Date(t.updated_at || t.created_at).getTime()
      });
    }

    // 4. contradiction
    // memory_contradictions has no task_id column -- contradictions are raised
    // against note pairs (note_a / note_b), not tasks -- and no created_at;
    // the detection timestamp is `detected_at`. Filtering on task_id made
    // PostgREST reject the query outright, so this whole endpoint 500'd.
    const { data: contraData, error: contraErr } = await supabase
      .from("memory_contradictions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("resolved_at", null);
    if (contraErr) throw contraErr;
    for (const c of (contraData || [])) {
      queue.push({
        type: "contradiction",
        task: null, // "task: null variant"
        contradiction: c,
        ageMs: now - new Date(c.detected_at).getTime()
      });
    }

    // sort oldest-first (largest ageMs first)
    queue.sort((a, b) => b.ageMs - a.ageMs);

    return ok(queue);
  }
});

/**
 * M4. (Re)spawn a task's assignee on the machine that can run it.
 *
 * Where this deliberately differs from `POST /runs`: a run is an ACTION, and a
 * failed action is an error the user sees immediately. A task is a durable
 * board object, and refusing to place it right now says nothing about whether
 * it still needs doing. So a task that cannot be dispatched is PARKED, with the
 * reason on the row, and the response is 200 with the updated task.
 *
 * That is the plan's rule stated exactly: work targeted at a machine that does
 * not have the project must land in `project_not_available` with relink /
 * clone / unbind / reassign offered — not fail.
 */
registerRoute({
  method: "POST",
  pattern: "/tasks/:id/run",
  opaqueKeys: OPAQUE_COLUMNS.tasks as string[],
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data: task, error: readError } = await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();

    if (readError || !task) return fail(404, "Not Found");

    if (!task.assigned_agent_id) {
      // Not parked: this one is genuinely the caller's mistake, and parking it
      // would hide an unassigned task behind a status that suggests a machine
      // problem.
      return fail(400, "This task has no assigned agent.", "no_agent_assigned");
    }

    const { data, error } = await supabase.rpc("start_run", {
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
      if (!failure) throw error;

      const parkedStatus = TASK_PARK_STATUS[failure.reason];
      if (!parkedStatus) return fail(failure.status, failure.message, failure.reason);

      const { data: parked, error: parkError } = await supabase
        .from("tasks")
        .update({ status: parkedStatus, result: failure.message })
        .eq("workspace_id", workspaceId)
        .eq("id", task.id)
        .select()
        .single();
      if (parkError) throw parkError;

      return ok(parked, OPAQUE_COLUMNS.tasks as string[]);
    }

    // start_run already moved the task to in_progress and stamped run_id, in
    // the same transaction as the run and the command. Re-read rather than
    // returning the stale copy this handler started with.
    const { data: updated } = await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", task.id)
      .single();

    return ok(updated ?? { ...task, run_id: (data as { id?: string } | null)?.id ?? null },
      OPAQUE_COLUMNS.tasks as string[]);
  }
});
