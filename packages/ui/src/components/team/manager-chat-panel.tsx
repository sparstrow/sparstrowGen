import * as React from "react";
import { Bot, MessageSquare, Pencil, Rocket, Send } from "lucide-react";
import { type DraftPipeline, validateDraftForPublish, draftToCreatePayload } from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTeamManagerChat, useCreatePipeline } from "@/api/hooks";
import { cn } from "@/lib/utils";
import { PipelineCanvas } from "@/components/pipelines/pipeline-canvas";
import { PipelineList } from "@/components/pipelines/pipeline-list";

export function ManagerChatPanel({
  teamId,
  roster,
  defaultMode = "advisor",
}: {
  teamId: string;
  roster: { id: string; name: string }[];
  defaultMode?: "advisor" | "draft";
}) {
  const [mode, setMode] = React.useState<"advisor" | "draft">(defaultMode);
  const [draft, setDraft] = React.useState<DraftPipeline | undefined>(undefined);
  const [message, setMessage] = React.useState("");
  const [history, setHistory] = React.useState<{ role: "user" | "advisor"; text: string }[]>([]);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorView, setEditorView] = React.useState<"canvas" | "list">("canvas");

  const chatMutation = useTeamManagerChat(teamId);
  const createPipeline = useCreatePipeline();

  const validation = draft ? validateDraftForPublish(draft, roster) : { ok: false, reasons: [] };

  const handlePublish = () => {
    if (!draft || !validation.ok) return;
    createPipeline.mutate(draftToCreatePayload(draft, teamId), {
      onSuccess: (created) => {
        setEditorOpen(false);
        setHistory((prev) => [
          ...prev,
          { role: "advisor", text: `✓ Published "${created.name}" to this team's pipelines.` },
        ]);
        setDraft(undefined);
      },
      onError: (err: any) => {
        setHistory((prev) => [
          ...prev,
          { role: "advisor", text: `Publish failed: ${err.message || "could not create pipeline."}` },
        ]);
      },
    });
  };

  const handleSend = () => {
    if (!message.trim() || chatMutation.isPending) return;

    const userMessage = message.trim();
    setHistory((prev) => [...prev, { role: "user", text: userMessage }]);
    setMessage("");

    chatMutation.mutate(
      { message: userMessage, mode, draft: mode === "draft" ? draft : undefined },
      {
        onSuccess: (data) => {
          setHistory((prev) => [...prev, { role: "advisor", text: data.reply }]);
          if ("draft" in data && data.draft) {
            setDraft(data.draft);
          }
        },
        onError: (err: any) => {
          setHistory((prev) => [
            ...prev,
            { role: "advisor", text: `Error: ${err.message || "Failed to communicate with Advisor."}` },
          ]);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-4 rounded-lg border bg-card p-4 shadow-sm flex flex-col h-[500px]">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Team Manager</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={mode === "advisor" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("advisor")}
            >
              Advisor
            </Button>
            <Button
              variant={mode === "draft" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("draft")}
            >
              Draft Pipeline
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center mt-8">
              {mode === "advisor" 
                ? "Ask the Advisor a question about this team's projects, members, or tasks." 
                : "Ask the Manager to draft a new pipeline for this team."}
            </p>
          ) : (
            history.map((msg, idx) => (
              <div key={idx} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground border"
                  )}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}
          {chatMutation.isPending && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground border flex items-center gap-2">
                <Bot className="size-4 animate-pulse" />
                {mode === "draft" ? "Drafting..." : "Advisor is thinking..."}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-end gap-2 pt-2 border-t mt-auto">
          <Textarea
            placeholder="Ask a question..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-32 resize-none"
            rows={1}
          />
          <Button size="icon" className="shrink-0 mb-[2px]" onClick={handleSend} disabled={!message.trim() || chatMutation.isPending}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
      
      {mode === "draft" && (
        <div className="w-[350px] shrink-0 space-y-4 rounded-lg border bg-card p-4 shadow-sm flex flex-col h-[500px] overflow-y-auto">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-semibold">Pipeline Draft Preview</h3>
            {draft && (
              <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)}>
                <Pencil className="mr-2 size-3.5" /> Edit
              </Button>
            )}
          </div>
          {!draft ? (
            <p className="text-sm text-muted-foreground">No draft yet.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground font-semibold">Name</p>
                <p className="text-sm">{draft.name || <span className="italic text-muted-foreground">Unnamed Pipeline</span>}</p>
              </div>
              {draft.description && (
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Description</p>
                  <p className="text-sm text-muted-foreground">{draft.description}</p>
                </div>
              )}
              
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-2">Steps</p>
                {!draft.steps || draft.steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No steps defined.</p>
                ) : (
                  <div className="space-y-2">
                    {draft.steps.map((step, idx) => (
                      <div key={idx} className="rounded border p-2 text-sm bg-muted/30">
                        <div className="flex items-center gap-2 font-medium mb-1">
                          <span className="text-muted-foreground text-xs">{idx + 1}.</span>
                          {step.unresolvedAgentName ? (
                            <span className="bg-destructive/10 text-destructive text-xs px-1.5 py-0.5 rounded border border-destructive/20 font-semibold">
                              Unknown Agent: {step.unresolvedAgentName} - Needs resolution
                            </span>
                          ) : (
                            <span>{step.agentId || "No agent"}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {step.promptTemplate || "No prompt template"}
                        </p>
                        {step.onFailure === "continue" && (
                          <p className="text-xs text-muted-foreground mt-1 font-medium">On Failure: Continue</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-3">
          <DialogHeader className="flex flex-row items-center justify-between mr-8">
            <div>
              <DialogTitle>Edit &amp; publish pipeline</DialogTitle>
              <DialogDescription>
                Arrange the steps, resolve any flagged agents, then publish to this team&apos;s pipelines.
              </DialogDescription>
            </div>
            {draft && (
              <Tabs value={editorView} onValueChange={(v) => setEditorView(v as "canvas" | "list")} className="w-[200px]">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="canvas">Canvas</TabsTrigger>
                  <TabsTrigger value="list">List</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </DialogHeader>
          <div className="min-h-0 flex-1 border rounded-lg bg-muted/10 overflow-hidden">
            {draft && editorView === "canvas" && (
              <PipelineCanvas value={draft} roster={roster} onChange={setDraft} />
            )}
            {draft && editorView === "list" && (
              <div className="h-full p-4">
                <PipelineList value={draft} roster={roster} onChange={setDraft} />
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {validation.ok ? (
                <span className="text-success">Ready to publish.</span>
              ) : (
                <span>
                  {validation.reasons[0]}
                  {validation.reasons.length > 1 ? ` (+${validation.reasons.length - 1} more)` : ""}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Close
              </Button>
              <Button onClick={handlePublish} disabled={!validation.ok || createPipeline.isPending}>
                <Rocket className="mr-2 size-4" />
                {createPipeline.isPending ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
