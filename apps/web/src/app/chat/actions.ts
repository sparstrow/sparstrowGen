"use server";

import { revalidatePath } from "next/cache";
import { CHAT_MESSAGE_MAX_BYTES, executionModeForProvider } from "@sparstrow/shared";
import type {
  ChatRetryRequest,
  ChatSession,
  ChatSessionCreate,
  ChatSessionUpdate,
  ChatTurnRequest,
  ChatTurnState,
} from "@sparstrow/shared";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  toCamel,
  toSnake,
  NOT_SIGNED_IN,
  type ActionContext,
  type ActionResult,
} from "@web/lib/action-result";
import { chatTurnFailureFrom } from "@web/lib/api/enqueue";
import { attachmentsByMessageId } from "@web/lib/chat-attachments";
import { OPAQUE_COLUMNS } from "@web/lib/case";

const CHAT_SESSIONS_OPAQUE = ["draft"];
const CHAT_SESSION_KINDS = ["free", "project", "agent", "agent-creator"];

/** Same flat list `handlers/chat.ts` uses — covers a session's own `draft`
 *  and a flat/nested message's `meta` at any depth (deepConvert matches by
 *  key name alone), including the userMessage/assistantMessage nested inside
 *  a ChatTurnState. */
const CHAT_TURN_OPAQUE_KEYS = [
  ...(OPAQUE_COLUMNS.chat_sessions as string[]),
  ...(OPAQUE_COLUMNS.chat_messages as string[]),
];

function agentCreatorNotAvailable(action: string) {
  return actionFail(
    `${action} in an Agent Creator session runs on the local daemon and is not available from the web app.`,
  );
}

/**
 * Shapes a `chat_turns` row into the `ChatTurnState` contract by attaching
 * the turn's user/assistant messages — moved verbatim from
 * `handlers/chat.ts`'s `turnStateRow` (T-M13-01 decision 2: one function,
 * three call sites; this file now owns the two mutation call sites, the
 * third — `GET /chat/sessions/:id` — stays a route since reads are out of
 * scope for the whole WA phase, DD-5).
 */
