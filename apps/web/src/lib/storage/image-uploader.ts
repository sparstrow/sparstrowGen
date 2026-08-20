import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_IMAGE_ALLOWED_TYPES, PUBLIC_IMAGE_BUCKET } from "@sparstrow/shared";
import type { ImageUploader } from "@sparstrow/ui/lib/image-upload";
import { supabaseUrl } from "@web/utils/supabase/env";

/**
 * The web app's implementation of `@sparstrow/ui`'s `ImageUploader` — the only
 * place that actually calls `supabase.storage`. See
 * `packages/shared/drizzle/policies/013_storage_images.sql` for the bucket and
 * the RLS policies that are the real boundary here; this file's own checks are
 * a courtesy (T-M9-04 decision), not the security.
 */

const PUBLIC_OBJECT_PREFIX = `/storage/v1/object/public/${PUBLIC_IMAGE_BUCKET}/`;

/**
 * The object key a public URL was served from, or `null` if it is not one of
 * ours. Exported for its tests, matching `isOwnStorageUrl`'s shape and origin
 * check in `../api/storage-url.ts` — a deliberate parallel copy rather than a
 * shared import: that one runs server-side and is the actual security
 * boundary (what a `PATCH` accepts into `avatar_url`/`logo_url`); this one
 * runs in the browser and is only ever used to name a file for best-effort
 * cleanup, never to authorize anything.
 */
export function keyFromPublicUrl(url: string): string | null {
  let candidate: URL;
  try {
    candidate = new URL(url);
  } catch {
    return null;
  }
  if (candidate.origin !== new URL(supabaseUrl()).origin) return null;
  if (!candidate.pathname.startsWith(PUBLIC_OBJECT_PREFIX)) return null;
  const key = candidate.pathname.slice(PUBLIC_OBJECT_PREFIX.length);
  return key.length > 0 ? key : null;
}

export function createSupabaseImageUploader(supabase: SupabaseClient): ImageUploader {
  return {
    async upload(file, prefix) {
      const ext = PUBLIC_IMAGE_ALLOWED_TYPES[file.type];
      if (!ext) {
        // The client-side check in `<ImageUploadField>` should have already
        // caught this — reaching here means a caller bypassed it, not that
        // the bucket's own MIME allowlist was consulted (it never rejects
        // faster than this).
        throw new Error("Only PNG, JPEG or WebP images are accepted.");
      }
      const key = `${prefix}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(PUBLIC_IMAGE_BUCKET)
        .upload(key, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from(PUBLIC_IMAGE_BUCKET).getPublicUrl(key);
      return data.publicUrl;
    },

    async remove(url) {
      const key = keyFromPublicUrl(url);
      if (!key) return;
      // Best-effort: an orphaned object is a wasted couple of megabytes, not a
      // user-visible failure, and the caller has already saved successfully by
      // the time this runs.
      await supabase.storage
        .from(PUBLIC_IMAGE_BUCKET)
        .remove([key])
        .catch(() => {});
    },
  };
}
