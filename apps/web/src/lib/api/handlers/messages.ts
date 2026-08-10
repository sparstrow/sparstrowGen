import { registerRoute, ok, fail, HandlerContext } from "../router";

registerRoute({
  method: "GET",
  pattern: "/messages",
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    let query = supabase
      .from("messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    // Optional limit
    const limit = searchParams.get("limit");
    if (limit) {
      query = query.limit(parseInt(limit, 10));
    }

    const { data, error } = await query;
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "POST",
  pattern: "/messages/:id/mark-read",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("messages")
      .update({ status: "read" })
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});
