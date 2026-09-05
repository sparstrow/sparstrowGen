"use client";

import * as React from "react";
import { Bot, MessageSquare, Plus, Sparkles } from "lucide-react";
import { useChatSession, useChatSessions } from "@sparstrow/core";
import { Button } from "@sparstrow/ui/components/ui/button";
import { cn } from "@sparstrow/ui/lib/utils";
import { SessionList } from "./session-list";
import { Transcript } from "./transcript";
import { Composer } from "./composer";
import { NewSessionDialog } from "./new-session-dialog";

export interface ChatLayoutProps {
  initialSessionId?: string | null;
  onSessionChange?: (sessionId: string | null) => void;
  className?: string;
}

export function ChatLayout({
  initialSessionId = null,
  onSessionChange,
  className,
}: ChatLayoutProps) {
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(initialSessionId);
  const [newSessionOpen, setNewSessionOpen] = React.useState(false);

  const sessionsQuery = useChatSessions();
  const sessions = sessionsQuery.data ?? [];

  // If no session is selected yet, default to the first available session
  React.useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      const firstId = sessions[0]?.id;
      if (firstId) {
        setActiveSessionId(firstId);
        onSessionChange?.(firstId);
      }
    }
  }, [activeSessionId, sessions, onSessionChange]);

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    onSessionChange?.(id);
  };

  const handleSessionCreated = (id: string) => {
    setActiveSessionId(id);
    onSessionChange?.(id);
  };

  const activeSessionDetail = useChatSession(activeSessionId);
  const activeSession = activeSessionDetail.data?.session;

  return (
    <div className={cn("flex h-full w-full overflow-hidden bg-background", className)}>
      {/* Sessions Sidebar */}
      <div className="w-72 shrink-0">
        <SessionList
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={() => setNewSessionOpen(true)}
        />
      </div>

      {/* Main Conversation Area */}
      <div className="flex flex-1 flex-col min-w-0 bg-background">
        {activeSessionId ? (
          <>
            {/* Session Top Bar */}
            <div className="flex h-11 shrink-0 items-center justify-between border-b px-4 bg-card/20">
              <div className="flex items-center gap-2 min-w-0">
                {activeSession?.kind === "agent" ? (
                  <Bot className="size-4 text-brand shrink-0" />
                ) : (
                  <Sparkles className="size-4 text-brand shrink-0" />
                )}
                <h2 className="truncate text-xs font-semibold text-foreground">
                  {activeSession?.title || "Conversation"}
                </h2>
                {activeSession?.model ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {activeSession.provider ? `${activeSession.provider} / ` : ""}
                    {activeSession.model}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Transcript */}
            <Transcript sessionId={activeSessionId} />

            {/* Composer */}
            <Composer sessionId={activeSessionId} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent/50 text-muted-foreground">
              <MessageSquare className="size-6 stroke-[1.5]" />
            </div>
            <h3 className="mt-3 text-sm font-medium text-foreground">
              Select or start a conversation
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Run coding tasks, analyze repositories, and chat with your local agents directly.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setNewSessionOpen(true)}
            >
              <Plus className="size-3.5" />
              Start conversation
            </Button>
          </div>
        )}
      </div>

      <NewSessionDialog
        open={newSessionOpen}
        onOpenChange={setNewSessionOpen}
        onSessionCreated={handleSessionCreated}
      />
    </div>
  );
}
