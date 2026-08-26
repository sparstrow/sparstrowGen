"use server";

import { revalidatePath } from "next/cache";
import { executionModeForProvider } from "@sparstrow/shared";
import type { ChatSession, ChatSessionCreate, ChatSessionUpdate } from "@sparstrow/shared";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  toCamel,
  toSnake,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";

const CHAT_SESSIONS_OPAQUE = ["draft"];
const CHAT_SESSION_KINDS = ["free", "project", "agent", "agent-creator"];

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Moved verbatim from the `POST /chat/sessions` handler this replaces.
 *
 * Shared with `T-WA-07`: `chat.tsx` calls this same hook today
 * (`useCreateChatSession`) for its own "new chat" flow. This task
 * (`T-WA-03`) converts `agent-create.tsx`'s call site only — `T-WA-07` owns
 * `chat.tsx`'s conversion and deletes the hook once both consumers are off
 * it (phase README's shared-hook pattern).
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
 * Built fresh — no `PATCH /chat/sessions/:id` handler ever existed
 * (`BUG-2026-08-26-chat-session-updates-always-404`); this is the fix,
 * scoped here to the columns `ChatSessionUpdate` actually carries (`title`,
 * `status`, `provider`, `model`), all of them real, already-written columns
 * on `chat_sessions`. Shared with `T-WA-07` the same way
 * `createChatSessionAction` is: `chat.tsx`'s rename/model-switch/archive
 * call sites convert to this action when that task lands.
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
