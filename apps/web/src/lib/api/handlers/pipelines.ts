import { registerRoute, ok, fail, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "@sparstrow/shared";

registerRoute({
  method: "GET",
  pattern: "/pipelines",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.pipelines as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/pipelines/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data, OPAQUE_COLUMNS.pipelines as string[]);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/pipelines/:id",
  opaqueKeys: OPAQUE_COLUMNS.pipelines as string[],
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("pipelines")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.pipelines as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/pipelines/:id/runs",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("pipeline_id", params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});
