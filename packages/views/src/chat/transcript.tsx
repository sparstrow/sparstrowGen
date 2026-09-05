"use client";

import * as React from "react";
import { AlertCircle, Bot, Loader2, Sparkles, User } from "lucide-react";
import { useChatSession } from "@sparstrow/core";
import type { ChatMessage, ChatTurnState } from "@sparstrow/shared";
import { Skeleton } from "@sparstrow/ui/components/ui/skeleton";
import { cn } from "@sparstrow/ui/lib/utils";

export interface TranscriptProps {
  sessionId: string;
  className?: string;
}

function formatMessageTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

export function Transcript({ sessionId, className }: TranscriptProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Poll every 1.5s while an active turn is running (waiting or in_progress)
  const sessionQuery = useChatSession(sessionId);

  const { data, isPending, isError, error, refetch } = sessionQuery;

  // Auto-scroll to bottom on new messages or active turn updates
  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [data?.messages.length, data?.activeTurn?.status, data?.activeTurn?.replyText]);

  // Set up conditional polling for busy turns
  const activeTurn = data?.activeTurn;
  const isTurnBusy = activeTurn && (activeTurn.status === "waiting" || activeTurn.status === "in_progress");

  React.useEffect(() => {
    if (!isTurnBusy) return;
    const interval = setInterval(() => {
      void refetch();
    }, 1500);
    return () => clearInterval(interval);
  }, [isTurnBusy, refetch]);

  if (isPending) {
    return (
      <div className={cn("flex-1 space-y-6 p-6 overflow-y-auto", className)}>
        <div className="mx-auto max-w-[68ch] space-y-6">
          <div className="flex justify-end">
            <Skeleton className="h-10 w-48 rounded-2xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn("flex-1 p-6 overflow-y-auto", className)}>
        <div className="mx-auto max-w-[68ch] rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-xs">
          <p className="font-medium text-foreground">Could not load messages.</p>
          <p className="mt-1 text-muted-foreground">{error?.message || "An unexpected error occurred."}</p>
        </div>
      </div>
    );
  }

  const session = data?.session;
  const messages = data?.messages ?? [];

  return (
    <div
      ref={scrollContainerRef}
      className={cn("flex-1 overflow-y-auto px-4 py-6 md:px-8", className)}
    >
      <div className="mx-auto max-w-[68ch] space-y-8">
        {messages.length === 0 && !isTurnBusy ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-accent/60 text-brand">
              {session?.kind === "agent" ? <Bot className="size-5" /> : <Sparkles className="size-5" />}
            </div>
            <h3 className="mt-3 text-sm font-medium text-foreground">
              {session?.title || "New Conversation"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Send a prompt below to run this task on your computer.
            </p>
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}

        {isTurnBusy ? (
          <ActiveTurnIndicator turn={activeTurn} />
        ) : null}

        {activeTurn && activeTurn.status === "failed" ? (
          <TurnErrorBanner turn={activeTurn} />
        ) : null}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const timeLabel = formatMessageTime(message.createdAt);

  if (isUser) {
    return (
      <div className="flex flex-col items-end space-y-1">
        <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-accent/80 px-4 py-2.5 text-xs text-foreground shadow-2xs">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {timeLabel ? (
          <span className="px-1 text-[11px] text-muted-foreground">{timeLabel}</span>
        ) : null}
      </div>
    );
  }

  // DESIGN.md §8.1: Agent output is typeset text in a centred 68ch column with no container
  return (
    <div className="flex flex-col space-y-2 text-foreground">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Bot className="size-3.5 text-brand" />
        <span className="font-medium text-foreground">
          {message.meta?.model ? String(message.meta.model) : "Agent"}
        </span>
        {timeLabel ? <span>{timeLabel}</span> : null}
      </div>

      <div className="text-[13px] leading-[1.6] text-foreground">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
}

function ActiveTurnIndicator({ turn }: { turn: ChatTurnState }) {
  const label =
    turn.status === "waiting"
      ? turn.waitingReason === "no_runtime_paired"
        ? "Waiting for a connected computer..."
        : "Turn queued for execution..."
      : "Agent is thinking...";

  return (
    <div className="flex flex-col space-y-2 rounded-lg border border-border/60 bg-card/40 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-brand" />
        <span className="font-medium text-foreground">{label}</span>
      </div>

      {turn.replyText ? (
        <div className="mt-2 text-[13px] leading-[1.6] text-foreground">
          <p className="whitespace-pre-wrap break-words">{turn.replyText}</p>
        </div>
      ) : null}
    </div>
  );
}

function TurnErrorBanner({ turn }: { turn: ChatTurnState }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 text-xs text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">Execution failed</p>
        <p className="text-muted-foreground">{turn.error || "The agent could not complete this turn."}</p>
      </div>
    </div>
  );
}
