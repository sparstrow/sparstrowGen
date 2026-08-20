import * as React from "react";

/**
 * The capability to write into Supabase Storage's `public-images` bucket
 * (T-M9-04).
 *
 * Injected via context rather than constructed in `@sparstrow/ui` itself —
 * the same shape `LiveEventSource` (`./live-events.ts`) and `Account`
 * (`./account.tsx`) already use for a capability that exists on the hosted web
 * app and not on the local desktop build. Building a Supabase client here
 * would mean this package reading env vars only `apps/web` knows how to
 * resolve; instead `apps/web` builds the real uploader and the default stays
 * `null`, which `<ImageUploadField>` reads as "this host cannot upload
 * images" — true today for the desktop build, which has no account or
 * workspace to attach an image to in the first place.
 */
export interface ImageUploader {
  /**
   * Uploads under a random filename inside `prefix` (e.g. `avatars/<user_id>`
   * or `workspace-logos/<workspace_id>`) and resolves to the object's public
   * URL. Rejects with a readable message on failure.
   */
  upload(file: File, prefix: string): Promise<string>;
  /**
   * Best-effort delete by public URL. Never throws — the caller uses this to
   * clean up the file a replace or a save-failure orphaned, and a missed
   * delete is a wasted couple of megabytes, not a user-visible failure.
   */
  remove(url: string): Promise<void>;
}

const ImageUploaderContext = React.createContext<ImageUploader | null>(null);

export function ImageUploaderProvider({
  uploader,
  children,
}: {
  uploader: ImageUploader | null;
  children: React.ReactNode;
}) {
  return (
    <ImageUploaderContext.Provider value={uploader}>{children}</ImageUploaderContext.Provider>
  );
}

export function useImageUploader(): ImageUploader | null {
  return React.useContext(ImageUploaderContext);
}
