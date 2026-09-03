import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessageAttachment } from "./schemas/chat";

/**
 * CS6 (Band 26, T-CS6-01). One batched query for a set of messages'
 * attachments (`chat_message_attachments`, T-CS5-01) — shared by
 * `handlers/chat.ts`'s GET route and `app/chat/actions.ts`'s own
 * send/retry result-shaping. Not a shared "build a ChatMessage" function —
 * that split stays deliberate (T-WA-07 decision 2: reads are a route,
 * writes own their own copy) — just a small, pure data-fetch neither side
 * needs to duplicate.
 *
 * ─── Why it is in `packages/shared` and not in `server/` ───────────────────
 *
 * **Its long-term home is `server/`.** It is here only because its two callers
 * currently sit on opposite sides of the restructure: the GET route moved to
 * `server/src/routes/chat.ts` in Phase 1, while `apps/web/src/app/chat/
 * actions.ts` is one of the 44 Server Actions Phase 5 deletes. The three
 * alternatives were all worse — `apps/web` importing from `server/` is the
 * backwards dependency the restructure exists to remove; importing it from the
 * handler module pulls the whole route registry into the action's graph as a
 * `registerRoute()` side effect (the reason `slug.ts` and `patch-validation.ts`
 * were extracted in the first place); and a second copy of a query drifts.
 *
 * This does **not** make `packages/shared` a package that talks to the
 * database. The Supabase import above is `import type`, the client is injected
 * by the caller, and `shared` already exports the full Drizzle schema — it
 * therefore already knows every column named below. Nothing here opens a
 * connection or reads a credential.
 *
 * **Unpark:** when `app/chat/actions.ts` is deleted in Phase 5, move this file
 * to `server/src/routes/` and drop it from the barrel. If you are reading this
 * and that file is already gone, the move is overdue.
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
