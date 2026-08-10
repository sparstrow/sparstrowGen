import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

registerRoute({
  method: "GET",
  pattern: "/agents",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.agents as string[]);
  }
});

registerRoute({
  method: "POST",
  pattern: "/agents",
  opaqueKeys: OPAQUE_COLUMNS.agents as string[],
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const payload = {
      ...body,
      workspace_id: workspaceId,
      id: body.id || generateId("agt_")
    };
    const { data, error } = await supabase
      .from("agents")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.agents as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/agents/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data, OPAQUE_COLUMNS.agents as string[]);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/agents/:id",
  opaqueKeys: OPAQUE_COLUMNS.agents as string[],
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agents")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.agents as string[]);
  }
});

registerRoute({
  method: "DELETE",
  pattern: "/agents/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { error } = await supabase
      .from("agents")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", params.id);
    if (error) throw error;
    return noContent();
  }
});

registerRoute({
  method: "GET",
  pattern: "/agents/:id/skills",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agent_skills")
      .select("*, skills(*)")
      .eq("workspace_id", workspaceId)
      .eq("agent_id", params.id);
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/agents/:id/skills",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const skillIds: string[] = body.skillIds || body.skill_ids || [];
    const { error: delError } = await supabase
      .from("agent_skills")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("agent_id", params.id);
    if (delError) throw delError;

    if (skillIds.length > 0) {
      const inserts = skillIds.map(id => ({
        workspace_id: workspaceId,
        agent_id: params.id,
        skill_id: id
      }));
      const { error: insError } = await supabase
        .from("agent_skills")
        .insert(inserts);
      if (insError) throw insError;
    }
    return ok({ success: true });
  }
});

registerRoute({
  method: "POST",
  pattern: "/agents/:id/promote",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agents")
      .update({ status: "active" })
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.agents as string[]);
  }
});

registerRoute({
  method: "POST",
  pattern: "/agents/:id/discard",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agents")
      .update({ status: "discarded" })
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.agents as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/agents/imports",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agent_imports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/agents/imports/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agent_imports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data);
  }
});
