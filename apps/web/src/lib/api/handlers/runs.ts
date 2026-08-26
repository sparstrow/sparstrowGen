import { registerRoute, ok, fail, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

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
