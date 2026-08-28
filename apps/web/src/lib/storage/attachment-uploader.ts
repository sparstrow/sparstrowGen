import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_ATTACHMENT_ALLOWED_TYPES,
  CHAT_ATTACHMENT_BUCKET,
  checkChatAttachmentFile,
  type ChatAttachmentUpload,
} from "@sparstrow/shared";

/**
 * T-CS5-02. Generalizes `image-uploader.ts`'s shape for arbitrary chat
 * attachment files against the new private `chat-attachments` bucket
 * (`025_chat_attachments_storage.sql`) — **not** the `ImageUploader`
 * interface that file implements, since the return shape here is
 * deliberately different (see below), not a form-field abstraction CS6's
 * composer needs to fit into.
 *
 * Returns the storage path/key, never a URL. `image-uploader.ts` returns
 * `getPublicUrl`'s result because `public-images` is meant to be; this
 * bucket is private (T-CS5-01's own Trap), so a permanent URL here would
 * recreate the exact leak that task's header warns against. Reads happen
 * later through a short-lived signed URL minted on demand (T-CS5-03) —
 * nothing durable enough to resolve the file is ever produced here.
 */
export function createChatAttachmentUploader(supabase: SupabaseClient) {
  return {
    async upload(file: File, prefix: string): Promise<ChatAttachmentUpload> {
      // Client-side courtesy, same framing as `checkImageFile`'s own comment
      // — the bucket's own size limit and MIME allowlist are what actually
      // hold. Checked before any network call, per this task's own Trap.
      const message = checkChatAttachmentFile(file);
      if (message) throw new Error(message);

      const ext = CHAT_ATTACHMENT_ALLOWED_TYPES[file.type];
      const storagePath = `${prefix}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(CHAT_ATTACHMENT_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);

      return {
        storagePath,
        // The ORIGINAL filename, not the uuid-based storage key — this is
        // what T-CS5-03's daemon download step names the file on disk, and
        // what a reply referencing "the attached file" should read like to
        // the owner. The storage key exists only to avoid collisions.
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      };
    },
  };
}

export type ChatAttachmentUploader = ReturnType<typeof createChatAttachmentUploader>;
