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

// The UI calls this (useCreateMessage in packages/ui/src/api/hooks.ts), but
// only GET /messages and the mark-read action were registered, so composing a
// message 404'd. `from_type` and `body` are NOT NULL with no default, and the
// UI's MessageCreate omits status/id, so both are supplied here.
registerRoute({
  method: "POST",
  pattern: "/messages",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    if (!body || typeof body.body !== "string" || body.body.length === 0) {
      return fail(400, "body is required");
    }

    const payload = {
      ...body,
      workspace_id: workspaceId,
      id: body.id || `msg_${crypto.randomUUID().replace(/-/g, "")}`,
      // A message composed through the web app comes from the user, not an
      // agent. Agents write to this table through the daemon, not this route.
      from_type: body.from_type ?? "user",
      subject: body.subject ?? "",
      status: body.status ?? "unread",
    };

    const { data, error } = await supabase
      .from("messages")
      .insert(payload)
      .select()
      .single();
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
