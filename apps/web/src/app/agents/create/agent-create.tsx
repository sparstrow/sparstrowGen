import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ArrowLeft, ArrowRight, History, Plus, Sparkles } from "lucide-react";
import type {
  Agent,
  AgentDraft,
  AgentMatch,
  ChatMessage,
  ChatTurnError,
  DraftTurn,
  ProviderId,
} from "@sparstrow/shared";
import { renderSkillMd } from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AgentFields,
  agentToForm,
  formToPayload,
  type AgentFormValues,
} from "@/components/agent-form";
import { ChatTurnView, ThinkingDots, TurnErrorBanner } from "@/components/chat/chat-bits";
import {
  useAgentDraftTurn,
  useAgents,
  useChatSession,
  useChatSessions,
  useCreateAgent,
  useCreateChatSession,
  useRetryAgentDraftTurn,
  useUpdateChatSession,
} from "@/api/hooks";
import { formatDate } from "@/lib/format";

const STARTERS = [
  "Build a code reviewer for my TypeScript repo",
  "Create a research assistant that can search the web",
  "Make a writing agent scoped to one project",
  "Set up a read-only planning agent",
];

function applyDraft(v: AgentFormValues, d: AgentDraft): AgentFormValues {
  return {
    ...v,
    name: d.name ?? v.name,
    role: d.role ?? v.role,
    systemPrompt: d.systemPrompt ?? v.systemPrompt,
    provider: d.provider ?? v.provider,
    model: d.model ?? v.model,
    cwd: d.cwd !== undefined ? (d.cwd ?? "") : v.cwd,
    addDirs: d.addDirs ? d.addDirs.join("\n") : v.addDirs,
    allowedTools: d.allowedTools ? d.allowedTools.join(", ") : v.allowedTools,
    disallowedTools: d.disallowedTools ? d.disallowedTools.join(", ") : v.disallowedTools,
    permissionMode: d.permissionMode ?? v.permissionMode,
    maxTurns: d.maxTurns != null ? String(d.maxTurns) : v.maxTurns,
    memoryReadScopes: d.memoryReadScopes ?? v.memoryReadScopes,
    memoryWriteScopes: d.memoryWriteScopes ?? v.memoryWriteScopes,
    enabled: d.enabled ?? v.enabled,
  };
}

/**
 * Full-page Agent Creator (intake 0001): the interview moved out of the modal
 * into a dedicated page with room to converse, backed by persistent chat
 * sessions — closing the browser never loses the interview; resume any earlier
 * session from the history dropdown. The right panel keeps the live draft and
 * a "Create agent" button; after creation a "View agent" button appears.
 */
