import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowUp,
  Bot,
  FolderKanban,
  MessageSquare,
  MonitorPlay,
  PanelRight,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  KNOWN_MODELS,
  PROVIDER_KINDS,
  type ChatSession,
  type ChatSessionKind,
  type ChatTurnError,
  type ProviderId,
} from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatTurnView, ThinkingDots, TurnErrorBanner } from "@/components/chat/chat-bits";
import {
  useAgents,
  useChatSession,
  useChatSessions,
  useCreateChatSession,
  usePostChatTurn,
  useProjects,
  useRetryChatTurn,
  useUpdateChatSession,
} from "@/api/hooks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const CLI_PROVIDERS = (Object.keys(PROVIDER_KINDS) as ProviderId[]).filter(
  (p) => PROVIDER_KINDS[p] === "cli",
);

const KIND_LABELS: Record<ChatSessionKind, string> = {
  free: "Free chat",
  project: "Project",
  agent: "Agent",
  "agent-creator": "Agent Creator",
};

const KIND_ICONS: Record<ChatSessionKind, typeof MessageSquare> = {
  free: MessageSquare,
  project: FolderKanban,
  agent: Bot,
  "agent-creator": Sparkles,
};

/** Borderless select used inside the composer footer and toolbar. */
function GhostSelect({
  value,
  onValueChange,
  placeholder,
  children,
  width = "w-auto",
  title,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  children: React.ReactNode;
  width?: string;
  title?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        title={title}
        className={cn(
          "h-7 gap-1 rounded-md border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground focus:ring-0",
          width,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/**
 * The composer is the center of gravity (Claude Code desktop style): a single
 * bordered container holding the textarea, the context/model controls, and
 * the send affordance. Context lives here, not in a modal.
 */
function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  controls,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  controls: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background shadow-sm transition-shadow focus-within:border-ring/60 focus-within:shadow-md">
      <textarea
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        className="max-h-44 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/70 disabled:opacity-50 [field-sizing:content]"
      />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-0.5">{controls}</div>
        <Button
          size="icon"
          className="size-8 shrink-0 rounded-full"
          disabled={disabled || value.trim().length === 0}
          onClick={onSend}
          aria-label="Send message"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function ChatPage() {
  const projects = useProjects();
  const agents = useAgents();
  const createSession = useCreateChatSession();
  const updateSession = useUpdateChatSession();
  const postTurn = usePostChatTurn();
  const retryTurn = useRetryChatTurn();

  // Sidebar filters (intake 0002: group/filter sessions by project, status…).
  const [filterKind, setFilterKind] = React.useState<"all" | ChatSessionKind>("all");
  const [filterProject, setFilterProject] = React.useState<string>("all");
  const [showArchived, setShowArchived] = React.useState(false);

  const sessions = useChatSessions({
    kind: filterKind === "all" ? undefined : filterKind,
    projectId: filterProject === "all" ? undefined : filterProject,
    status: showArchived ? undefined : "active",
  });

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const detail = useChatSession(selectedId);
  const session = detail.data?.session ?? null;

  // Draft context for a conversation that hasn't started yet (no modal:
  // the empty canvas + composer carry the context controls).
  const [draftKind, setDraftKind] = React.useState<ChatSessionKind>("free");
  const [draftProjectId, setDraftProjectId] = React.useState("");
  const [draftAgentId, setDraftAgentId] = React.useState("");
  const [draftProvider, setDraftProvider] = React.useState<ProviderId>("claude-code");
  const [draftModel, setDraftModel] = React.useState("sonnet");

  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState<{ sessionId: string; content: string } | null>(null);
  const [turnErrors, setTurnErrors] = React.useState<Record<string, ChatTurnError>>({});
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const messages = detail.data?.messages ?? [];
  const busy = postTurn.isPending || retryTurn.isPending || createSession.isPending;
  const turnError = selectedId ? turnErrors[selectedId] : undefined;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, pending, selectedId]);

  const applyTurn = (sessionId: string, error: ChatTurnError | null) => {
    setPending(null);
    setTurnErrors((prev) => {
      const next = { ...prev };
      if (error) next[sessionId] = error;
      else delete next[sessionId];
      return next;
    });
  };

  const failLocal = (sessionId: string, message: string) =>
    applyTurn(sessionId, { kind: "unknown", reason: message, attempts: 0, fallback: null });

  const postTo = (sessionId: string, content: string) => {
    setPending({ sessionId, content });
    postTurn.mutate(
      { sessionId, content },
      {
        onSuccess: (turn) => applyTurn(sessionId, turn.error),
        onError: (err) => failLocal(sessionId, err.message),
      },
    );
  };

  const send = () => {
    const content = input.trim();
    if (!content || busy) return;
    setInput("");
    if (selectedId) {
      postTo(selectedId, content);
      return;
    }
    // First message of a fresh conversation: create the session from the
    // composer's context controls, then post.
    createSession.mutate(
      {
        kind: draftKind,
        ...(draftKind === "project" ? { projectId: draftProjectId } : {}),
        ...(draftKind === "agent" ? { agentId: draftAgentId } : {}),
        ...(draftKind === "free" ? { provider: draftProvider, model: draftModel } : {}),
      },
      {
        onSuccess: (s) => {
          setSelectedId(s.id);
          postTo(s.id, content);
        },
        onError: (err) => {
          setInput(content);
          failLocal("", err.message);
        },
      },
    );
  };

  const retry = (override?: { provider: string; model: string }) => {
    if (!selectedId || busy) return;
    setPending({ sessionId: selectedId, content: "" });
    retryTurn.mutate(
      {
        sessionId: selectedId,
        provider: override?.provider as ProviderId | undefined,
        model: override?.model,
      },
      {
        onSuccess: (turn) => applyTurn(selectedId, turn.error),
        onError: (err) => failLocal(selectedId, err.message),
      },
    );
  };

  const projectName = (id: string | null) =>
    id ? (projects.data?.find((p) => p.id === id)?.name ?? id) : null;
  const agentName = (id: string | null) =>
    id ? (agents.data?.find((a) => a.id === id)?.name ?? id) : null;

  const sessionLabel = (s: ChatSession) =>
    s.title ||
    (s.kind === "project"
      ? `Project chat — ${projectName(s.projectId)}`
      : s.kind === "agent"
        ? `Chat with ${agentName(s.agentId)}`
        : "New conversation");

  const cliAgents = (agents.data ?? []).filter(
    (a) => a.enabled && PROVIDER_KINDS[a.provider] === "cli",
  );

  const draftReady =
    draftKind === "free" ||
    (draftKind === "project" && Boolean(draftProjectId)) ||
    (draftKind === "agent" && Boolean(draftAgentId));

  /** Model controls shown in the composer: session-bound once started, draft-bound before. */
  const modelControls = session ? (
    session.provider && session.status === "active" ? (
      <>
        <GhostSelect
          title="Provider"
          value={session.provider}
          onValueChange={(v) => {
            const provider = v as ProviderId;
            updateSession.mutate({
              id: session.id,
              data: { provider, model: KNOWN_MODELS[provider]?.[0] ?? "sonnet" },
            });
          }}
        >
          {CLI_PROVIDERS.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </GhostSelect>
        <GhostSelect
          title="Model — switch anytime; the conversation continues"
          value={session.model ?? ""}
          onValueChange={(model) => updateSession.mutate({ id: session.id, data: { model } })}
        >
          {[
            ...new Set(
              [session.model, ...(KNOWN_MODELS[session.provider] ?? [])].filter(
                (m): m is string => Boolean(m),
              ),
            ),
          ].map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </GhostSelect>
      </>
    ) : null
  ) : (
    <>
      <GhostSelect
        title="Context"
        value={draftKind}
        onValueChange={(v) => setDraftKind(v as ChatSessionKind)}
      >
        <SelectItem value="free">Free chat</SelectItem>
        <SelectItem value="project">Project</SelectItem>
        <SelectItem value="agent">Agent</SelectItem>
      </GhostSelect>
      {draftKind === "project" && (
        <GhostSelect
          title="Project"
          value={draftProjectId}
          onValueChange={setDraftProjectId}
          placeholder="Pick a project"
        >
          {(projects.data ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </GhostSelect>
      )}
      {draftKind === "agent" && (
        <GhostSelect
          title="Agent"
          value={draftAgentId}
          onValueChange={setDraftAgentId}
          placeholder="Pick an agent"
        >
          {cliAgents.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </GhostSelect>
      )}
      {draftKind === "free" && (
        <>
          <GhostSelect
            title="Provider"
            value={draftProvider}
            onValueChange={(v) => {
              const provider = v as ProviderId;
              setDraftProvider(provider);
              setDraftModel(KNOWN_MODELS[provider]?.[0] ?? "");
            }}
          >
            {CLI_PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </GhostSelect>
          <GhostSelect title="Model" value={draftModel} onValueChange={setDraftModel}>
            {(KNOWN_MODELS[draftProvider] ?? []).map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </GhostSelect>
        </>
      )}
    </>
  );

  const startNew = () => {
    setSelectedId(null);
    setInput("");
  };

  return (
    <div className="-m-5 flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">
      {/* Session rail */}
      <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
        <div className="space-y-2.5 px-3 pb-2 pt-3">
          <Button variant="outline" className="w-full justify-start bg-background" onClick={startNew}>
            <Plus className="size-4" /> New chat
          </Button>
          <div className="flex items-center gap-1">
            <GhostSelect
              title="Filter by kind"
              value={filterKind}
              onValueChange={(v) => setFilterKind(v as typeof filterKind)}
            >
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="free">Free chat</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="agent-creator">Agent Creator</SelectItem>
            </GhostSelect>
            <GhostSelect
              title="Filter by project"
              value={filterProject}
              onValueChange={setFilterProject}
            >
              <SelectItem value="all">All projects</SelectItem>
              {(projects.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </GhostSelect>
            <button
              className={cn(
                "ml-auto rounded-md px-2 py-1 text-[11px] transition-colors",
                showArchived
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Include archived sessions"
              onClick={() => setShowArchived((v) => !v)}
            >
              Archived
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {sessions.isLoading ? (
            <div className="space-y-2 p-1">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : (sessions.data ?? []).length === 0 ? (
            <p className="px-3 py-10 text-center text-xs leading-relaxed text-muted-foreground">
              Conversations you start live here — free chats, project chats, and agent sessions,
              all saved.
            </p>
          ) : (
            (sessions.data ?? []).map((s) => {
              const Icon = KIND_ICONS[s.kind];
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    s.id === selectedId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                    s.status === "archived" && "opacity-55",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-5">
                      {sessionLabel(s)}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {KIND_LABELS[s.kind]} · {formatDate(s.lastMessageAt ?? s.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {session ? (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium">{sessionLabel(session)}</p>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {session.kind === "project"
                    ? projectName(session.projectId)
                    : session.kind === "agent"
                      ? agentName(session.agentId)
                      : KIND_LABELS[session.kind]}
                </span>
              </div>
              <div className="flex shrink-0 items-center">
                {session.status === "active" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    title="Archive session"
                    onClick={() =>
                      updateSession.mutate({ id: session.id, data: { status: "archived" } })
                    }
                  >
                    <Archive className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-8", previewOpen ? "text-foreground" : "text-muted-foreground")}
                  title={previewOpen ? "Hide preview" : "Show preview"}
                  onClick={() => setPreviewOpen((v) => !v)}
                >
                  <PanelRight className="size-4" />
                </Button>
              </div>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
                {detail.isLoading ? (
                  <>
                    <Skeleton className="ml-auto h-10 w-1/2" />
                    <Skeleton className="h-20 w-5/6" />
                  </>
                ) : (
                  messages.map((m) => <ChatTurnView key={m.id} message={m} />)
                )}
                {pending?.sessionId === session.id && pending.content && (
                  <ChatTurnView message={{ role: "user", content: pending.content, meta: null }} />
                )}
                {busy && <ThinkingDots label={session.model ?? undefined} />}
                {turnError && !busy && (
                  <TurnErrorBanner
                    error={turnError}
                    retrying={busy}
                    onRetryPrimary={() => retry()}
                    onRetrySecondary={(t) => retry(t)}
                  />
                )}
              </div>
            </div>

            <div className="shrink-0 px-6 pb-5 pt-1">
              <div className="mx-auto w-full max-w-3xl">
                {session.status === "archived" ? (
                  <p className="rounded-lg border border-dashed px-4 py-3 text-center text-xs text-muted-foreground">
                    This session is archived and read-only.
                  </p>
                ) : (
                  <Composer
                    value={input}
                    onChange={setInput}
                    onSend={send}
                    disabled={busy}
                    placeholder={`Message ${
                      session.kind === "agent"
                        ? (agentName(session.agentId) ?? "the agent")
                        : (session.model ?? "the model")
                    }…`}
                    controls={modelControls}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          /* Fresh conversation: greeting + composer, no modal. */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
            <div className="w-full max-w-2xl">
              <h2 className="text-center text-2xl font-semibold tracking-tight">
                What are we working on?
              </h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {draftKind === "project"
                  ? "Project chats can read the repository to answer truthfully."
                  : draftKind === "agent"
                    ? "Talk to one of your agents directly, with its own tools and prompt."
                    : "Free chats aren't written to any memory scope."}
              </p>
              <div className="mt-6">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={send}
                  disabled={busy || !draftReady}
                  placeholder={
                    draftReady
                      ? "Start the conversation…"
                      : draftKind === "project"
                        ? "Pick a project below to begin…"
                        : "Pick an agent below to begin…"
                  }
                  controls={modelControls}
                />
              </div>
              {turnErrors[""] && !busy && (
                <div className="mt-4">
                  <TurnErrorBanner
                    error={turnErrors[""]!}
                    retrying={busy}
                    onRetryPrimary={() => {}}
                    onRetrySecondary={() => {}}
                  />
                </div>
              )}
              {busy && (
                <div className="mt-4 flex justify-center">
                  <ThinkingDots label="starting session" />
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Preview panel — always available; honest when there's nothing to run. */}
      {previewOpen && (
        <aside className="hidden w-80 shrink-0 flex-col border-l bg-sidebar xl:flex">
          <div className="flex h-12 items-center border-b px-4">
            <p className="text-sm font-medium">Preview</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            {session?.projectId ? (
              <>
                <FolderKanban className="size-7 text-muted-foreground/50" />
                <p className="text-sm font-medium">{projectName(session.projectId)}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Running the app from chat lands in a follow-up. For now,{" "}
                  <Link to="/terminals" className="underline underline-offset-2">
                    open a terminal
                  </Link>{" "}
                  to run it manually.
                </p>
              </>
            ) : (
              <>
                <MonitorPlay className="size-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Nothing to preview</p>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
