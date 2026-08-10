import { registerRoute, ok, fail, HandlerContext } from "../router";

registerRoute({
  method: "GET",
  pattern: "/chat/sessions",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/chat/sessions/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data: session, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (sessionErr) return fail(404, "Not Found");

    const { data: messages, error: messagesErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("session_id", params.id)
      .order("created_at", { ascending: true });
    if (messagesErr) throw messagesErr;

    return ok({
      ...session,
      messages: messages || []
    });
  }
});
