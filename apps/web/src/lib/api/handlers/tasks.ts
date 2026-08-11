import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

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
          kind: "question",
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
        kind: "approval",
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
        kind: "review",
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
        kind: "contradiction",
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
