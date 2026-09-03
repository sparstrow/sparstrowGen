import { registerRoute, ok, fail, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "@sparstrow/shared";
import { attachmentsByMessageId } from "@web/lib/chat-attachments";

/**
 * `chat_messages.meta` and `chat_sessions.draft` are jsonb -- see
 * OPAQUE_COLUMNS. Applies at any nesting depth (deepConvert matches by key
 * name alone), so this one flat list covers a session's own `draft`, a flat
 * message row's `meta`, AND a nested userMessage/assistantMessage's `meta`
 * inside a ChatTurnState -- no separate list per nesting level.
 *
 * `chat_turns` itself needs no entry: `error` is plain text, not jsonb
 * (DD-8, M12 plan). This is also the fix for a latent bug decomposition
 * found: `GET /chat/sessions/:id` was calling `ok()` with no opaque keys at
 * all, so `chat_sessions.draft` and every `chat_messages.meta` were being
 * key-camelized inside their own jsonb payloads.
 */
const CHAT_TURN_OPAQUE_KEYS = [
  ...(OPAQUE_COLUMNS.chat_sessions as string[]),
  ...(OPAQUE_COLUMNS.chat_messages as string[]),
];

/**
 * Shapes a `chat_turns` row into the `ChatTurnState` contract by attaching
 * the turn's user/assistant messages. `GET /chat/sessions/:id`'s
 * `activeTurn` is this route's own read of the same shape the two write
 * paths used to build (`enqueue_chat_turn`/`retry_chat_turn`'s `to_jsonb(t)`)
 * before `T-WA-07` moved them to `app/chat/actions.ts`'s
 * `postChatTurnAction`/`retryChatTurnAction`, which keep their own copy —
 * reads stay on the route layer (plan DD-5), writes don't.
 *
 * Returned still snake_case -- `ok()` camelizes on the way out, same as every
 * other handler in this file.
 */
async function turnStateRow(
  supabase: HandlerContext["supabase"],
  workspaceId: string,
  turnRow: Record<string, unknown>,
) {
  const { data: messages, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("turn_id", turnRow.id as string)
    .order("created_at", { ascending: true });
  if (error) throw error;

  // CS6 (T-CS6-01) — the user message this turn answers may carry an
  // attachment; embedded here so the composer's just-sent reply already
  // shows the chip without a second round trip.
  const attachmentMap = await attachmentsByMessageId(
    supabase,
    workspaceId,
    (messages ?? []).map((m: any) => m.id as string),
  );
  const withAttachments = (messages ?? []).map((m: any) => ({
    ...m,
    attachments: attachmentMap.get(m.id as string) ?? [],
  }));

  const userMessage = withAttachments.find((m: any) => m.role === "user") ?? null;
  const assistantMessage = withAttachments.find((m: any) => m.role === "assistant") ?? null;

  return {
    ...turnRow,
    user_message: userMessage,
    assistant_message: assistantMessage,
  };
}

registerRoute({
  method: "GET",
  pattern: "/chat/sessions",
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    let query = supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    const kind = searchParams.get("kind");
    const projectId = searchParams.get("projectId");
    const agentId = searchParams.get("agentId");
    const status = searchParams.get("status");
    if (kind) query = query.eq("kind", kind);
    if (projectId) query = query.eq("project_id", projectId);
    if (agentId) query = query.eq("agent_id", agentId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/chat/search",
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    const q = searchParams.get("q");
    const limitStr = searchParams.get("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : 20;

    if (!q) return fail(400, "Missing search query");

    // Supabase JS doesn't have an easy OR across joined tables directly using standard builder without PostgREST hacks, 
    // but we can use the textSearch or simply query messages and sessions separately, or use a Postgres function.
    // Given the architecture, doing two quick queries or using an `or` is fine.
    // The easiest way for now is querying sessions and matching sessions that have matching messages.
    
    // 1. Find sessions with matching title
    const { data: titleMatches, error: titleErr } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .ilike("title", `%${q}%`);
    if (titleErr) throw titleErr;

    // 2. Find sessions that contain a matching message
    const { data: messageMatches, error: msgErr } = await supabase
      .from("chat_messages")
      .select("session_id")
      .eq("workspace_id", workspaceId)
      .ilike("content", `%${q}%`)
      .limit(limit);
    if (msgErr) throw msgErr;

    const matchingSessionIds = (messageMatches ?? []).map((m: any) => m.session_id);
    
    let combinedSessions = [...(titleMatches ?? [])];
    
    if (matchingSessionIds.length > 0) {
      const { data: deepMatches, error: deepErr } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .in("id", matchingSessionIds);
      if (deepErr) throw deepErr;
      
      const existingIds = new Set(combinedSessions.map((s: any) => s.id));
      for (const ds of (deepMatches ?? [])) {
        if (!existingIds.has(ds.id)) {
          combinedSessions.push(ds);
        }
      }
    }

    // Sort by last message at
    combinedSessions.sort((a, b) => {
      const dateA = new Date(a.last_message_at ?? a.created_at).getTime();
      const dateB = new Date(b.last_message_at ?? b.created_at).getTime();
      return dateB - dateA; // Descending
    });

    return ok(combinedSessions.slice(0, limit));
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

    const { data: rawMessages, error: messagesErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("session_id", params.id)
      .order("created_at", { ascending: true });
    if (messagesErr) throw messagesErr;

    // CS6 (T-CS6-01) — a sent message's attachment chip must persist on
    // reload (US4 scenario 2), which means every message in the session's
    // history needs its attachments embedded here, not just the latest turn.
    const attachmentMap = await attachmentsByMessageId(
      supabase,
      workspaceId,
      (rawMessages ?? []).map((m: any) => m.id as string),
    );
    const messages = (rawMessages ?? []).map((m: any) => ({
      ...m,
      attachments: attachmentMap.get(m.id as string) ?? [],
    }));

    // M13 -- the session's most recent turn, terminal or not. This is what
    // makes a turn recoverable after a reload (FR-007): the mutation
    // response is gone once the page remounts, and this is the only source
    // left. `agent-creator` sessions never get a chat_turns row (they keep
    // the local path entirely), so this is null for them by construction.
    const { data: latestTurn, error: turnErr } = await supabase
      .from("chat_turns")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("session_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (turnErr) throw turnErr;

    const activeTurn = latestTurn ? await turnStateRow(supabase, workspaceId, latestTurn) : null;

    // `ChatSessionDetail` (packages/shared/src/schemas/chat.ts) is
    // `{ session, messages, activeTurn }` -- a NESTED session, matching what
    // the local host's GET handler has always returned
    // (server/src/api/routes/chat.ts) and what every consumer reads
    // (`detail.data?.session`, `detail.data.session.id`/`.draft` in
    // chat.tsx/agent-create.tsx). The prior shape here spread the session's
    // columns onto the top level instead -- undetected until this pass
    // actually exercised a real cloud session through the browser UI rather
    // than through direct HTTP/SQL, because that is the only way this
    // mismatch is observable.
    return ok(
      {
        session,
        messages: messages || [],
        active_turn: activeTurn,
      },
      CHAT_TURN_OPAQUE_KEYS,
    );
  }
});
