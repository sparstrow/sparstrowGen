import { registerRoute, ok, fail, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

registerRoute({
  method: "GET",
  pattern: "/skills",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("skills")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/skills/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("skills")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/skills/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("skills")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/skills/assignments",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agent_skills")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/skills/assignments",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    // Expected body: { assignments: { agentId, skillId }[] }
    //
    // T-M2-04 calls for a set operation "inside one request", and the delete
    // and insert genuinely must be one transaction: as two PostgREST calls, an
    // insert that fails after the delete committed wipes every assignment in
    // the workspace. PostgREST cannot span statements, so this goes through an
    // RPC (policies/006_agent_skill_assignments_rpc.sql). It is SECURITY
    // INVOKER, so RLS still applies to both halves.
    const assignments = (body.assignments || []).map((a: any) => ({
      agent_id: a.agent_id || a.agentId,
      skill_id: a.skill_id || a.skillId,
    }));

    if (assignments.some((a: any) => !a.agent_id || !a.skill_id)) {
      return fail(400, "each assignment requires agentId and skillId");
    }

    const { data, error } = await supabase.rpc("set_agent_skill_assignments", {
      p_workspace_id: workspaceId,
      p_assignments: assignments,
    });
    if (error) throw error;
    return ok(data ?? []);
  }
});
