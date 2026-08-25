import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  Archive,
  ArrowUp,
  Bot,
  FolderKanban,
  MessageSquare,
  MonitorPlay,
  PanelRight,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  KNOWN_MODELS,
  PROVIDER_KINDS,
  type ChatSession,
  type ChatSessionKind,
  type ChatTurnError,
  type ChatTurnState,
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
import { ChatTurnView, ThinkingDots, TurnErrorBanner } from "@web/components/chat/chat-bits";
import {
  useAgents,
  useChatSession,
  useChatSessions,
  useCreateChatSession,
  usePostChatTurn,
  useProjects,
  useRetryChatTurn,
  useUpdateChatSession,
} from "@web/api/hooks";
import { useLiveEvents } from "@web/lib/live-events";
import {
  applyChatTurnBroadcast,
  applyChatTurnState,
  isBroadcastForHeldTurn,
  isTurnBusy,
} from "@web/lib/chat-turn-state";
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

/** Left rail of the split-pane layout: filters + the saved-session list. */
function ChatThreadList({ children }: { children: React.ReactNode }) {
  return <aside className="flex h-full flex-col bg-sidebar">{children}</aside>;
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

/**
 * M14 — the three `waitingReason` values (T-M12-02), each a distinct,
 * actionable card rather than one generic "waiting" notice: scenario 1
 * (never paired anything) and scenario 2 (paired, but off right now) need
 * different next steps from the owner, and scenario 3 (project unavailable)
 * reuses `start_run`'s own SPG13 wording verbatim.
 */
function NoRuntimePairedNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      This workspace has no paired machine yet — your message is saved.{" "}
      <Link href="/machines" className="underline underline-offset-2">
        Pair a machine
      </Link>{" "}
      to get a reply.
    </div>
  );
}

function AllOfflineNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      Waiting for a machine to come online — your message is saved, and the reply arrives
      automatically once one does.{" "}
      <Link href="/machines" className="underline underline-offset-2">
        Check Machines
      </Link>
    </div>
  );
}

function ProjectNotAvailableNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      No online machine has this project on disk. Pair or start the machine that has it, or{" "}
      <Link href="/machines" className="underline underline-offset-2">
        check Machines
      </Link>
      .
    </div>
  );
}

/**
 * A TTL-expired turn (`rescan_waiting_chat_turns`'s sweep) never went
 * through assignment, so `waitingReason` is still non-null on an otherwise
 * `failed` turn — the signal this card keys off, distinct from a real
 * provider failure (`TurnErrorBanner`) so US2's "not lost" promise doesn't
 * read as broken once the wait ends.
 */
function TurnExpiredNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="spg-turn rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
      <p className="font-medium">Took too long</p>
      <p className="mt-1 text-muted-foreground">
        No machine picked this up within 24 hours — your message is still here, but the wait
        ended.
      </p>
      <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** `ChatTurnState.error` is a plain string (DD-7's one shared shape);
 *  `TurnErrorBanner` wants the richer `ChatTurnError` the local host used to
 *  return directly. `fallback: null` is honest here, not a regression — the
 *  cloud path never had a secondary-model suggestion to carry, and see
 *  T-M13-02's Result for the one place this narrowing does cost something. */
function turnErrorFromState(turn: ChatTurnState): ChatTurnError {
  return {
    kind: "unknown",
    reason: turn.error ?? "The model failed.",
    attempts: turn.attempt,
    fallback: null,
  };
}

/**
 * M15 — the retry affordance a succeeded turn didn't have before: re-ask
 * without retyping (T-M12's `retry_chat_turn`), optionally on a different
 * model. `TurnErrorBanner`'s own one-click retry (failed turns) is
 * untouched; this is the new picker US3 scenario 2 needs, since
 * `TurnErrorBanner`'s `fallback` field is always null on the cloud path.
 */
function RetryControls({
  provider,
  model,
  busy,
  onRetry,
}: {
  provider: ProviderId;
  model: string;
  busy: boolean;
  onRetry: (override: { provider: string; model: string }) => void;
}) {
  const [p, setP] = React.useState(provider);
  const [m, setM] = React.useState(model);
  return (
    <div className="spg-turn flex items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => onRetry({ provider: p, model: m })}
        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className="size-3.5" /> Retry
      </Button>
      <GhostSelect
        title="Provider"
        value={p}
        onValueChange={(v) => {
          const next = v as ProviderId;
          setP(next);
          setM(KNOWN_MODELS[next]?.[0] ?? "");
        }}
      >
        {CLI_PROVIDERS.map((cp) => (
          <SelectItem key={cp} value={cp}>
            {cp}
          </SelectItem>
        ))}
      </GhostSelect>
      <GhostSelect title="Model" value={m} onValueChange={setM}>
        {(KNOWN_MODELS[p] ?? []).map((mm) => (
          <SelectItem key={mm} value={mm}>
            {mm}
          </SelectItem>
        ))}
      </GhostSelect>
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

  // The active session is URL state (?session=id): linkable, survives reload,
  // and back/forward moves between conversations.
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("session");
  const setSelectedId = React.useCallback(
    (id: string | null) => {
      // Push rather than replace, so back/forward walks the conversation
      // history — the behaviour the comment above promises.
      router.push(id ? `/chat?session=${encodeURIComponent(id)}` : "/chat");
    },
    [router],
  );
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
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const liveEvents = useLiveEvents();
  const queryClient = useQueryClient();

  // M13 — the turn arrives from three sources (the send/retry response, the
  // session read's `activeTurn`, and live broadcasts) and this is the one
  // piece of state they all write into. `turnRef` mirrors it so the
  // broadcast subscription below can read the CURRENT turn without being
  // re-created on every delta (chat-turn-state.ts's own Traps note: the
  // subscription must not be keyed on turn id).
  const [turn, setTurnState] = React.useState<ChatTurnState | null>(null);
  const turnRef = React.useRef<ChatTurnState | null>(null);
  const updateTurn = React.useCallback(
    (updater: (current: ChatTurnState | null) => ChatTurnState | null) => {
      setTurnState((current) => {
        const next = updater(current);
        turnRef.current = next;
        return next;
      });
    },
    [],
  );
  // Two DISTINCT notices, not one: a 409 refusal (FR-004, expected and
  // legible) reads very differently from a genuine send failure, and a
  // failed session CREATE has no turn to attach an error to at all (there is
  // no session id yet) -- collapsing either into `turn`'s own failed state
  // would be wrong.
  const [composerNotice, setComposerNotice] = React.useState<
    { kind: "refusal" | "error"; message: string } | null
  >(null);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const messages = detail.data?.messages ?? [];
  const messageIds = React.useMemo(() => new Set(messages.map((m) => m.id)), [messages]);
  // A union, not a branch on whether a turn exists yet (found by actually
  // sending a second local message: the LOCAL host's POST doesn't resolve
  // until the turn is fully terminal -- there is no intermediate `waiting`/
  // `in_progress` row to derive from mid-flight, so `isTurnBusy(turn)` alone
  // stays false for the whole duration once `turn` already holds a stale
  // SUCCEEDED turn from a previous send). `isTurnBusy(turn)` still covers the
  // reload case on its own (decision 3's original point): after a reload,
  // `isPending` resets to false, but a still-non-terminal server turn keeps
  // disabling the composer via `activeTurn`.
  const busy =
    isTurnBusy(turn) || postTurn.isPending || retryTurn.isPending || createSession.isPending;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, turn?.replyText, selectedId]);

  // A turn from the PREVIOUS session must never bleed into this one.
  React.useEffect(() => {
    updateTurn(() => null);
    setComposerNotice(null);
  }, [selectedId, updateTurn]);

  // FR-007 — recover a turn on mount, on any refetch, and when the owner
  // navigates away mid-turn and comes back. The session read is the only
  // source once the mutation response that started it is gone.
  React.useEffect(() => {
    const active = detail.data?.activeTurn;
    if (active) updateTurn((current) => applyChatTurnState(current, active));
  }, [detail.data?.activeTurn, updateTurn]);

  // Subscribe to this session's broadcast topic (per SESSION, not per turn —
  // chatTurnTopic's own doc comment) while it's open. A delta for a turn
  // OTHER than the one held has no userMessage to build a turn from, so it
  // triggers a refetch instead, which lands back through the effect above;
  // a terminal delta for OUR turn also refetches, once, so the canonical
  // persisted message (with its real id and model attribution) replaces the
  // in-memory reply text rather than leaving it permanently synthetic.
  React.useEffect(() => {
    if (!selectedId) return;
    return liveEvents.subscribeChat(selectedId, (delta) => {
      if (isBroadcastForHeldTurn(turnRef.current, delta)) {
        updateTurn((current) => applyChatTurnBroadcast(current, delta));
        if (delta.status !== "running") {
          void queryClient.invalidateQueries({ queryKey: ["chat-session", selectedId] });
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ["chat-session", selectedId] });
      }
    });
  }, [selectedId, liveEvents, queryClient, updateTurn]);

  const notifyFailure = (sessionId: string, err: { reason: string | null; message: string }) => {
    if (err.reason === "turn_in_progress") {
      // Another tab (or a race in this one) already has a turn in flight.
      // The server is the source of truth here — refetch rather than guess
      // at what that turn's state is.
      setComposerNotice({
        kind: "refusal",
        message: "Wait for the current reply, or send after it finishes.",
      });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", sessionId] });
    } else {
      setComposerNotice({ kind: "error", message: err.message });
    }
  };

  const postTo = (sessionId: string, content: string) => {
    // Null the held turn BEFORE the request starts, not after it resolves.
    // Found by actually sending a second message in the browser: without
    // this, `turn` keeps pointing at the PREVIOUS (terminal) turn for the
    // whole duration of a new local-host send -- which never emits an
    // intermediate `waiting`/`in_progress` row to replace it with, since the
    // local POST doesn't resolve until the turn is fully done. Every render
    // branch below keys off `turn` alone, so this one line is what keeps
    // them honest instead of each needing its own "is this turn actually
    // CURRENT" guard.
    updateTurn(() => null);
    postTurn.mutate(
      { sessionId, content },
      {
        onSuccess: (state) => updateTurn((current) => applyChatTurnState(current, state)),
        onError: (err) => {
          setInput(content);
          notifyFailure(sessionId, err);
        },
      },
    );
  };

  const send = () => {
    const content = input.trim();
    if (!content || busy) return;
    setInput("");
    setComposerNotice(null);
    setCreateError(null);
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
          setCreateError(err.message);
        },
      },
    );
  };

  const retry = (override?: { provider: string; model: string }) => {
    if (!selectedId || busy) return;
    setComposerNotice(null);
    updateTurn(() => null); // same reason as postTo above
    retryTurn.mutate(
      {
        sessionId: selectedId,
        provider: override?.provider as ProviderId | undefined,
        model: override?.model,
      },
      {
        onSuccess: (state) => updateTurn((current) => applyChatTurnState(current, state)),
        onError: (err) => notifyFailure(selectedId, err),
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
      <PanelGroup direction="horizontal" autoSaveId="chat-layout" className="min-h-0 flex-1">
        {/* Session rail */}
        <Panel defaultSize={24} minSize={16} maxSize={40} className="hidden md:block">
          <ChatThreadList>
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
          </ChatThreadList>
        </Panel>
        <PanelResizeHandle className="hidden w-px bg-border transition-colors data-[resize-handle-state=drag]:bg-primary data-[resize-handle-state=hover]:bg-primary/50 md:block" />

        {/* Conversation */}
        <Panel defaultSize={76} minSize={40}>
          <section className="flex h-full min-w-0 flex-col bg-background">
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
                  <>
                    {messages.map((m) => <ChatTurnView key={m.id} message={m} />)}
                    {/* The turn overlay below renders ONLY what `messages` doesn't
                        have yet, keyed by real message id -- once a refetch lands
                        the canonical row, the matching overlay piece stops
                        rendering on its own rather than needing to be torn down. */}
                    {turn && !messageIds.has(turn.userMessage.id) && (
                      <ChatTurnView message={turn.userMessage} />
                    )}
                    {turn?.status === "waiting" && turn.waitingReason === "no_runtime_paired" && (
                      <NoRuntimePairedNotice />
                    )}
                    {turn?.status === "waiting" &&
                      turn.waitingReason === "all_runtimes_offline" && <AllOfflineNotice />}
                    {turn?.status === "waiting" &&
                      turn.waitingReason === "project_not_available" && (
                        <ProjectNotAvailableNotice />
                      )}
                    {turn &&
                      (turn.status === "in_progress" || turn.status === "succeeded") &&
                      !messageIds.has(turn.assistantMessage?.id ?? "") &&
                      (turn.replyText ? (
                        <ChatTurnView
                          message={{
                            role: "assistant",
                            content: turn.replyText,
                            meta: turn.model
                              ? { provider: turn.provider ?? undefined, model: turn.model }
                              : null,
                          }}
                        />
                      ) : turn.status === "in_progress" ? (
                        <ThinkingDots label={turn.model ?? session.model ?? undefined} />
                      ) : null)}
                    {turn?.status === "succeeded" &&
                      (() => {
                        const retryProvider: ProviderId =
                          turn.provider ?? session.provider ?? "claude-code";
                        return (
                          <RetryControls
                            key={turn.id}
                            provider={retryProvider}
                            model={
                              turn.model ??
                              session.model ??
                              KNOWN_MODELS[retryProvider]?.[0] ??
                              ""
                            }
                            busy={busy}
                            onRetry={retry}
                          />
                        );
                      })()}
                    {/* TTL-expired must be checked BEFORE the generic failed
                        branch below — both match `status === "failed"`, and
                        only the expired turn's own non-null `waitingReason`
                        (never cleared by the sweep, since it never reached
                        assignment) tells the two apart. */}
                    {turn?.status === "failed" && turn.waitingReason !== null && (
                      <TurnExpiredNotice onRetry={() => retry()} />
                    )}
                    {turn?.status === "failed" && turn.waitingReason === null && (
                      <TurnErrorBanner
                        error={turnErrorFromState(turn)}
                        retrying={busy}
                        onRetryPrimary={() => retry()}
                        onRetrySecondary={(t) => retry(t)}
                      />
                    )}
                    {/* The narrow pre-turn window: a send/retry POST is in
                        flight but no turn exists yet to derive a state from. */}
                    {busy && !turn && <ThinkingDots label={session.model ?? undefined} />}
                  </>
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
                  <>
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
                    {composerNotice && (
                      <p
                        className={cn(
                          "mt-2 px-1 text-xs",
                          composerNotice.kind === "refusal"
                            ? "text-muted-foreground"
                            : "text-destructive",
                        )}
                      >
                        {composerNotice.message}
                      </p>
                    )}
                  </>
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
              {createError && !busy && (
                <p className="mt-4 text-center text-xs text-destructive">{createError}</p>
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
        </Panel>
      </PanelGroup>

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
                  <Link href="/terminals" className="underline underline-offset-2">
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