async function turnStateRow(
  supabase: ActionContext["supabase"],
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

  // CS6 (T-CS6-01) — embedded here so the send/retry response already shows
  // the just-sent attachment's chip without a second fetch.
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

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Moved verbatim from the `POST /chat/sessions` handler this replaces.
 *
 * Built by `T-WA-03` for `agent-create.tsx`'s call site; `T-WA-07` converted
 * `chat.tsx`'s "new chat" flow onto this same action and deleted the hook
 * both used to share (phase README's shared-hook pattern).
 */
export async function createChatSessionAction(
  input: ChatSessionCreate,
): Promise<ActionResult<ChatSession>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const snake = toSnake(input) as Record<string, unknown>;
  const kind = snake.kind as string;
  if (!CHAT_SESSION_KINDS.includes(kind)) {
    return actionFail(`kind must be one of ${CHAT_SESSION_KINDS.join(", ")}.`);
  }

  let provider = (snake.provider as string | null) ?? null;
  let model = (snake.model as string | null) ?? null;
  let projectId: string | null = null;
  let agentId: string | null = null;

  if (kind === "project") {
    if (!snake.project_id || typeof snake.project_id !== "string") {
      return actionFail("projectId is required for a project chat.");
    }
    const { data: project, error } = await ctx.supabase
      .from("projects")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", snake.project_id)
      .maybeSingle();
    if (error) return actionErrorFrom(error);
    if (!project) return actionFail(`project not found: ${snake.project_id}`);
    projectId = project.id;
    provider = provider ?? "claude-code";
    model = model ?? "sonnet";
  } else if (kind === "agent") {
    if (!snake.agent_id || typeof snake.agent_id !== "string") {
      return actionFail("agentId is required for an agent chat.");
    }
    const { data: agent, error } = await ctx.supabase
      .from("agents")
      .select("id, provider, model")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", snake.agent_id)
      .maybeSingle();
    if (error) return actionErrorFrom(error);
    if (!agent) return actionFail(`agent not found: ${snake.agent_id}`);
    if (executionModeForProvider(agent.provider) !== "cli") {
      return actionFail(`chat supports CLI providers only (got ${agent.provider})`);
    }
    agentId = agent.id;
    projectId = typeof snake.project_id === "string" ? snake.project_id : null;
    provider = agent.provider;
    model = agent.model;
  } else {
    // free / agent-creator: no binding, defaults only.
    provider = provider ?? "claude-code";
    model = model ?? "sonnet";
  }

  if (provider && executionModeForProvider(provider) !== "cli") {
    return actionFail(`chat supports CLI providers only (got ${provider})`);
  }

  const row = {
    id: generateId("chs_"),
    workspace_id: ctx.workspaceId,
    kind,
    title: typeof snake.title === "string" ? snake.title : "",
    project_id: projectId,
    agent_id: agentId,
    provider,
    model,
    status: "active",
    draft: kind === "agent-creator" ? {} : null,
    last_message_at: null,
  };

  const { data, error } = await ctx.supabase.from("chat_sessions").insert(row).select().single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/chat");
  return actionOk(toCamel(data, CHAT_SESSIONS_OPAQUE) as ChatSession);
}

/**
 * Built fresh by `T-WA-03` — no `PATCH /chat/sessions/:id` handler ever
 * existed (`BUG-2026-08-26-chat-session-updates-always-404`); this is the
 * fix, scoped to the columns `ChatSessionUpdate` actually carries (`title`,
 * `status`, `provider`, `model`), all of them real, already-written columns
 * on `chat_sessions`. `T-WA-07` converted `chat.tsx`'s
 * rename/model-switch/archive call sites onto this same action, completing
 * the bug's fix.
 */
export async function updateChatSessionAction(
  id: string,
  data: ChatSessionUpdate,
): Promise<ActionResult<ChatSession>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: row, error } = await ctx.supabase
    .from("chat_sessions")
    .update(toSnake(data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/chat");
  return actionOk(toCamel(row, CHAT_SESSIONS_OPAQUE) as ChatSession);
}

/**
 * T-CS1-02. A hard delete, not a soft one — distinct from the `archived`
 * status `updateChatSessionAction` already sets. Needs no extra
 * authorization: `chat_sessions` sits under the generic workspace-member RLS
 * policy (`001_rls.sql`, `for all`), and `chat_messages`/`chat_turns` both
 * reference it `ON DELETE CASCADE`, so one row delete here removes the
 * session's entire history with no further application code.
 */
export async function deleteChatSessionAction(id: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { error } = await ctx.supabase
    .from("chat_sessions")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id);
  if (error) return actionErrorFrom(error);

  revalidatePath("/chat");
  return actionOk(undefined);
}

/**
 * T-CS3-03. Asks an online, capable runtime to check its live model list
 * for `provider` (US3). A no-op, not a failure, when nothing is available
 * right now — CS4's picker reads whatever is already cached (possibly
 * nothing/stale) and says so; there is nothing here to surface as an error.
 */
export async function requestModelDiscoveryAction(provider: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { error } = await ctx.supabase.rpc("request_model_discovery", {
    p_workspace_id: ctx.workspaceId,
    p_provider: provider,
  });
  if (error) return actionErrorFrom(error);

  return actionOk(undefined);
}

/**
 * Moved verbatim from `POST /chat/sessions/:id/messages` (`T-WA-07`).
 *
 * `enqueue_chat_turn` inserts the turn and the user message in one
 * transaction and never raises for "nothing is online" (DD-3) — a `waiting`
 * turn with a `waitingReason` comes back instead. Only a bad session id or an
 * already-in-flight turn is a hard error, mapped by `chatTurnFailureFrom`.
 *
 * Agent Creator sessions are refused here on purpose, same as the route they
 * replace: `enqueue_chat_turn` does not accept their `draft` payload, and
 * they keep the local, non-dispatched path (T-M13-01 decision 4) via
 * `useAgentDraftTurn`, which this task does not touch.
 */
