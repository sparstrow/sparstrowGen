"use client";

import * as React from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { useSendChatMessage } from "@sparstrow/core";
import { Button } from "@sparstrow/ui/components/ui/button";
import { cn } from "@sparstrow/ui/lib/utils";

export interface ComposerProps {
  sessionId: string;
  disabled?: boolean;
  placeholder?: string;
  onMessageSent?: () => void;
  className?: string;
}

export function Composer({
  sessionId,
  disabled = false,
  placeholder = "Message your agent...",
  onMessageSent,
  className,
}: ComposerProps) {
  const [content, setContent] = React.useState("");
  const sendMessage = useSendChatMessage();
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const canSend = content.trim().length > 0 && !sendMessage.isPending && !disabled;

  const handleSend = async () => {
    const text = content.trim();
    if (!text || sendMessage.isPending || disabled) return;

    try {
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      await sendMessage.mutateAsync({
        sessionId,
        content: text,
      });
      onMessageSent?.();
    } catch (err) {
      console.error("Failed to send message:", err);
      // Restore draft text on failure so user does not lose message
      setContent(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    const target = e.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  };

  return (
    <div className={cn("p-4 border-t bg-background", className)}>
      <div className="mx-auto max-w-[68ch]">
        <div className="relative flex flex-col rounded-xl border border-border bg-card shadow-xs focus-within:border-brand/60 focus-within:ring-1 focus-within:ring-brand/30 transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled || sendMessage.isPending}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent px-3.5 py-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden min-h-[44px] max-h-[200px]"
          />

          <div className="flex items-center justify-between border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <Button
              type="button"
              size="icon"
              className={cn(
                "size-7 rounded-lg transition-colors",
                canSend
                  ? "bg-brand text-brand-foreground hover:bg-brand/90"
                  : "bg-muted text-muted-foreground hover:bg-muted"
              )}
              disabled={!canSend}
              onClick={() => void handleSend()}
            >
              {sendMessage.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ArrowUp className="size-3.5 stroke-[2.5]" />
              )}
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </div>

        {sendMessage.isError ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {sendMessage.error.message || "Could not deliver message."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
