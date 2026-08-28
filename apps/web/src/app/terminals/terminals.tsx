import * as React from "react";
import Link from "next/link";
import {
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  ShieldOff,
  TerminalSquare,
  Unplug,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SETTING_TERMINAL_ACCESS,
  TERMINAL_THROTTLE_NOTICE,
  isTerminalAccessEnabled,
  machineState,
  type TerminalRefusal,
  type TerminalSessionInfo,
} from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useAgents, useRuntimes, useWorkspace, type Runtime } from "@web/api/hooks";
import {
  createTerminalChannel,
  TerminalRequestTimeoutError,
  type TerminalChannel,
  type TerminalEndReason,
} from "@web/lib/terminal-channel";
import { PageContainer } from "@/components/layout/page-container";
import { relativeTime, relativeTimeFromMs, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * M17 — the Terminals page, re-plumbed onto M16's terminal channel.
 *
 * Read `doc/tasks/M17/README.md` before touching this file — it settles what
 * is kept from the old dead page (xterm setup, fit addon, resize observer,
 * session chips, the deliberately-literal dark theme) and what changes
 * (which machine, sourcing the session list from THAT machine rather than a
 * dead cloud endpoint, and four distinct empty/error states instead of one
 * lying "No terminal attached").
 */

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
/** Matches `useRuntimes`' own poll — "nothing pushes" applies here too: a
 *  session ending on its own writes nothing this tab would otherwise learn
 *  of, so US2.3/US2.4 depend on this poll noticing the list changed. */
const SESSION_LIST_POLL_MS = 10_000;

/** Phase decision 4 — one sentence per `TerminalRefusal`, no default branch,
 *  so a seventh member fails the build rather than falling through. */
const REFUSAL_SENTENCES: Record<TerminalRefusal, string> = {
  terminal_access_disabled: "This machine's terminal access is switched off.",
  session_limit_reached: "This machine already has the maximum number of sessions open. Close one to open another.",
  unknown_session: "That session isn't there anymore.",
  agent_not_interactive: "That agent's tool doesn't have an interactive mode.",
  agent_not_found: "That agent no longer exists on this machine.",
  spawn_failed: "The machine couldn't start that session. Try again, or try a plain shell.",
};

const END_REASON_SENTENCES: Record<TerminalEndReason, string> = {
  closed: "You closed this session.",
  exited: "This session ended — the process exited.",
  machine_restarted: "This session ended because the machine restarted.",
  access_switched_off: "This session ended because terminal access was switched off for this machine.",
};

/** Phase decision 2 — exactly one online machine is used and named without
 *  asking; more than one uses the most recently seen, switchable. None
 *  online still names the most recently seen, so FR-006 holds even then. */
function pickTargetRuntime(machines: Runtime[], preferredId: string | null): Runtime | null {
  if (machines.length === 0) return null;
  if (preferredId) {
    const preferred = machines.find((m) => m.id === preferredId);
    if (preferred) return preferred;
  }
  const online = machines.filter((m) => m.online);
  const pool = online.length > 0 ? online : machines;
  return [...pool].sort((a, b) => {
    const at = a.lastHeartbeat ? new Date(a.lastHeartbeat).getTime() : 0;
    const bt = b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0;
    return bt - at;
  })[0]!;
}

function agentName(agents: { id: string; name: string }[] | undefined, session: TerminalSessionInfo): string {
  if (!session.agentId) return "shell";
  return session.agentName ?? agents?.find((a) => a.id === session.agentId)?.name ?? shortId(session.agentId);
}

/** The framed pane the spec asks for in place of an anonymous spinner —
 *  naming the machine being waited on is most of the information. */
function LoadingPane({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border bg-[#0a0a0a] text-center">
      <Loader2 className="size-6 animate-spin text-white/40" />
      <p className="font-mono text-sm text-white/60">{label}</p>
    </div>
  );
}

function ErrorPane({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <Icon className="size-8 text-destructive/70" strokeWidth={1.5} />
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function TerminalsPage() {
  const workspace = useWorkspace();
  const runtimes = useRuntimes();
  const agents = useAgents();
  const queryClient = useQueryClient();

  const [selectedRuntimeId, setSelectedRuntimeId] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [newAgentId, setNewAgentId] = React.useState("");
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [openPending, setOpenPending] = React.useState(false);
  const [endedInfo, setEndedInfo] = React.useState<{ sessionId: string; reason: TerminalEndReason } | null>(null);

  const machines = runtimes.data ?? [];
  const target = pickTargetRuntime(machines, selectedRuntimeId);
  const onlineMachines = machines.filter((m) => m.online);

  // Switching machines abandons any pane and any stale refusal — showing
  // machine A's error under machine B's name would repeat the same
  // whose-computer confusion phase decision 1 exists to prevent. Adjusted
  // during render (React's documented "resetting state when a prop
  // changes" shape) rather than in an effect, since only PART of this
  // component's state resets on a machine switch — `selectedRuntimeId` and
  // `newAgentId` deliberately do not — so keying the whole component isn't
  // an option.
  const [resetForTargetId, setResetForTargetId] = React.useState<string | null>(target?.id ?? null);
  if ((target?.id ?? null) !== resetForTargetId) {
    setResetForTargetId(target?.id ?? null);
    setActiveId(null);
    setOpenError(null);
    setEndedInfo(null);
  }

  // Phase decision 1: the channel is scoped to one machine and re-created,
  // not reused, on a machine switch — a stale list from machine A rendered
  // under machine B's name is the same confusion. Built via `useMemo` keyed
  // on the runtime id (not the whole `target` object, which changes shape on
  // every 15s `useRuntimes()` poll) rather than an effect writing to state,
  // since constructing the instance is itself a pure computation; the
  // teardown-only effect below is what closes the PREVIOUS instance
  // (T-M17-01's `close()`) the moment `useMemo` swaps in a new one, and on
  // unmount.
  // Deliberately `target?.id`, not `target` — the runtime object churns on
  // every 15s `useRuntimes()` poll and reopening the channel on every one of
  // those would be its own bug.
  const channel = React.useMemo<TerminalChannel | null>(
    () => (target ? createTerminalChannel(target.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target?.id],
  );
  React.useEffect(() => {
    return () => {
      channel?.close();
    };
  }, [channel]);

  const accessEnabled = target ? isTerminalAccessEnabled(target.reportedSettings[SETTING_TERMINAL_ACCESS]) : true;
  const canListSessions = Boolean(channel && target?.online && accessEnabled);

  const sessionsQuery = useQuery({
    // Keyed by runtime id (phase decision 1) — switching machines is a
    // different key, not a refetch of the same one.
    queryKey: ["terminal-list", target?.id],
    queryFn: () => channel!.request("terminal.list", {}),
    enabled: canListSessions,
    refetchInterval: SESSION_LIST_POLL_MS,
    retry: false,
  });

  /**
   * A query with no data yet reverts `status` to `"pending"` on EVERY
   * background retry, react-query v5's real (if surprising) behaviour for a
   * query that has never once succeeded — verified live: a machine that
   * never answers flapped this page between the loading pane and the error
   * pane every ~14s, because `isLoading` genuinely goes true again on each
   * retry attempt. `dataUpdatedAt`/`errorUpdatedAt` don't share that
   * problem — they hold the timestamp of the last time each actually
   * happened and are untouched by an in-between pending window, so they are
   * what decide which of the three views below renders. Same two-tier idea
   * `machines.tsx`'s `RuntimesError` already uses for `useRuntimes()`: with
   * nothing to show yet, a failure IS the page; once something has loaded,
   * a later failure is reported without erasing what is already on screen.
   */
  const hasEverListedSessions = sessionsQuery.dataUpdatedAt > 0;
  const latestListAttemptFailed = sessionsQuery.errorUpdatedAt > sessionsQuery.dataUpdatedAt;
  // `.error` itself goes back to `null` during the same pending window
  // `errorUpdatedAt` doesn't (react-query clears it optimistically at the
  // start of a new attempt) — snapshotting it only when `errorUpdatedAt`
  // actually changes keeps the error pane's description from also flapping
  // between "didn't respond in time" and a generic fallback every retry.
  const lastListError = React.useMemo(
    () => sessionsQuery.error,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionsQuery.errorUpdatedAt],
  );

  const machineStartedAtRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!sessionsQuery.data || !target) return;
    const { sessions, machineStartedAt } = sessionsQuery.data;
    const previousStart = machineStartedAtRef.current;
    const restarted = previousStart !== null && previousStart !== machineStartedAt;
    machineStartedAtRef.current = machineStartedAt;

    if (activeId && !sessions.some((s) => s.id === activeId)) {
      const reason: TerminalEndReason = restarted
        ? "machine_restarted"
        : !isTerminalAccessEnabled(target.reportedSettings[SETTING_TERMINAL_ACCESS])
          ? "access_switched_off"
          : "exited";
      setEndedInfo({ sessionId: activeId, reason });
      setActiveId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsQuery.data]);

  const openSession = (agentId: string | null) => {
    if (!channel) return;
    setOpenPending(true);
    setOpenError(null);
    setEndedInfo(null);
    void channel
      .request("terminal.open", { agentId, cols: DEFAULT_COLS, rows: DEFAULT_ROWS })
      .then((reply) => {
        if ("error" in reply) {
          setOpenError(REFUSAL_SENTENCES[reply.error]);
          return;
        }
        setActiveId(reply.session.id);
        void queryClient.invalidateQueries({ queryKey: ["terminal-list", target?.id] });
      })
      .catch((err: unknown) => {
        setOpenError(
          err instanceof TerminalRequestTimeoutError
            ? "The machine didn't answer in time."
            : "Something went wrong opening that session.",
        );
      })
      .finally(() => setOpenPending(false));
  };

  const closeSession = (sessionId: string) => {
    if (!channel) return;
    void channel.request("terminal.close", { sessionId }).then(() => {
      if (activeId === sessionId) setActiveId(null);
      void queryClient.invalidateQueries({ queryKey: ["terminal-list", target?.id] });
    });
  };

  // T-M17-03 — "enabled" alone isn't enough: an agent whose provider has no
  // interactive mode must never reach the picker (US3.2). Which providers
  // count is a fact about THIS machine's own registry, not the cloud agent
  // row, so it comes from `terminal.list`'s reply rather than being assumed
  // client-side — a second machine on a different core version could
  // legitimately disagree.
  const interactiveProviders = sessionsQuery.data?.interactiveProviders ?? [];
  const interactiveAgents = (agents.data ?? []).filter(
    (a) => a.enabled && interactiveProviders.includes(a.provider),
  );
  const sessions = sessionsQuery.data?.sessions ?? [];
  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  // ─── Resolve the view before rendering anything (phase trap: nest the
  // conditionals as queries settle and the page flashes through the wrong
  // emptiness on every load) ───────────────────────────────────────────────

  let body: React.ReactNode;

  if (workspace.isLoading || runtimes.isLoading) {
    body = <LoadingPane label="Loading your machines…" />;
  } else if (workspace.data && workspace.data.role !== "owner" && workspace.data.role !== "admin") {
    // FR-009 — checked before ever touching the channel: RLS would refuse
    // the subscribe either way, but that refusal can't be told apart from an
    // offline machine from the subscribe status alone.
    body = (
      <ErrorPane
        icon={ShieldOff}
        title="Terminals are restricted"
        description="Only workspace owners and admins can open a terminal. Ask an owner or admin if you need one."
      />
    );
  } else if (machines.length === 0) {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12">
            <Monitor className="size-6" strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>No machine paired yet</EmptyTitle>
          <EmptyDescription>
            A terminal runs on a machine of yours, not in the browser. Pair a machine first, then come
            back here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/machines">Pair a machine</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (target && !target.online) {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12">
            <Monitor className="size-6" strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>{target.name} is unreachable</EmptyTitle>
          <EmptyDescription>
            Last seen {relativeTime(target.lastHeartbeat)}. Turn the machine on, then retry.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" disabled={runtimes.isFetching} onClick={() => void runtimes.refetch()}>
            {runtimes.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (target && !accessEnabled) {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12">
            <ShieldOff className="size-6" strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>Terminals are switched off for {target.name}</EmptyTitle>
          <EmptyDescription>Turn it back on from that machine&apos;s page.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" asChild>
            <Link href="/machines">Go to Machines</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (target && !hasEverListedSessions && sessionsQuery.errorUpdatedAt === 0) {
    body = <LoadingPane label={`Reaching ${target.name}…`} />;
  } else if (target && !hasEverListedSessions) {
    // Has failed at least once and never succeeded — a stable error, not
    // re-shown as loading on every background retry (see the note above).
    body = (
      <ErrorPane
        icon={WifiOff}
        title={`${target.name} didn't answer`}
        description={
          lastListError instanceof TerminalRequestTimeoutError
            ? "The machine didn't respond in time. It may be busy, or its connection to the workspace may be down."
            : "Something went wrong reaching that machine."
        }
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={sessionsQuery.isFetching}
            onClick={() => void sessionsQuery.refetch()}
          >
            {sessionsQuery.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Try again
          </Button>
        }
      />
    );
  } else if (target) {
    body = (
      <>
        {latestListAttemptFailed ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-muted-foreground">
            <WifiOff className="size-3.5 text-destructive/70" />
            Couldn&apos;t refresh the session list — still trying in the background. Showing what was last confirmed.
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {interactiveAgents.length > 0 ? (
            <>
              <Select value={newAgentId} onValueChange={setNewAgentId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Interactive agent…" />
                </SelectTrigger>
                <SelectContent>
                  {interactiveAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button disabled={!newAgentId || openPending} onClick={() => openSession(newAgentId)}>
                <Plus className="size-4" /> Agent terminal
              </Button>
            </>
          ) : (
            // Never an empty dropdown (phase trap) — say why there's nothing to pick.
            <p className="text-xs text-muted-foreground">
              No enabled agent on {target.name} can serve an interactive session.
            </p>
          )}
          <Button variant="outline" disabled={openPending} onClick={() => openSession(null)}>
            <Plus className="size-4" /> Shell
          </Button>
          {openError ? <p className="text-sm text-destructive">{openError}</p> : null}
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">Sessions stay open until closed.</p>
        </div>

        {sessions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sessions.map((s) => (
              <span
                key={s.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                  activeId === s.id
                    ? "border-primary bg-primary/10"
                    : "cursor-pointer hover:bg-muted",
                )}
                onClick={() => {
                  setEndedInfo(null);
                  setActiveId(s.id);
                }}
              >
                <TerminalSquare className="size-3" />
                {agentName(agents.data, s)}
                <span className="font-mono text-muted-foreground">{shortId(s.id)}</span>
                <Badge variant="outline" className="text-[9px]">
                  {relativeTimeFromMs(s.ageMs)}
                </Badge>
                <button
                  className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  title="Close session"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(s.id);
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {activeSession && channel ? (
          <XtermView key={activeSession.id} channel={channel} session={activeSession} onKilled={() => setActiveId(null)} />
        ) : endedInfo ? (
          <ErrorPane
            icon={Unplug}
            title="Session ended"
            description={END_REASON_SENTENCES[endedInfo.reason]}
            action={
              <Button variant="outline" size="sm" onClick={() => setEndedInfo(null)}>
                Dismiss
              </Button>
            }
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border text-center">
            <TerminalSquare className="size-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">No terminal open on {target.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Open an interactive agent session or a plain shell above.
              </p>
            </div>
          </div>
        )}
      </>
    );
  } else {
    body = <LoadingPane label="Loading…" />;
  }

  return (
    <PageContainer size="lg" className="flex h-full min-h-0 flex-col gap-3">
      {target ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Monitor className="size-3.5" />
          <span className="font-medium text-foreground">{target.name}</span>
          <span className="text-xs">{machineState(target.status, target.lastHeartbeat)}</span>
          {onlineMachines.length > 1 ? (
            <Select value={target.id} onValueChange={setSelectedRuntimeId}>
              <SelectTrigger className="h-7 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {onlineMachines.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}
      {body}
    </PageContainer>
  );
}

function XtermView({
  channel,
  session,
  onKilled,
}: {
  channel: TerminalChannel;
  session: TerminalSessionInfo;
  onKilled: () => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = React.useState<"connecting" | "connected" | "read-only">("connecting");
  const [throttled, setThrottled] = React.useState(false);
  const sendInterruptRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
      // Deliberately literal, and deliberately dark in both modes. xterm's
      // theme API takes a colour string, not a CSS variable, and a terminal is
      // a terminal — same argument as DESIGN.md §2.6 makes for code syntax.
      // The container below matches it for the same reason.
      theme: { background: "#0a0a0a" },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    // Gates both output writes and outgoing keystrokes. A plain closure
    // variable rather than React state — `term.onData`'s callback is
    // registered once, in this same effect run, and would otherwise close
    // over a stale render's `status`.
    let ready = false;
    let wasDisconnected = false;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    // \x03 is Ctrl+C / SIGINT — US1.6's "a way to stop the command", offered
    // regardless of whether a throttle is currently showing: a flood can
    // start well before the sustain window (DD-8) actually engages it.
    sendInterruptRef.current = () => {
      if (ready) channel.send(session.id, { data: "\x03" });
    };

    const detach = channel.attach(session.id, {
      onOutput: (chunk) => {
        if (chunk.includes(TERMINAL_THROTTLE_NOTICE)) {
          setThrottled(true);
          if (throttleTimer) clearTimeout(throttleTimer);
          // The notice text itself says "resuming automatically" and the
          // wire carries no explicit end-of-throttle event (T-M17-01) — a
          // few seconds is long enough to read, short enough not to lie
          // once output has actually resumed.
          throttleTimer = setTimeout(() => setThrottled(false), 4000);
          if (ready) term.write(chunk.split(TERMINAL_THROTTLE_NOTICE).join(""));
          return;
        }
        if (ready) term.write(chunk);
      },
      onThrottled: () => {},
      onEnded: () => {
        ready = false;
        onKilled();
      },
    });

    async function doAttach(cols: number, rows: number) {
      setStatus("connecting");
      try {
        const reply = await channel.request("terminal.attach", { sessionId: session.id, cols, rows });
        if ("error" in reply) {
          ready = false;
          setStatus("read-only");
          term.write(`\r\n[${REFUSAL_SENTENCES[reply.error]}]\r\n`);
          return;
        }
        // Full scrollback, freshly authoritative from the machine — a
        // reconnect and a resize both use this same path (T-M16-01: a
        // geometry change IS a fresh attach, there is no separate resize
        // message), so resetting first keeps replayed content from ever
        // duplicating rather than trying to patch just a gap the wire has no
        // way to describe.
        term.reset();
        term.write(reply.replay);
        ready = true;
        setStatus("connected");
        term.focus();
      } catch {
        // TerminalRequestTimeoutError — stay read-only; onConnectionChange
        // or the next genuine resize will retry.
        ready = false;
        setStatus("connecting");
      }
    }

    void doAttach(term.cols, term.rows);

    const unsubConnection = channel.onConnectionChange((connected) => {
      if (!connected) {
        wasDisconnected = true;
        ready = false;
        setStatus("connecting");
      } else if (wasDisconnected) {
        wasDisconnected = false;
        void doAttach(term.cols, term.rows);
      }
    });

    const dataSub = term.onData((data) => {
      if (!ready) return;
      channel.send(session.id, { data });
    });

    const observer = new ResizeObserver(() => {
      const prevCols = term.cols;
      const prevRows = term.rows;
      fit.fit();
      // Resize on genuine container change only — re-fitting on every
      // observer fire with two tabs attached produces two geometries
      // fighting each other (phase trap).
      if (ready && (term.cols !== prevCols || term.rows !== prevRows)) {
        void doAttach(term.cols, term.rows);
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      dataSub.dispose();
      unsubConnection();
      detach();
      if (throttleTimer) clearTimeout(throttleTimer);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-[#0a0a0a]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs text-muted-foreground">
        <span
          className={cn(
            "size-2 rounded-full",
            status === "connected"
              ? "bg-success"
              : status === "connecting"
                ? "bg-warning animate-pulse"
                : "bg-muted-foreground/50",
          )}
        />
        {status === "read-only" ? "read-only — lost contact" : status}
        <span className="font-mono">{session.id}</span>
        <div className="ml-auto flex items-center gap-2">
          {throttled ? (
            <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
              output throttled — resuming automatically
            </Badge>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            disabled={status !== "connected"}
            title="Send Ctrl+C to interrupt the running command"
            onClick={() => sendInterruptRef.current()}
          >
            Interrupt
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 p-1" />
    </div>
  );
}
