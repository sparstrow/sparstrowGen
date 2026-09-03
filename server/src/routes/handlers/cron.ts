import { registerRoute, ok, fail, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "@sparstrow/shared";

registerRoute({
  method: "GET",
  pattern: "/cron-jobs",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("cron_jobs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.cron_jobs as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/cron-jobs/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("cron_jobs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data, OPAQUE_COLUMNS.cron_jobs as string[]);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/cron-jobs/:id",
  opaqueKeys: OPAQUE_COLUMNS.cron_jobs as string[],
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("cron_jobs")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.cron_jobs as string[]);
  }
});

