import * as React from "react";
import { Loader2 } from "lucide-react";
import { checkImageFile } from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import { useImageUploader } from "@/lib/image-upload";
import { cn } from "@/lib/utils";

/**
 * T-M9-04 — one upload control, used for both the avatar and the workspace
 * logo (`ImageUploadField` prefix decides which). Held back from the M9 build
 * until the design-system rebuild landed; see `doc/tasks/M9/T-M9-04-image-upload.md`
 * for why, and `packages/shared/drizzle/policies/013_storage_images.sql` for
 * the bucket and policies this calls into.
 *
 * Four states, per the task's checklist: **current** (an image is set),
 * **empty** (none yet — the shell's own initials/icon fallback, passed in as
 * `fallback`), **uploading** (a request in flight, control disabled), and
 * **error** (the real reason, image unchanged).
 *
 * Order matters on save, per the task's own trap: upload the new file, call
 * `onSave` (the caller's PATCH), and only once that resolves delete the old
 * object. Deleting first would leave a broken image if the save then failed.
 */
export interface ImageUploadFieldProps {
  /** The current public URL, or `null` if none is set yet. */
  currentUrl: string | null;
  /** Storage prefix this image belongs under, e.g. `avatars/<user_id>`. */
  prefix: string;
  /** Persists the new URL (or `null`, when removing). Rethrow to signal failure. */
  onSave: (url: string | null) => Promise<unknown>;
  /** What this image is, for alt text and error copy — "avatar" or "logo". */
  label: string;
  /**
   * Rendered inside the 64px tile when there is no current image — initials,
   * or an icon at `size-6` per `DESIGN.md` §6's empty-state sizing. The
   * caller decides this because only it knows the identity to derive initials
   * from (a name, a workspace) or which icon fits its own empty-state
   * elsewhere in the shell.
   */
  fallback: React.ReactNode;
  className?: string;
}

type Status = { kind: "idle" } | { kind: "uploading" } | { kind: "error"; message: string };

export function ImageUploadField({
  currentUrl,
  prefix,
  onSave,
  label,
  fallback,
  className,
}: ImageUploadFieldProps) {
  const uploader = useImageUploader();
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const busy = status.kind === "uploading";

  // No host has provided one (the local desktop build has no account or
  // workspace to attach an image to) — nothing to render, per AGENTS.md's
  // rule against a disabled control standing in for a feature that is not
  // available here.
  if (!uploader) return null;

  // Bound to a `const` so the closures below see a definitely-non-null value —
  // TypeScript does not narrow a captured outer variable across a nested
  // function boundary from the guard above alone.
  const activeUploader = uploader;

  async function handleFile(file: File) {
    const clientError = checkImageFile(file);
    if (clientError) {
      setStatus({ kind: "error", message: clientError });
      return;
    }

    setStatus({ kind: "uploading" });
    let uploadedUrl: string | null = null;
    try {
      uploadedUrl = await activeUploader.upload(file, prefix);
      await onSave(uploadedUrl);
      if (currentUrl) await activeUploader.remove(currentUrl);
      setStatus({ kind: "idle" });
    } catch (err) {
      // The save (not the upload) is what failed, or the upload never
      // resolved — either way the row was not updated, so the just-uploaded
      // object is an orphan. Best-effort cleanup; a failure here must not
      // mask the real error.
      if (uploadedUrl) void activeUploader.remove(uploadedUrl).catch(() => {});
      const message = err instanceof Error ? err.message : `Could not save the ${label}.`;
      setStatus({ kind: "error", message });
    }
  }

  async function handleRemove() {
    if (!currentUrl) return;
    const previous = currentUrl;
    setStatus({ kind: "uploading" });
    try {
      await onSave(null);
      await activeUploader.remove(previous);
      setStatus({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not remove the ${label}.`;
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={currentUrl ? `Change ${label}` : `Upload ${label}`}
        className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-accent text-muted-foreground transition-colors hover:border-ring disabled:pointer-events-none disabled:opacity-70"
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="" className="size-full object-cover" />
        ) : (
          fallback
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin text-foreground" />
          </span>
        ) : null}
      </button>

      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {currentUrl ? `Change ${label}` : `Upload ${label}`}
          </Button>
          {currentUrl ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleRemove}>
              Remove
            </Button>
          ) : null}
        </div>
        {status.kind === "error" ? (
          <p className="text-xs text-destructive">{status.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2 MB.</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