export async function postChatTurnAction(
  sessionId: string,
  input: ChatTurnRequest,
): Promise<ActionResult<ChatTurnState>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: session, error: sessionErr } = await ctx.supabase
    .from("chat_sessions")
    .select("id, kind")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr) return actionErrorFrom(sessionErr);
  if (!session) return actionFail("That chat session does not exist.");
  if (session.kind === "agent-creator") return agentCreatorNotAvailable("Sending a message");

  const content = input.content ?? "";
  // CS6 (T-CS6-01) — a message with an attachment but no text must still be
  // sendable (phase Trap); only refuse when there's neither.
  if (!content.trim() && !input.attachments?.length) {
    return actionFail("content is required.");
  }
  if (Buffer.byteLength(content, "utf8") > CHAT_MESSAGE_MAX_BYTES) {
    return actionFail(`content must not exceed ${CHAT_MESSAGE_MAX_BYTES} bytes`);
  }

  // T-CS5-03 correction (was a separate post-hoc insert in T-CS5-02):
  // `enqueue_chat_turn` calls `assign_or_park_chat_turn` SYNCHRONOUSLY,
  // inside its own transaction, to dispatch the turn immediately when a
  // runtime is already online -- the common case, not the edge case. An
  // attachment row created AFTER this RPC returns would already have
  // missed that dispatch's payload every time. `enqueue_chat_turn` now
  // creates the attachment rows itself, atomically, before it dispatches --
  // see `026_chat_attachments_dispatch.sql`'s own header for the full story.
  const { data, error } = await ctx.supabase.rpc("enqueue_chat_turn", {
    p_session_id: sessionId,
    p_content: content,
    p_attachments: (input.attachments ?? []).map((a) => ({
      storage_path: a.storagePath,
      filename: a.filename,
      mime_type: a.mimeType,
      size_bytes: a.sizeBytes,
    })),
  });

  if (error) {
    const failure = chatTurnFailureFrom(error);
    if (!failure) return actionErrorFrom(error);
    return actionFail(failure.message, failure.reason);
  }

  const turnState = toCamel(
    await turnStateRow(ctx.supabase, ctx.workspaceId, data),
    CHAT_TURN_OPAQUE_KEYS,
  ) as ChatTurnState;

  revalidatePath("/chat");
  return actionOk(turnState);
}

/**
 * Moved verbatim from `POST /chat/sessions/:id/retry` (`T-WA-07`) — re-ask
 * without retyping (US3). `retry_chat_turn` takes a TURN id, not a session
 * id, so this resolves the session's latest turn first, same as the route.
 */
export async function retryChatTurnAction(
  sessionId: string,
  input: ChatRetryRequest,
): Promise<ActionResult<ChatTurnState>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: session, error: sessionErr } = await ctx.supabase
    .from("chat_sessions")
    .select("id, kind")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr) return actionErrorFrom(sessionErr);
  if (!session) return actionFail("That chat session does not exist.");
  if (session.kind === "agent-creator") return agentCreatorNotAvailable("Retrying");

  const { data: latestTurn, error: latestErr } = await ctx.supabase
    .from("chat_turns")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) return actionErrorFrom(latestErr);
  if (!latestTurn) return actionFail("This session has no turn to retry.");

  const { data, error } = await ctx.supabase.rpc("retry_chat_turn", {
    p_turn_id: latestTurn.id,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
  });

  if (error) {
    const failure = chatTurnFailureFrom(error);
    if (!failure) return actionErrorFrom(error);
    return actionFail(failure.message, failure.reason);
  }

  revalidatePath("/chat");
  return actionOk(
    toCamel(await turnStateRow(ctx.supabase, ctx.workspaceId, data), CHAT_TURN_OPAQUE_KEYS) as ChatTurnState,
  );
}
