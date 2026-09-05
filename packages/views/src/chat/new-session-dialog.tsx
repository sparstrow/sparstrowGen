"use client";

import * as React from "react";
import { Bot, MessageSquare, Sparkles } from "lucide-react";
import { useAgents, useCreateChatSession } from "@sparstrow/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sparstrow/ui/components/ui/dialog";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Input } from "@sparstrow/ui/components/ui/input";
import { Label } from "@sparstrow/ui/components/ui/label";
import { Skeleton } from "@sparstrow/ui/components/ui/skeleton";

export interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionCreated: (sessionId: string) => void;
}

export function NewSessionDialog({
  open,
  onOpenChange,
  onSessionCreated,
}: NewSessionDialogProps) {
  const agents = useAgents();
  const createSession = useCreateChatSession();

  const [title, setTitle] = React.useState("");
  const [selectedKind, setSelectedKind] = React.useState<"agent" | "free">("agent");
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Default to first agent when agents list finishes loading
  React.useEffect(() => {
    if (agents.data && agents.data.length > 0 && !selectedAgentId) {
      const firstCli = agents.data.find(
        (a) => a.provider === "claude-code" || a.provider === "antigravity"
      ) ?? agents.data[0];
      if (firstCli) {
        setSelectedAgentId(firstCli.id);
      }
    }

  }, [agents.data, selectedAgentId]);

  const handleCreate = async () => {
    setError(null);

    try {
      if (selectedKind === "agent") {
        if (!selectedAgentId) {
          setError("Please select an agent to start the conversation.");
          return;
        }

        const agent = agents.data?.find((a) => a.id === selectedAgentId);
        const sessionTitle = title.trim() || (agent ? `Chat with ${agent.name}` : "Agent Chat");

        const session = await createSession.mutateAsync({
          kind: "agent",
          agentId: selectedAgentId,
          title: sessionTitle,
        });

        onSessionCreated(session.id);
        onOpenChange(false);
        resetForm();
      } else {
        const sessionTitle = title.trim() || "Free Chat";
        const session = await createSession.mutateAsync({
          kind: "free",
          title: sessionTitle,
        });

        onSessionCreated(session.id);
        onOpenChange(false);
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation.");
    }
  };

  const resetForm = () => {
    setTitle("");
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start New Conversation</DialogTitle>
          <DialogDescription>
            Pick an agent or start a direct conversation on your machine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label className="text-xs font-medium">Conversation Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedKind("agent")}
                className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  selectedKind === "agent"
                    ? "border-brand bg-accent/40 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/20"
                }`}
              >
                <Bot className="size-4 shrink-0 text-brand" />
                <div>
                  <p className="font-medium text-foreground">Workspace Agent</p>
                  <p className="text-[11px] text-muted-foreground">Runs with agent skills and tools</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedKind("free")}
                className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                  selectedKind === "free"
                    ? "border-brand bg-accent/40 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/20"
                }`}
              >
                <Sparkles className="size-4 shrink-0 text-brand" />
                <div>
                  <p className="font-medium text-foreground">Direct Chat</p>
                  <p className="text-[11px] text-muted-foreground">Stateless CLI model prompt</p>
                </div>
              </button>
            </div>
          </div>

          {selectedKind === "agent" ? (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select Agent</Label>
              {agents.isPending ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-9 w-full rounded-md" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ) : agents.data && agents.data.length > 0 ? (
                <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border p-1.5">
                  {agents.data.map((agent) => {
                    const isSelected = selectedAgentId === agent.id;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{agent.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {agent.provider} / {agent.model}
                          </p>
                        </div>
                        {isSelected ? (
                          <div className="size-1.5 rounded-full bg-brand" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  No agents found in this workspace. You can use Direct Chat instead.
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="session-title" className="text-xs font-medium">
              Title (Optional)
            </Label>
            <Input
              id="session-title"
              placeholder="e.g. Investigate build failure"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCreate()}
            disabled={createSession.isPending || (selectedKind === "agent" && !selectedAgentId)}
          >
            {createSession.isPending ? "Creating..." : "Start Chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
