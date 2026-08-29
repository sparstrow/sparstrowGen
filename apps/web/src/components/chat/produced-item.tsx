"use client";

import * as React from "react";
import { CHAT_ATTACHMENT_BUCKET, type ChatMessageAttachment } from "@sparstrow/shared";
import { Download, ImageOff, Paperclip } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@web/utils/supabase/client";

/**
 * T-AM2-01. `chat-bits.tsx` (`T-AM2-02`'s own file, edited concurrently in
 * this band) has an identical private `formatFileSize` for
 * `SentAttachmentChip`. Duplicated here deliberately rather than exported
 * and shared — the two tasks are `[P]` against each other specifically
 * because they touch no common file; adding a cross-import would recreate
 * exactly the coordination point that split was meant to avoid, for three
 * lines of code.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Phase decision 2 — SVG is deliberately EXCLUDED from renderable images: a
 * private-bucket URL can still deliver an SVG's markup for the browser to
 * parse, and this bucket is not restricted to non-executable content the way
 * `PUBLIC_IMAGE_ALLOWED_TYPES` is. An SVG gets the file-row treatment like
 * any other document.
 */
const RENDERABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function isRenderableImage(mimeType: string): boolean {
  return RENDERABLE_IMAGE_TYPES.has(mimeType);
}

type SignedUrlState = "loading" | "ready" | "unavailable";

/**
 * Mints a short-lived signed URL for one attachment, under the viewer's own
 * session — same shape `SentAttachmentChip` already uses for the identical
 * bucket, just held in state instead of minted on click, since an `<img>`
 * needs the URL before any click happens.
 *
 * `handleError` is meant to be wired directly to an `<img onError>`. A
 * signed URL is valid for only 300 seconds; a conversation left open past
 * that would otherwise show a broken image on next paint. The FIRST error
 * re-mints once; a SECOND error (the re-minted URL also failed) concludes
 * the object is genuinely gone rather than retrying forever.
 *
 * **`storagePath` must be stable for the lifetime of the calling component**
 * — this hook does not watch for it changing. `ProducedItem`/
 * `ProducedItemViewer` below guarantee that by mounting their inner,
 * hook-using component under `key={attachment.storagePath}`: switching to a
 * different attachment remounts fresh state instead of asking this hook to
 * reset itself. That is deliberate, not an oversight — resetting derived
 * state from inside a `useEffect` (the more obvious approach) is exactly
 * what `react-hooks/set-state-in-effect` flags, and reading/writing a ref
 * during render to detect the change is what `react-hooks/refs` flags right
 * behind it. `key`-based remounting is React's own documented answer to
 * "reset all state when this identifier changes."
 */
function useAttachmentSignedUrl(storagePath: string): {
  url: string | null;
  state: SignedUrlState;
  handleError: () => void;
} {
  const [url, setUrl] = React.useState<string | null>(null);
  const [state, setState] = React.useState<SignedUrlState>("loading");
  const retriedRef = React.useRef(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let ignore = false;
    const supabase = createClient();
    supabase.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .createSignedUrl(storagePath, 300)
      .then(({ data, error }) => {
        if (ignore) return;
        if (error || !data?.signedUrl) {
          setState("unavailable");
          return;
        }
        setUrl(data.signedUrl);
        setState("ready");
      })
      .catch(() => {
        if (!ignore) setState("unavailable");
      });
    return () => {
      ignore = true;
    };
  }, [storagePath, attempt]);

  const handleError = React.useCallback(() => {
    if (retriedRef.current) {
      setState("unavailable");
      return;
    }
    retriedRef.current = true;
    setAttempt((a) => a + 1);
  }, []);

  return { url, state, handleError };
}

function ProducedItemBody({
  attachment,
  onOpen,
}: {
  attachment: ChatMessageAttachment;
  onOpen: (attachment: ChatMessageAttachment) => void;
}): React.JSX.Element {
  const { url, state, handleError } = useAttachmentSignedUrl(attachment.storagePath);
  const renderable = isRenderableImage(attachment.mimeType);

  if (state === "loading") {
    // Fixed 16:10 approximation, per the phase README: sizeBytes is known,
    // pixel dimensions are not, so this is the honest placeholder shape
    // rather than a guess. Never a spinner — DESIGN.md §10, Named Rule 10.
    return <Skeleton className="mt-1.5 aspect-[16/10] w-full max-w-sm rounded-lg" />;
  }

  if (state === "unavailable") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground">
        <ImageOff className="size-3.5 shrink-0" aria-hidden="true" />
        <span>&ldquo;{attachment.filename}&rdquo; couldn&apos;t be loaded</span>
      </div>
    );
  }

  if (renderable) {
    return (
      <button
        type="button"
        onClick={() => onOpen(attachment)}
        className="mt-1.5 block max-w-sm overflow-hidden rounded-lg border transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed URL cannot go through next/image's remote-pattern allowlist */}
        <img
          src={url ?? undefined}
          alt={attachment.filename}
          onError={handleError}
          className="max-h-80 w-full object-contain"
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(attachment)}
      className="mt-1.5 flex items-center gap-1.5 rounded-lg border bg-background/60 px-2.5 py-1.5 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="max-w-[200px] truncate">{attachment.filename}</span>
      <span className="text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
    </button>
  );
}

/**
 * One stored attachment, rendered as a thumbnail (renderable image) or a
 * named row (everything else). Used both inline under a reply (`T-AM2-02`)
 * and in the per-conversation list (`T-AM3-01`) — the shared worked example
 * both were written against, per the phase README's fork-point decision.
 */
export function ProducedItem(props: {
  attachment: ChatMessageAttachment;
  onOpen: (attachment: ChatMessageAttachment) => void;
}): React.JSX.Element {
  return <ProducedItemBody key={props.attachment.storagePath} {...props} />;
}

function ProducedItemViewerBody({ attachment }: { attachment: ChatMessageAttachment }): React.JSX.Element {
  const { url, state, handleError } = useAttachmentSignedUrl(attachment.storagePath);
  const renderable = isRenderableImage(attachment.mimeType);

  return (
    <>
      <DialogTitle className="sr-only">{attachment.filename}</DialogTitle>
      <DialogDescription className="sr-only">Enlarged view of {attachment.filename}</DialogDescription>

      {state === "loading" && <Skeleton className="aspect-[16/10] w-full" />}

      {state === "unavailable" && (
        <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-md bg-muted text-sm text-muted-foreground">
          <ImageOff className="size-6" aria-hidden="true" />
          <p>&ldquo;{attachment.filename}&rdquo; couldn&apos;t be loaded</p>
        </div>
      )}

      {state === "ready" && url && renderable && (
        // eslint-disable-next-line @next/next/no-img-element -- signed, private URL
        <img
          src={url}
          alt={attachment.filename}
          onError={handleError}
          className="max-h-[75vh] w-full rounded-md object-contain"
        />
      )}

      {state === "ready" && url && !renderable && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Paperclip className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">{attachment.filename}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Open or save
          </a>
        </div>
      )}
    </>
  );
}

/**
 * The enlarged view a `ProducedItem` opens into. One instance per surface
 * (a turn's strip, the conversation list) — the caller owns which attachment
 * is currently open, not this component, so a turn with thirty produced
 * files mounts one Dialog, not thirty.
 */
export function ProducedItemViewer({
  attachment,
  open,
  onOpenChange,
}: {
  attachment: ChatMessageAttachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {attachment && <ProducedItemViewerBody key={attachment.storagePath} attachment={attachment} />}
      </DialogContent>
    </Dialog>
  );
}
