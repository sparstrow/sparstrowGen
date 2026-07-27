import type { ChatMessage } from "@sparstrow/shared";

/**
 * Whether to render the optimistic "sending" bubble for a chat turn.
 *
 * Intake 0008 — the message appeared twice. The server persists the user row
 * *before* running the model (chat/service.ts `postChatTurn`), and the turn can
 * take minutes, so any refetch inside that window returns a transcript that
 * already contains the message the optimistic bubble is still showing. For the
 * first message of a fresh session it is near-certain: creating the session
 * mounts the detail query, and that initial fetch lands mid-turn.
 *
 * The server keeps an unanswered user message as the last row until it replies,
 * so a trailing user message means the real row has arrived and the optimistic
 * one is now a duplicate.
 */
export function shouldShowPendingBubble(
  messages: Pick<ChatMessage, "role">[],
  pendingContent: string | null | undefined,
): boolean {
  if (!pendingContent) return false;
  return messages[messages.length - 1]?.role !== "user";
}
