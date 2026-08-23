import { CHAT_MESSAGE_MAX_BYTES, executionModeForProvider } from "@sparstrow/shared";
import { registerRoute, ok, fail, HandlerContext } from "../router";
import { chatTurnFailureFrom } from "../enqueue";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

const CHAT_SESSION_KINDS = ["free", "project", "agent", "agent-creator"];

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

function agentCreatorNotAvailable(action: string) {
  return fail(
    501,
    `${action} in an Agent Creator session runs on the local daemon and is not available from the web app.`,
  );
}

/**
 * Shapes a `chat_turns` row (as returned by `enqueue_chat_turn` /
 * `retry_chat_turn`'s `to_jsonb(t)`, or read directly for GET) into the
 * `ChatTurnState` contract by attaching the turn's user/assistant messages.
 * Written once because three routes need it (T-M13-01 decision 2): the two
 * mutations below and `GET /chat/sessions/:id`'s `activeTurn`.
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

  const userMessage = (messages ?? []).find((m: any) => m.role === "user") ?? null;
  const assistantMessage = (messages ?? []).find((m: any) => m.role === "assistant") ?? null;

  return {
    ...turnRow,
    user_message: userMessage,
    assistant_message: assistantMessage,
  };
}

/**
 * BUG-2026-08-22-chat-new-session-404s: this route never existed, so the
 * empty-chat composer's "Send message" 404'd on the very first message of
 * every new conversation. `packages/core/src/api/routes/chat.ts` (the daemon)
 * has always had the real thing — same validation, same row shape — because
 * `chat_sessions`/`chat_messages` are cloud-canonical (see the pgTable doc
 * comment in packages/shared/src/db/schema.ts): sessions are lightweight
 * metadata rows, not a dispatched run, so creating one needs no paired
 * machine. `POST /chat/sessions/:id/messages` and `.../retry` were the two
 * stubs sitting next to this one at the time — real handlers below them now
 * (M13). This mirrors core's `createChatSession` validation so the two
 * implementations don't drift.
 */
registerRoute({
  method: "POST",
  pattern: "/chat/sessions",
  opaqueKeys: OPAQUE_COLUMNS.chat_sessions as string[],
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const kind = body?.kind;
    if (!CHAT_SESSION_KINDS.includes(kind)) {
      return fail(400, `kind must be one of ${CHAT_SESSION_KINDS.join(", ")}.`);
    }

    let provider: string | null = body.provider ?? null;
    let model: string | null = body.model ?? null;
    let projectId: string | null = null;
    let agentId: string | null = null;

    if (kind === "project") {
      if (!body.project_id || typeof body.project_id !== "string") {
        return fail(400, "projectId is required for a project chat.");
      }
      const { data: project, error } = await supabase
        .from("projects")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", body.project_id)
        .maybeSingle();
      if (error) throw error;
      if (!project) return fail(404, `project not found: ${body.project_id}`);
      projectId = project.id;
      provider = provider ?? "claude-code";
      model = model ?? "sonnet";
    } else if (kind === "agent") {
      if (!body.agent_id || typeof body.agent_id !== "string") {
        return fail(400, "agentId is required for an agent chat.");
      }
      const { data: agent, error } = await supabase
        .from("agents")
        .select("id, provider, model")
        .eq("workspace_id", workspaceId)
        .eq("id", body.agent_id)
        .maybeSingle();
      if (error) throw error;
      if (!agent) return fail(404, `agent not found: ${body.agent_id}`);
      if (executionModeForProvider(agent.provider) !== "cli") {
        return fail(400, `chat supports CLI providers only (got ${agent.provider})`);
      }
      agentId = agent.id;
      projectId = typeof body.project_id === "string" ? body.project_id : null;
      provider = agent.provider;
      model = agent.model;
    } else {
      // free / agent-creator: no binding, defaults only.
      provider = provider ?? "claude-code";
      model = model ?? "sonnet";
    }

    if (provider && executionModeForProvider(provider) !== "cli") {
      return fail(400, `chat supports CLI providers only (got ${provider})`);
    }

    const row = {
      id: generateId("chs_"),
      workspace_id: workspaceId,
      kind,
      title: typeof body.title === "string" ? body.title : "",
      project_id: projectId,
      agent_id: agentId,
      provider,
      model,
      status: "active",
      draft: kind === "agent-creator" ? {} : null,
      last_message_at: null,
    };

    const { data, error } = await supabase.from("chat_sessions").insert(row).select().single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.chat_sessions as string[]);
  }
});

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

    return ok(
      {
        ...session,
        messages: messages || [],
        active_turn: activeTurn,
      },
      CHAT_TURN_OPAQUE_KEYS,
    );
  }
});

