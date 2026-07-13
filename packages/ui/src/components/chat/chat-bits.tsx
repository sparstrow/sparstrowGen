import type { ChatMessage, ChatTurnError } from "@sparstrow/shared";
import { ClipboardCopy, Code2, RefreshCw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Markdown, stripMarkdown } from "@/components/chat/markdown";

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text);
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
  message: Pick<ChatMessage, "role" | "content" | "meta">;
}) {
  if (message.role === "user") {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="spg-turn flex justify-end">
            <div className="max-w-[75%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-muted px-4 py-2.5 text-sm leading-relaxed">
              {message.content}
            </div>
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
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="spg-turn">
          <Markdown content={message.content} />
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