export function AgentCreatePage() {
  const navigate = useNavigate();
  const agents = useAgents();
  const createAgent = useCreateAgent();
  const sessions = useChatSessions({ kind: "agent-creator" });
  const createSession = useCreateChatSession();
  const updateSession = useUpdateChatSession();
  const postTurn = useAgentDraftTurn();
  const retryTurn = useRetryAgentDraftTurn();

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const detail = useChatSession(sessionId);

  const [input, setInput] = React.useState("");
  const [values, setValues] = React.useState<AgentFormValues>(() => agentToForm(null));
  const [source, setSource] = React.useState<"ai" | "fallback" | null>(null);
  const [followups, setFollowups] = React.useState<string[]>([]);
  const [matches, setMatches] = React.useState<AgentMatch[]>([]);
  const [turnError, setTurnError] = React.useState<ChatTurnError | null>(null);
  const [pendingContent, setPendingContent] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Agent | null>(null);
  const hydratedRef = React.useRef<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const messages: ChatMessage[] = detail.data?.messages ?? [];
  const busy = postTurn.isPending || retryTurn.isPending || createSession.isPending;
  // Intake 0008's bug, on this page: the server persists the user row before
  // running the model, and a refetch racing that window (near-certain right
  // after createSession's onSuccess sets sessionId) returns a transcript that
  // already contains the message `pendingContent` is still showing
  // optimistically. Once `messages` already ends with that exact user turn,
  // stop rendering the optimistic bubble on top of it — see
  // doc/bug/BUG-2026-08-23-agent-creator-duplicate-user-bubble.md.
  const lastMessage = messages[messages.length - 1];
  const pendingAlreadyPersisted =
    pendingContent != null &&
    lastMessage?.role === "user" &&
    lastMessage.content === pendingContent;

  // Rehydrate a resumed session: draft → form values, last assistant turn →
  // followups/matches. Runs once per selected session.
  React.useEffect(() => {
    if (!detail.data || hydratedRef.current === detail.data.session.id) return;
    hydratedRef.current = detail.data.session.id;
    const draft = (detail.data.session.draft ?? {}) as AgentDraft;
    setValues(applyDraft(agentToForm(null), draft));
    const lastAssistant = [...detail.data.messages].reverse().find((m) => m.role === "assistant");
    setFollowups((lastAssistant?.meta?.followups as string[] | undefined) ?? []);
    setMatches((lastAssistant?.meta?.matches as AgentMatch[] | undefined) ?? []);
    setSource((lastAssistant?.meta?.source as "ai" | "fallback" | undefined) ?? null);
    setTurnError(null);
    setCreated(null);
  }, [detail.data]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, pendingContent, busy]);

  const startNew = () => {
    setSessionId(null);
    hydratedRef.current = null;
    setValues(agentToForm(null));
    setFollowups([]);
    setMatches([]);
    setSource(null);
    setTurnError(null);
    setCreated(null);
    setInput("");
  };

  const applyTurnResult = (turn: {
    error: ChatTurnError | null;
    draftTurn: DraftTurn | null;
  }): void => {
    setPendingContent(null);
    setTurnError(turn.error);
    if (turn.draftTurn) {
      setValues((v) => applyDraft(v, turn.draftTurn!.draft));
      setMatches(turn.draftTurn.matches);
      if (!turn.error) {
        setFollowups(turn.draftTurn.followups);
        setSource(turn.draftTurn.source);
      }
    }
  };

  const postTo = (id: string, content: string) => {
    postTurn.mutate(
      { sessionId: id, content, draft: formToPayload(values) as Record<string, unknown> },
      {
        onSuccess: applyTurnResult,
        onError: (err) => {
          setPendingContent(null);
          setTurnError({ kind: "unknown", reason: err.message, attempts: 0, fallback: null });
        },
      },
    );
  };

  const send = (content: string) => {
    const text = content.trim();
    if (!text || busy) return;
    setInput("");
    setTurnError(null);
    setPendingContent(text);
    if (sessionId) {
      postTo(sessionId, text);
    } else {
      createSession.mutate(
        { kind: "agent-creator" },
        {
          onSuccess: (s) => {
            hydratedRef.current = s.id; // fresh session — nothing to rehydrate
            setSessionId(s.id);
            postTo(s.id, text);
          },
          onError: (err) => {
            setPendingContent(null);
            setTurnError({ kind: "unknown", reason: err.message, attempts: 0, fallback: null });
          },
        },
      );
    }
  };

  const retry = (override?: { provider: string; model: string }) => {
    if (!sessionId || busy) return;
    setPendingContent("");
    retryTurn.mutate(
      {
        sessionId,
        provider: override?.provider as ProviderId | undefined,
        model: override?.model,
        draft: formToPayload(values) as Record<string, unknown>,
      },
      {
        onSuccess: applyTurnResult,
        onError: (err) => {
          setPendingContent(null);
          setTurnError({ kind: "unknown", reason: err.message, attempts: 0, fallback: null });
        },
      },
    );
  };

  const canCreate = values.name.trim().length > 0 && values.model.trim().length > 0;
  const payload = formToPayload(values);
  const createError = createAgent.error != null ? (createAgent.error as Error).message : null;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-0 flex-col overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/agents" })}>
            <ArrowLeft className="size-4" /> Agents
          </Button>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" /> Agent Creator
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={sessionId ?? "new"}
            onValueChange={(v) => {
              if (v === "new") startNew();
              else setSessionId(v);
            }}
          >
            <SelectTrigger className="h-8 w-64 text-xs">
              <History className="size-3.5" />
              <SelectValue placeholder="Session history" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New session</SelectItem>
              {(sessions.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {(s.title || "Untitled session") +
                    ` — ${formatDate(s.lastMessageAt ?? s.createdAt)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={startNew}>
            <Plus className="size-4" /> New
          </Button>
        </div>
      </div>

      <PanelGroup direction="horizontal" autoSaveId="agent-creator-layout" className="min-h-0 flex-1">
        {/* Left: persistent interview chat */}
        <Panel defaultSize={50} minSize={30}>
        <div className="flex h-full min-h-0 flex-col">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.length === 0 && !pendingContent ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Describe the agent you want. I'll interview you one question at a time until the
                  workflow is fully understood, summarize it back for your confirmation, and only
                  then draft the agent. The conversation is saved — you can close this page and
                  resume from the session history.
                </p>
                <div className="grid gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <ChatTurnView key={m.id} message={m} />)
            )}
            {pendingContent && !pendingAlreadyPersisted && (
              <ChatTurnView message={{ role: "user", content: pendingContent, meta: null }} />
            )}
            {busy && <ThinkingDots />}
            {source === "fallback" && !turnError && (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                AI drafting is unavailable — using basic mode. Edit fields on the right.
              </p>
            )}
            {turnError && !busy && (
              <TurnErrorBanner
                error={turnError}
                retrying={busy}
                onRetryPrimary={() => retry()}
                onRetrySecondary={(t) => retry(t)}
              />
            )}
            {matches.length > 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                <p className="mb-1 font-medium text-foreground">
                  You may already have {matches.length === 1 ? "an agent" : "agents"} like this —
                  reuse or extend instead of duplicating.
                </p>
                <div className="space-y-1">
                  {matches.map((mm) => (
                    <div key={mm.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-foreground">
                        <span className="font-medium">{mm.name}</span>
                        {mm.similarity != null && (
                          <span className="text-muted-foreground">
                            {" · "}
                            {Math.round(mm.similarity * 100)}% similar
                          </span>
                        )}
                        {mm.role && <span className="text-muted-foreground"> — {mm.role}</span>}
                      </span>
                      {agents.data?.some((a) => a.id === mm.id) && (
                        <Button size="sm" variant="outline" onClick={() => navigate({ to: "/agents" })}>
                          Open
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {followups.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t px-5 py-2">
              {followups.map((f) => (
                <button
                  key={f}
                  onClick={() => send(f)}
                  className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent"
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          <div className="border-t p-3">
            <Textarea
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Describe the agent…  (Enter to send, Shift+Enter for newline)"
            />
          </div>
        </div>
        </Panel>
        <PanelResizeHandle className="w-px bg-border transition-colors data-[resize-handle-state=drag]:bg-primary data-[resize-handle-state=hover]:bg-primary/50" />

        {/* Right: live draft + SKILL.md preview + create */}
        <Panel defaultSize={50} minSize={30}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <AgentFields values={values} set={(k, val) => setValues((v) => ({ ...v, [k]: val }))} />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                SKILL.md preview — updates live as the interview fills the draft
              </p>
              <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                {renderSkillMd(payload)}
              </pre>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
            {created ? (
              <Button onClick={() => navigate({ to: "/agents" })}>
                View agent <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                disabled={!canCreate || createAgent.isPending}
                onClick={() =>
                  createAgent.mutate(payload, {
                    onSuccess: (agent) => {
                      setCreated(agent);
                      // The interview stays as a historical log; archive it so
                      // the active list stays clean.
                      if (sessionId) {
                        updateSession.mutate({ id: sessionId, data: { status: "archived" } });
                      }
                    },
                  })
                }
              >
                {createAgent.isPending ? "Creating…" : "Create agent"}
              </Button>
            )}
          </div>
        </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
