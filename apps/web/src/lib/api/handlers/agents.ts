import { registerRoute, ok, fail, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "@sparstrow/shared";

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
  // The endpoint is /agents/imports for historical reasons, but the table is
  // `skill_imports` -- there is no agent_imports table in the schema. The UI
  // types this as SkillImport[] (packages/ui/src/api/hooks.ts).
  pattern: "/agents/imports",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("skill_imports")
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
      .from("skill_imports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data);
  }
});
