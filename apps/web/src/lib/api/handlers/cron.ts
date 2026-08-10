import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

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
  method: "POST",
  pattern: "/cron-jobs",
  opaqueKeys: OPAQUE_COLUMNS.cron_jobs as string[],
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const payload = {
      ...body,
      workspace_id: workspaceId,
      id: body.id || generateId("crn_")
    };
    const { data, error } = await supabase
      .from("cron_jobs")
      .insert(payload)
      .select()
      .single();
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

registerRoute({
  method: "PUT",
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

registerRoute({
  method: "DELETE",
  pattern: "/cron-jobs/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // .select() makes PostgREST return the deleted rows. Without it a
    // delete that matched nothing -- because the id is unknown OR because
    // RLS hid another workspace's row -- still resolves without error, and
    // this would answer 204. The client then optimistically drops a row it
    // never actually deleted.
    const { data: deleted, error } = await supabase
      .from("cron_jobs")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select("id");
    if (error) throw error;
    if (!deleted || deleted.length === 0) return fail(404, "Not Found");
    return noContent();
  }
});
