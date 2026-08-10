import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

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
  method: "POST",
  pattern: "/skills",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const payload = {
      ...body,
      workspace_id: workspaceId,
      id: body.id || generateId("skl_")
    };
    const { data, error } = await supabase
      .from("skills")
      .insert(payload)
      .select()
      .single();
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
  method: "PUT",
  pattern: "/skills/:id", // hooks.ts says PUT /skills/:id
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
  method: "DELETE",
  pattern: "/skills/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { error } = await supabase
      .from("skills")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", params.id);
    if (error) throw error;
    return noContent();
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
    // Expected body: { assignments: { agent_id, skill_id }[] }
    const assignments = body.assignments || [];
    
    // Delete all for workspace, then insert? 
    // Wait, deleting all for workspace might be dangerous if multiple clients exist.
    // T-M2-04 says: "/skills/assignments write agent_skills as a set operation — delete-then-insert inside one request"
    // I will delete all assignments for this workspace, then insert the new ones.
    const { error: delError } = await supabase
      .from("agent_skills")
      .delete()
      .eq("workspace_id", workspaceId);
    if (delError) throw delError;

    if (assignments.length > 0) {
      const inserts = assignments.map((a: any) => ({
        workspace_id: workspaceId,
        agent_id: a.agent_id || a.agentId,
        skill_id: a.skill_id || a.skillId
      }));
      const { error: insError } = await supabase
        .from("agent_skills")
        .insert(inserts);
      if (insError) throw insError;
    }
    
    const { data, error } = await supabase
      .from("agent_skills")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (error) throw error;
    return ok(data);
  }
});
