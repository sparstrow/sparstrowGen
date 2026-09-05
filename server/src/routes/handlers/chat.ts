import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import {
  CHAT_MESSAGE_MAX_BYTES,
  OPAQUE_COLUMNS,
  attachmentsByMessageId,
  chatTurnFailureFrom,
  executionModeForProvider,
} from "@sparstrow/shared";

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
  ...((OPAQUE_COLUMNS.chat_turns as string[]) ?? []),
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

// ─── Writes ─────────────────────────────────────────────────────────────────
//
// Ported from `apps/web/src/app/chat/actions.ts` by restructure Phase 5's first
// slice. These are the routes the DESKTOP app needs: a Server Action is
// callable only from inside a Next render, so as long as sending a message was
// one, the desktop app could never send a message. That is the whole thesis of
// the restructure, reduced to one feature.
//
// Behaviour is deliberately unchanged from the actions they replace, including
// the error text — `apps/web` keeps calling its actions until Phase 5 finishes,
// and two code paths that answer differently would be worse than either.

const CHAT_SESSION_KINDS = ["free", "project", "agent", "agent-creator"];
const CHAT_SESSIONS_OPAQUE = OPAQUE_COLUMNS.chat_sessions as string[];

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * `TextEncoder`, not `Buffer.byteLength`.
 *
 * Identical for UTF-8 byte counting, and it keeps this handler free of
 * Node-only globals — the registry is deliberately portable, which is what let
 * it move hosts at all.
 */
function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

registerRoute({
  method: "POST",
  pattern: "/chat/sessions",
  opaqueKeys: CHAT_SESSIONS_OPAQUE,
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const kind = input.kind as string;
    if (!CHAT_SESSION_KINDS.includes(kind)) {
      return fail(400, `kind must be one of ${CHAT_SESSION_KINDS.join(", ")}.`);
    }

    let provider = (input.provider as string | null) ?? null;
    let model = (input.model as string | null) ?? null;
    let projectId: string | null = null;
    let agentId: string | null = null;

    if (kind === "project") {
      if (!input.project_id || typeof input.project_id !== "string") {
        return fail(400, "projectId is required for a project chat.");
      }
      const { data: project, error } = await supabase
        .from("projects")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", input.project_id)
        .maybeSingle();
      if (error) throw error;
      if (!project) return fail(404, `project not found: ${input.project_id}`);
      projectId = project.id as string;
      provider = provider ?? "claude-code";
      model = model ?? "sonnet";
    } else if (kind === "agent") {
      if (!input.agent_id || typeof input.agent_id !== "string") {
        return fail(400, "agentId is required for an agent chat.");
      }
      const { data: agent, error } = await supabase
        .from("agents")
        .select("id, provider, model")
        .eq("workspace_id", workspaceId)
        .eq("id", input.agent_id)
        .maybeSingle();
      if (error) throw error;
      if (!agent) return fail(404, `agent not found: ${input.agent_id}`);
      if (executionModeForProvider(agent.provider) !== "cli") {
        return fail(400, `chat supports CLI providers only (got ${agent.provider})`);
      }
      agentId = agent.id as string;
      projectId = typeof input.project_id === "string" ? input.project_id : null;
      provider = agent.provider as string;
      model = agent.model as string;
    } else {
      // free / agent-creator: no binding, defaults only.
      provider = provider ?? "claude-code";
      model = model ?? "sonnet";
    }

    if (provider && executionModeForProvider(provider) !== "cli") {
      return fail(400, `chat supports CLI providers only (got ${provider})`);
    }

    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        id: generateId("chs_"),
        workspace_id: workspaceId,
        kind,
        title: typeof input.title === "string" ? input.title : "",
        project_id: projectId,
        agent_id: agentId,
        provider,
        model,
        status: "active",
        draft: kind === "agent-creator" ? {} : null,
        last_message_at: null,
      })
      .select()
      .single();
    if (error) throw error;

    return ok(data, CHAT_SESSIONS_OPAQUE);
  },
});

registerRoute({
  method: "PATCH",
  pattern: "/chat/sessions/:id",
  opaqueKeys: CHAT_SESSIONS_OPAQUE,
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const input = (body ?? {}) as Record<string, unknown>;
    // Exactly the columns `ChatSessionUpdate` carries. An allowlist rather than
    // a passthrough: `workspace_id` and `kind` are not things a caller may
    // rewrite, and letting a body decide which columns are touched is how a
    // session ends up moved into another workspace.
    const patch: Record<string, unknown> = {};
    for (const key of ["title", "status", "provider", "model"]) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    if (Object.keys(patch).length === 0) return fail(400, "Nothing to update.");

    if (typeof patch.provider === "string" && executionModeForProvider(patch.provider) !== "cli") {
      return fail(400, `chat supports CLI providers only (got ${patch.provider})`);
    }

    const { data, error } = await supabase
      .from("chat_sessions")
      .update(patch)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;

    return ok(data, CHAT_SESSIONS_OPAQUE);
  },
});

registerRoute({
  method: "DELETE",
  pattern: "/chat/sessions/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", params.id);
    if (error) throw error;
    // The bucket objects behind this session's attachments are NOT removed —
    // storage has no foreign key to any of this. That is `G-53`, unchanged by
    // this move and deliberately not quietly fixed inside a port.
    return noContent();
  },
});

registerRoute({
  method: "POST",
  pattern: "/chat/sessions/:id/messages",
  opaqueKeys: CHAT_TURN_OPAQUE_KEYS,
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const input = (body ?? {}) as Record<string, unknown>;

    const { data: session, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("id, kind")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!session) return fail(404, "That chat session does not exist.");
    if (session.kind === "agent-creator") {
      return fail(409, "Sending a message is not available for agent-creator sessions.");
    }

    const content = typeof input.content === "string" ? input.content : "";
    const attachments = Array.isArray(input.attachments) ? input.attachments : [];

    // A message with an attachment but no text must still be sendable (CS6's
    // own Trap); only refuse when there is neither.
    if (!content.trim() && attachments.length === 0) {
      return fail(400, "content is required.");
    }
    if (utf8Bytes(content) > CHAT_MESSAGE_MAX_BYTES) {
      return fail(400, `content must not exceed ${CHAT_MESSAGE_MAX_BYTES} bytes`);
    }

    // `enqueue_chat_turn` dispatches SYNCHRONOUSLY inside its own transaction
    // when a runtime is already online — the common case, not the edge case —
    // so the attachment rows must exist before it runs. It creates them itself
    // for exactly that reason; an insert after this call would have missed
    // every dispatch's payload. See `026_chat_attachments_dispatch.sql`.
    const { data, error } = await supabase.rpc("enqueue_chat_turn", {
      p_session_id: params.id,
      p_content: content,
      p_attachments: attachments.map((a) => {
        const att = a as Record<string, unknown>;
        return {
          storage_path: att.storage_path,
          filename: att.filename,
          mime_type: att.mime_type,
          size_bytes: att.size_bytes,
        };
      }),
    });

    if (error) {
      // A recognised `enqueue_chat_turn` failure carries a stable reason the UI
      // switches on. Anything else is rethrown rather than laundered into a
      // tidy 409 that tells someone their session is busy when the truth is
      // that the database is down.
      const failure = chatTurnFailureFrom(error);
      if (!failure) throw error;
      return fail(failure.status, failure.message, failure.reason);
    }

    return ok(
      await turnStateRow(supabase, workspaceId, data as Record<string, unknown>),
      CHAT_TURN_OPAQUE_KEYS,
    );
  },
});
