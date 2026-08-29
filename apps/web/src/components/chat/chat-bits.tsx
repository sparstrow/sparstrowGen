import * as React from "react";
import {
  CHAT_ATTACHMENT_BUCKET,
  type ChatMessage,
  type ChatMessageAttachment,
  type ChatTurnError,
} from "@sparstrow/shared";
import { ClipboardCopy, Code2, Paperclip, RefreshCw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { createClient } from "@web/utils/supabase/client";
import { Markdown, stripMarkdown } from "./markdown";
import { ProducedItem, ProducedItemViewer } from "./produced-item";

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * T-CS6-01 (US4). A sent message's attachment — read-only, clickable to
 * open. Mints its own short-lived signed URL on demand, under the viewer's
 * own session (the same `createSignedUrl` shape the daemon uses under a
 * service-role one, T-CS5-03) — the object's RLS SELECT policy
 * (`025_chat_attachments_storage.sql`) already permits this for any
 * workspace member, so nothing here grants access beyond what the bucket
 * already allows.
 */
function SentAttachmentChip({ attachment }: { attachment: ChatMessage["attachments"][number] }) {
  const [opening, setOpening] = React.useState(false);
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(CHAT_ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storagePath, 300);
      if (error || !data?.signedUrl) return;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setOpening(false);
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={opening}
      className="mt-1.5 flex items-center gap-1.5 rounded-lg border bg-background/60 px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60"
    >
      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-[200px] truncate">{attachment.filename}</span>
      <span className="text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
    </button>
  );
}

export function ThinkingDots({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-1" aria-label="Thinking">
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="spg-dot size-1.5 rounded-full bg-muted-foreground"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

/**
 * One conversation turn, Claude-Code-desktop style: the user's words sit in a
 * quiet muted bubble on the right; assistant text reads flat on the surface in
 * a comfortable measure, with a small model caption underneath. Right-click
 * offers a copy affordance the browser's native menu doesn't: plain text for
 * either turn, and "Copy as Markdown" (the raw source) for assistant turns.
 */
export function ChatTurnView({
  message,
}: {
  message: Pick<ChatMessage, "role" | "content" | "meta"> & {
    attachments?: ChatMessage["attachments"];
  };
}) {
  if (message.role === "user") {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="spg-turn flex flex-col items-end">
            {/* T-CS6-01 -- an attachment-only send (phase Trap: empty text
                must still be sendable) shouldn't render an empty bubble. */}
            {message.content && (
              <div className="max-w-[75%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-muted px-4 py-2.5 text-sm leading-relaxed">
                {message.content}
              </div>
            )}
            {/* US4 scenario 2 — persists on reload because it's read from
                `chat_message_attachments`, not local state. */}
            {message.attachments?.map((a) => <SentAttachmentChip key={a.id} attachment={a} />)}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => copyToClipboard(message.content)}>
            <ClipboardCopy /> Copy message
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }
  return <AssistantTurn message={message} />;
}

/**
 * T-AM2-02 (US1). Split out of `ChatTurnView` only so the open-attachment id
 * has somewhere to live as component state — the user branch above needs
 * none of it. `attachments?.length` gates the whole strip, not just the
 * `.map`: `[]` is truthy through optional chaining, and `[].map` would still
 * render the wrapping `mt-3` div, which is exactly what SC-005 forbids (a
 * conversation that produced nothing must be byte-identical to one that
 * never had this feature).
 */
function AssistantTurn({
  message,
}: {
  message: Pick<ChatMessage, "role" | "content" | "meta"> & {
    attachments?: ChatMessage["attachments"];
  };
}) {
  const [openAttachment, setOpenAttachment] = React.useState<ChatMessageAttachment | null>(null);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="spg-turn">
          {/* Mirrors the user branch's `{message.content && …}` above (T-CS6-01)
              -- an attachments-only reply (scenario 3: the agent produced
              something and wrote no text) must not emit an empty <p className="my-3">
              with its own margins. */}
          {message.content && <Markdown content={message.content} />}
          {message.attachments?.length ? (
            <div className="mt-3 flex flex-col gap-2">
              {message.attachments.map((a) => (
                <ProducedItem key={a.id} attachment={a} onOpen={setOpenAttachment} />
              ))}
            </div>
          ) : null}
          {message.meta?.model ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">
              {message.meta.provider ? `${String(message.meta.provider)} · ` : ""}
              {String(message.meta.model)}
            </p>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => copyToClipboard(stripMarkdown(message.content))}>
          <ClipboardCopy /> Copy text
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => copyToClipboard(message.content)}>
          <Code2 /> Copy as Markdown
        </ContextMenuItem>
      </ContextMenuContent>
      {/* One viewer per turn, not per item (phase decision) -- a turn that
          produced thirty files mounts one Dialog, driven by which id is open,
          not thirty portals. */}
      <ProducedItemViewer
        attachment={openAttachment}
        open={openAttachment !== null}
        onOpenChange={(open) => {
          if (!open) setOpenAttachment(null);
        }}
      />
    </ContextMenu>
  );
}

const ERROR_LABELS: Record<ChatTurnError["kind"], string> = {
  timeout: "The model timed out",
  "not-installed": "The provider CLI isn't installed",
  "usage-limit": "Usage limit hit",
  provider: "The provider returned an error",
  unknown: "The model failed",
};

/**
 * Turn-failure notice (intake 0001): names the ACTUAL failure reason and asks
 * whether to retry the primary model or fail over to the suggested secondary.
 * Never a silent substitution.
 */
export function TurnErrorBanner({
  error,
  retrying,
  onRetryPrimary,
  onRetrySecondary,
}: {
  error: ChatTurnError;
  retrying: boolean;
  onRetryPrimary: () => void;
  onRetrySecondary: (target: { provider: string; model: string }) => void;
}) {
  return (
    <div className="spg-turn rounded-lg border border-destructive/30 bg-destructive/5 p-3.5">
      <p className="text-sm font-medium text-destructive">
        {ERROR_LABELS[error.kind]}
        {error.attempts > 0 && (
          <span className="font-normal text-muted-foreground">
            {" "}
            · {error.attempts} attempt{error.attempts === 1 ? "" : "s"}
          </span>
        )}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {error.reason || "No detail from the provider."}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={retrying} onClick={onRetryPrimary}>
          <RefreshCw className="size-3.5" /> Retry
        </Button>
        {error.fallback && (
          <Button
            size="sm"
            variant="ghost"
            disabled={retrying}
            onClick={() => onRetrySecondary(error.fallback!)}
          >
            <Shuffle className="size-3.5" /> Continue on {error.fallback.model}
          </Button>
        )}
      </div>
    </div>
  );
}