/**
 * POST /chat/sessions/:id/messages -- the owner sends a message.
 *
 * `enqueue_chat_turn` (packages/shared/drizzle/policies/014_chat_turn_dispatch.sql)
 * does the real work: inserts the turn and the user message in one
 * transaction, and never raises for "nothing is online" (DD-3) -- a `waiting`
 * turn with a `waitingReason` comes back instead, which is why there is no
 * "no runtime available" branch here the way `POST /runs` has one. Only a bad
 * session id or an already-in-flight turn is a hard error, mapped by
 * `chatTurnFailureFrom`.
 *
 * Agent Creator sessions are refused here on purpose: `enqueue_chat_turn`'s
 * own header says it does not accept their `draft` payload, and the calling
 * route -- this one -- is what must not call it for one. They keep the local,
 * non-dispatched path (T-M13-01 decision 4).
 */
registerRoute({
  method: "POST",
  pattern: "/chat/sessions/:id/messages",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data: session, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("id, kind")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!session) return fail(404, "That chat session does not exist.");
    if (session.kind === "agent-creator") return agentCreatorNotAvailable("Sending a message");

    const content = typeof body?.content === "string" ? body.content : "";
    if (!content.trim()) return fail(400, "content is required.");
    if (Buffer.byteLength(content, "utf8") > CHAT_MESSAGE_MAX_BYTES) {
      // DD-8's one clamp at this boundary: a chat message becomes an
      // argv-bound prompt on someone's machine, and an unbounded one is a
      // spawn failure on a laptop rather than a 400 here.
      return fail(400, `content must not exceed ${CHAT_MESSAGE_MAX_BYTES} bytes`);
    }

    const { data, error } = await supabase.rpc("enqueue_chat_turn", {
      p_session_id: params.id,
      p_content: content,
    });

    if (error) {
      const failure = chatTurnFailureFrom(error);
      if (!failure) throw error;
      return fail(failure.status, failure.message, failure.reason);
    }

    return ok(await turnStateRow(supabase, workspaceId, data), CHAT_TURN_OPAQUE_KEYS);
  }
});

/**
 * POST /chat/sessions/:id/retry -- re-ask without retyping (US3).
 *
 * `retry_chat_turn` takes a TURN id, not a session id, so this resolves the
 * session's latest turn first -- passing `params.id` straight through would
 * raise SPG18 (turn_not_found) on every call, a failure that looks like a
 * missing row rather than a wrong argument.
 */
registerRoute({
  method: "POST",
  pattern: "/chat/sessions/:id/retry",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data: session, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("id, kind")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!session) return fail(404, "That chat session does not exist.");
    if (session.kind === "agent-creator") return agentCreatorNotAvailable("Retrying");

    const { data: latestTurn, error: latestErr } = await supabase
      .from("chat_turns")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("session_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw latestErr;
    if (!latestTurn) return fail(404, "This session has no turn to retry.");

    const { data, error } = await supabase.rpc("retry_chat_turn", {
      p_turn_id: latestTurn.id,
      p_provider: typeof body?.provider === "string" ? body.provider : null,
      p_model: typeof body?.model === "string" ? body.model : null,
    });

    if (error) {
      const failure = chatTurnFailureFrom(error);
      if (!failure) throw error;
      return fail(failure.status, failure.message, failure.reason);
    }

    return ok(await turnStateRow(supabase, workspaceId, data), CHAT_TURN_OPAQUE_KEYS);
  }
});
