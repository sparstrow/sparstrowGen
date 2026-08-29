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
