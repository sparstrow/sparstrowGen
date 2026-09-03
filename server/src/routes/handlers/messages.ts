import { registerRoute, ok, HandlerContext } from "../router";

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
