import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessageAttachment } from "@sparstrow/shared";

/**
 * CS6 (Band 26, T-CS6-01). One batched query for a set of messages'
 * attachments (`chat_message_attachments`, T-CS5-01) — shared by
 * `handlers/chat.ts`'s GET route and `app/chat/actions.ts`'s own
 * send/retry result-shaping. Not a shared "build a ChatMessage" function —
 * that split stays deliberate (T-WA-07 decision 2: reads are a route,
 * writes own their own copy) — just a small, pure data-fetch neither side
 * needs to duplicate.
 */
export async function attachmentsByMessageId(
  supabase: SupabaseClient,
  workspaceId: string,
  messageIds: string[],
): Promise<Map<string, ChatMessageAttachment[]>> {
  const map = new Map<string, ChatMessageAttachment[]>();
  if (messageIds.length === 0) return map;

  const { data, error } = await supabase
    .from("chat_message_attachments")
    .select("id, message_id, storage_path, filename, mime_type, size_bytes")
    .eq("workspace_id", workspaceId)
    .in("message_id", messageIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const messageId = row.message_id as string;
    const list = map.get(messageId) ?? [];
    list.push({
      id: row.id as string,
      storagePath: row.storage_path as string,
      filename: row.filename as string,
      mimeType: row.mime_type as string,
      sizeBytes: row.size_bytes as number,
    });
    map.set(messageId, list);
  }
  return map;
}

/**
 * One attachment row for a whole session, joined to its own message's role
 * and carrying the content of the PRECEDING user message — the "request
 * that produced it" (T-AM3-01, phase README decision 3, US2). Ordered by the
 * owning message's `created_at` descending, then the attachment's own
 * `created_at` descending (newest group first, newest file within a group
 * first).
 *
 * Returns BOTH `role: "assistant"` (produced) and `role: "user"` (attached)
 * rows on purpose — there is no `uploader_type` column (plan Decision 2), so
 * `messageRole` is the only signal telling them apart. `T-AM3-01`'s
 * `ConversationItems` renders only the assistant rows; `T-AM4-01` turns the
 * rest on with a presentation split, not a new query.
 *
 * **Correction to the task file's Decision 3**: the original sketch put a
 * pre-derived `requestLabel: string | null` on this type, computed with
 * `stripMarkdown` (`components/chat/markdown.tsx`). That file is a `"use
 * client"` module; this one is imported by `handlers/chat.ts`, a Route
 * Handler reached from the server. Nothing here currently calls
 * `stripMarkdown` from server-executed code, but baking that import into a
 * data-fetching module shared with server code is the wrong place to find
 * that out. `precedingUserContent` below is the raw, unstripped content —
 * `ConversationItems` (already a client component) derives the trimmed,
 * markdown-stripped label at render time instead.
 */
export type SessionAttachment = {
  id: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  messageId: string;
  messageRole: "user" | "assistant";
  /** The immediately preceding `role: "user"` message's raw content, or
   *  `null` when this message has none (AM1's FR-013 path: a session whose
   *  first message is an assistant one). */
  precedingUserContent: string | null;
};

/**
 * The session-scoped read T-AM3-01's panel list is built on. Two queries
 * under one export rather than a single PostgREST call: `chat_message_
 * attachments` has no `session_id` of its own (only `message_id`), and
 * finding "the preceding user message" per assistant message is a
 * self-join over `chat_messages` that PostgREST can't express without an
 * RPC — which would mean inventing a database function this task has no
 * mandate to add. Fetching the session's own messages once and walking them
 * in order is the same shape `turnStateRow`/`GET /chat/sessions/:id`
 * (`handlers/chat.ts`) already use for their own "figure it out in
 * TypeScript, not SQL" reads.
 *
 * Takes a bare `SupabaseClient`, not a `workspaceId` — unlike
 * `attachmentsByMessageId`, this is meant to be called with the caller's own
 * browser client (see `chat.tsx`'s already-in-scope `supabase`), relying on
 * `chat_message_attachments`'/`chat_messages`' own RLS
 * (`025_chat_attachments_storage.sql`, `001_rls.sql`) for workspace
 * scoping — the same trust boundary `useAttachmentSignedUrl`
 * (`produced-item.tsx`) already leans on for this bucket.
 */
type SessionMessageRow = { id: string; role: string; content: string; created_at: string };
type SessionAttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export async function sessionAttachments(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionAttachment[]> {
  const { data: messages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (messagesError) throw messagesError;

  const messageRows = (messages ?? []) as SessionMessageRow[];
  if (messageRows.length === 0) return [];

  const messageIds = messageRows.map((m) => m.id);
  const { data: attachmentRows, error: attachmentsError } = await supabase
    .from("chat_message_attachments")
    .select("id, message_id, storage_path, filename, mime_type, size_bytes, created_at")
    .in("message_id", messageIds);
  if (attachmentsError) throw attachmentsError;

  const attachments = (attachmentRows ?? []) as SessionAttachmentRow[];
  if (attachments.length === 0) return [];

  const messageById = new Map<string, SessionMessageRow>(messageRows.map((m) => [m.id, m]));

  // One pass, oldest to newest: the last `role: "user"` content seen so far
  // is every following assistant message's preceding user message, until
  // the next user message replaces it.
  let lastUserContent: string | null = null;
  const precedingUserContentByMessageId = new Map<string, string | null>();
  for (const m of messageRows) {
    if (m.role === "user") {
      lastUserContent = m.content;
    } else {
      precedingUserContentByMessageId.set(m.id, lastUserContent);
    }
  }

  return attachments
    .map(
      (row): SessionAttachment => ({
        id: row.id,
        storagePath: row.storage_path,
        filename: row.filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        messageId: row.message_id,
        messageRole: (messageById.get(row.message_id)?.role as "user" | "assistant" | undefined) ?? "assistant",
        precedingUserContent: precedingUserContentByMessageId.get(row.message_id) ?? null,
      }),
    )
    .sort((a, b) => {
      const aMessageCreatedAt = messageById.get(a.messageId)?.created_at ?? "";
      const bMessageCreatedAt = messageById.get(b.messageId)?.created_at ?? "";
      if (aMessageCreatedAt !== bMessageCreatedAt) {
        return aMessageCreatedAt < bMessageCreatedAt ? 1 : -1; // newest message/group first
      }
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1; // newest attachment within the group first
      }
      return 0;
    });
}
