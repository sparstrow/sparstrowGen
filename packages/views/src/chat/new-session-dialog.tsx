"use client";

import * as React from "react";
import { Bot, MessageSquare, Sparkles } from "lucide-react";
import { useAgents, useCreateChatSession } from "@sparstrow/core";
import { CLAUDE_CODE_MODEL_CATALOG } from "@sparstrow/shared";
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
  const [selectedModel, setSelectedModel] = React.useState<string>("claude-sonnet-5");
  const [moreModelsOpen, setMoreModelsOpen] = React.useState(false);
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
          provider: "claude-code",
          model: selectedModel,
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
                    const isSelected = agent.id === selectedAgentId;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={`flex w-full items-center justify-between rounded-md p-2 text-left text-xs transition-colors ${
                          isSelected
                            ? "border border-brand bg-accent/30 text-foreground"
                            : "border border-transparent hover:bg-accent/20 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-foreground">{agent.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">
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

          {selectedKind === "free" ? (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select Model</Label>
              <div className="space-y-1.5 rounded-md border p-1.5 max-h-48 overflow-y-auto">
                {CLAUDE_CODE_MODEL_CATALOG.filter((m) => m.category === "primary").map((m) => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedModel(m.id)}
                      className={`flex w-full items-center justify-between rounded-md p-2 text-left text-xs transition-colors ${
                        isSelected
                          ? "border border-amber-500/40 bg-amber-500/10 text-foreground"
                          : "border border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{m.label}</span>
                          {m.badge ? (
                            <span className="rounded px-1 py-0.2 font-mono text-[9px] bg-muted border border-border text-muted-foreground font-semibold">
                              {m.badge}
                            </span>
                          ) : null}
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground">{m.id}</p>
                      </div>
                      {isSelected ? (
                        <div className="size-1.5 rounded-full bg-amber-400" />
                      ) : null}
                    </button>
                  );
                })}

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setMoreModelsOpen(!moreModelsOpen)}
                    className="flex w-full items-center justify-between rounded p-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  >
                    <span>More models ({CLAUDE_CODE_MODEL_CATALOG.filter((m) => m.category === "more").length})</span>
                    <span className="text-[10px] font-mono">
                      {moreModelsOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {moreModelsOpen ? (
                    <div className="mt-1 space-y-1 pl-1 border-l border-border/60">
                      {CLAUDE_CODE_MODEL_CATALOG.filter((m) => m.category === "more").map((m) => {
                        const isSelected = selectedModel === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedModel(m.id)}
                            className={`flex w-full items-center justify-between rounded-md p-1.5 text-left text-xs transition-colors ${
                              isSelected
                                ? "border border-amber-500/40 bg-amber-500/10 text-foreground"
                                : "border border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-medium text-foreground">{m.label}</span>
                              <p className="font-mono text-[10px] text-muted-foreground">{m.id}</p>
                            </div>
                            {isSelected ? (
                              <div className="size-1.5 rounded-full bg-amber-400" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
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
