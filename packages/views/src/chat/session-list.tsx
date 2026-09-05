"use client";

import * as React from "react";
import {
  Bot,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useChatSessions,
  useDeleteChatSession,
  useRenameChatSession,
} from "@sparstrow/core";
import type { ChatSession } from "@sparstrow/shared";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Skeleton } from "@sparstrow/ui/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sparstrow/ui/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sparstrow/ui/components/ui/dialog";
import { Input } from "@sparstrow/ui/components/ui/input";
import { Label } from "@sparstrow/ui/components/ui/label";
import { cn } from "@sparstrow/ui/lib/utils";

export interface SessionListProps {
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  className?: string;
}

function formatSessionDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

export function SessionList({
  activeSessionId,
  onSelectSession,
  onNewChat,
  className,
}: SessionListProps) {
  const sessions = useChatSessions();
  const deleteSession = useDeleteChatSession();
  const renameSession = useRenameChatSession();

  const [renameTarget, setRenameTarget] = React.useState<ChatSession | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");

  const handleOpenRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameTarget(session);
    setRenameTitle(session.title || "Untitled conversation");
  };

  const handleConfirmRename = async () => {
    if (!renameTarget) return;
    const nextTitle = renameTitle.trim();
    if (!nextTitle) return;

    try {
      await renameSession.mutateAsync({
        sessionId: renameTarget.id,
        title: nextTitle,
      });
      setRenameTarget(null);
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  };

  const handleDelete = async (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession.mutateAsync(session.id);
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  return (
    <div className={cn("flex h-full flex-col border-r bg-card/30", className)}>
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conversations
        </h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onNewChat}
        >
          <Plus className="size-3.5" strokeWidth={2} />
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.isPending ? (
          <div className="space-y-2 p-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border p-2.5">
                <Skeleton className="size-7 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-2.5 w-36" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {sessions.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs"
          >
            <p className="font-medium text-foreground">Could not load conversations.</p>
            <p className="mt-1 text-muted-foreground">{sessions.error.message}</p>
          </div>
        ) : null}

        {!sessions.isPending && !sessions.isError && (sessions.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <MessageSquare className="mx-auto size-6 stroke-[1.5] text-muted-foreground" />
            <p className="mt-2 text-xs font-medium text-foreground">No conversations yet</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Start a chat with an agent to see results here.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-xs"
              onClick={onNewChat}
            >
              Start conversation
            </Button>
          </div>
        ) : null}

        {sessions.data && sessions.data.length > 0 ? (
          <div className="space-y-1">
            {sessions.data.map((session) => {
              const isActive = activeSessionId === session.id;
              const dateLabel = formatSessionDate(session.lastMessageAt || session.createdAt);

              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSession(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelectSession(session.id);
                    }
                  }}
                  className={cn(
                    "group relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                    isActive
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <div className="shrink-0">
                    {session.kind === "agent" ? (
                      <Bot className={cn("size-4", isActive ? "text-brand" : "text-muted-foreground")} />
                    ) : (
                      <Sparkles className={cn("size-4", isActive ? "text-brand" : "text-muted-foreground")} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {session.title || "Untitled conversation"}
                    </p>
                    {dateLabel ? (
                      <p className="truncate text-[11px] text-muted-foreground">{dateLabel}</p>
                    ) : null}
                  </div>

                  <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="size-3.5" />
                          <span className="sr-only">Conversation options</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem onClick={(e) => handleOpenRename(session, e)}>
                          <Pencil className="mr-2 size-3.5" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => void handleDelete(session, e)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {renameTarget ? (
        <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Conversation</DialogTitle>
              <DialogDescription>Enter a new name for this conversation.</DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <Label htmlFor="rename-input" className="text-xs font-medium">
                Title
              </Label>
              <Input
                id="rename-input"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                className="mt-1.5 h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleConfirmRename();
                }}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleConfirmRename()}
                disabled={renameSession.isPending || !renameTitle.trim()}
              >
                {renameSession.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
