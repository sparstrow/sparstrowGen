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

  const userMessage = (messages ?? []).find((m: any) => m.role === "user") ?? null;
  const assistantMessage = (messages ?? []).find((m: any) => m.role === "assistant") ?? null;

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

  const content = input.content;
  if (!content || !content.trim()) return actionFail("content is required.");
  if (Buffer.byteLength(content, "utf8") > CHAT_MESSAGE_MAX_BYTES) {
    return actionFail(`content must not exceed ${CHAT_MESSAGE_MAX_BYTES} bytes`);
  }

  const { data, error } = await ctx.supabase.rpc("enqueue_chat_turn", {
    p_session_id: sessionId,
    p_content: content,
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

  // T-CS5-02 -- attachments were uploaded to Storage BEFORE this action ran
  // (`createChatAttachmentUploader`), but their `chat_message_attachments`
  // row can only be created now, once `enqueue_chat_turn` above has created
  // the real user message they reference (this task's own Trap: a mismatch
  // here is exactly the seam CS6 would otherwise discover the hard way).
  // Best-effort past this point: the message and its turn are already real
  // and already dispatched, so a failed attachment insert must not be
  // reported back as a failed send -- CS6 decides how (or whether) to
  // surface this from server logs.
  if (input.attachments?.length && turnState.userMessage) {
    const rows = input.attachments.map((a) => ({
      id: generateId("cma_"),
      workspace_id: ctx.workspaceId,
      message_id: turnState.userMessage!.id,
      storage_path: a.storagePath,
      filename: a.filename,
      mime_type: a.mimeType,
      size_bytes: a.sizeBytes,
    }));
    const { error: attachErr } = await ctx.supabase.from("chat_message_attachments").insert(rows);
    if (attachErr) {
      console.error("postChatTurnAction: failed to record uploaded attachment(s)", attachErr);
    }
  }

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
