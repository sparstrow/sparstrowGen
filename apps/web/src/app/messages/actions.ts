"use server";

import { revalidatePath } from "next/cache";
import type { Message } from "@sparstrow/shared";
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

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Matches `useSendMessage`'s old `MessageCreateInput` (`api/hooks.ts`) —
 *  `messageCreateSchema`'s own inferred type requires every column, which
 *  the composer never sends (no `fromAgentId`, no `taskId`). */
export interface SendMessageInput {
  toAgentId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  subject?: string;
  body: string;
  spawnRun?: boolean;
}

/**
 * Moved verbatim from the `POST /messages` handler this replaces. A message
 * composed through the web app comes from the user, not an agent — agents
 * write to this table through the daemon, not this action.
 */
export async function sendMessageAction(
  input: SendMessageInput,
): Promise<ActionResult<Message>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const snake = toSnake(input) as Record<string, unknown>;
  if (typeof snake.body !== "string" || snake.body.length === 0) {
    return actionFail("body is required");
  }

  const row = {
    ...snake,
    workspace_id: ctx.workspaceId,
    id: generateId("msg_"),
    from_type: snake.from_type ?? "user",
    subject: snake.subject ?? "",
    status: "unread",
  };

  const { data, error } = await ctx.supabase.from("messages").insert(row).select().single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/messages");
  return actionOk(toCamel(data) as Message);
}

/** Moved verbatim from the `POST /messages/:id/mark-read` handler this replaces. */
export async function markMessageReadAction(id: string): Promise<ActionResult<Message>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("messages")
    .update({ status: "read" })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/messages");
  return actionOk(toCamel(data) as Message);
}
