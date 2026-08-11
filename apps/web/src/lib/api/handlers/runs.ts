import { registerRoute, ok, fail, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";
import { enqueueFailureFrom } from "../enqueue";

registerRoute({
  method: "GET",
  pattern: "/runs",
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    let query = supabase
      .from("runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    const agentId = searchParams.get("agentId");
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    let limitStr = searchParams.get("limit");
    let limit = 500;
    
    if (limitStr) {
      limit = Math.min(500, parseInt(limitStr, 10));
    }
    query = query.limit(limit);

    if (agentId) query = query.eq("agent_id", agentId);
    if (projectId) query = query.eq("project_id", projectId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/runs/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data);
  }
});

/**
 * M4. Start a run on a paired machine.
 *
 * Everything that makes this correct is in `start_run` (009): choosing an
 * online, capable, project-bound runtime, and creating the run row and its
 * dispatch command in ONE transaction. Split across two round trips, a partial
 * failure leaves a run no daemon will ever claim — a spinner that never
 * resolves — which is M2's defect 2 in a more visible place.
 *
 * This handler's whole job is translating that function's error contract into
 * HTTP, which is why the mapping lives in `../enqueue.ts` and is tested there.
 */
registerRoute({
  method: "POST",
  pattern: "/runs",
  opaqueKeys: OPAQUE_COLUMNS.runs as string[],
  handler: async ({ supabase, body }: HandlerContext) => {
    const agentId = body?.agent_id;
    const prompt = body?.prompt;

    if (!agentId || typeof agentId !== "string") {
      return fail(400, "agentId is required.", "agent_not_found");
    }
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return fail(400, "A prompt is required to start a run.", "agent_not_found");
    }

    // No workspace id is passed. `start_run` resolves it from the agent, having
    // first checked the caller belongs to that workspace — the same shape as
    // every RLS policy in 001. A workspace id from the request would be a
    // parameter the caller controls on a SECURITY DEFINER function.
    const { data, error } = await supabase.rpc("start_run", {
      p_agent_id: agentId,
      p_prompt: prompt,
      p_project_id: body?.project_id ?? null,
      p_task_id: body?.task_id ?? null,
      p_target_runtime_id: body?.target_runtime_id ?? null,
      p_trigger: body?.trigger ?? "manual",
      p_trigger_ref: body?.trigger_ref ?? null,
      p_lane: body?.lane ?? "foreground",
    });

    if (error) {
      const failure = enqueueFailureFrom(error);
      // Rethrow anything unrecognised. A connection failure dressed up as a
      // tidy 409 would send the user to check their machines over a bug here.
      if (!failure) throw error;
      return fail(failure.status, failure.message, failure.reason);
    }

    return ok(data, OPAQUE_COLUMNS.runs as string[]);
  }
});

/**
 * Ask the machine executing a run to stop.
 *
 * Cancelling a run that has already finished is NOT an error: the button was
 * correct when the page rendered, and a race with completion is ordinary. The
 * RPC returns the run unchanged and enqueues nothing, so this returns 200.
 */
registerRoute({
  method: "POST",
  pattern: "/runs/:id/cancel",
  handler: async ({ supabase, params }: HandlerContext) => {
    const { data, error } = await supabase.rpc("cancel_run", { p_run_id: params.id });

    if (error) {
      const failure = enqueueFailureFrom(error);
      if (!failure) throw error;
      return fail(failure.status, failure.message, failure.reason);
    }

    return ok(data, OPAQUE_COLUMNS.runs as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/runs/:id/events",
  handler: async ({ supabase, workspaceId, params, searchParams }: HandlerContext) => {
    const afterSeqStr = searchParams.get("afterSeq");
    const limitStr = searchParams.get("limit");
    
    const afterSeq = afterSeqStr ? parseInt(afterSeqStr, 10) : -1;
    let limit = limitStr ? parseInt(limitStr, 10) : 500;
    if (limit > 2000) limit = 2000;

    const { data, error } = await supabase
      .from("run_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("run_id", params.id)
      .gt("seq", afterSeq)
      .order("seq", { ascending: true })
      .limit(limit);
    if (error) throw error;
    
    return ok(data, OPAQUE_COLUMNS.run_events as string[]);
  }
});
