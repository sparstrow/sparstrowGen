import * as React from "react";
import { Plus, TerminalSquare, X } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { TERMINAL_WS_PATH } from "@sparstrow/shared";
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
  useAgents,
  useCreateTerminalSession,
  useKillTerminalSession,
  useTerminalSessions,
  type TerminalSession,
} from "@/api/hooks";
import { PageContainer } from "@/components/layout/page-container";
import { formatDate, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TerminalsPage() {
  const sessions = useTerminalSessions();
  const agents = useAgents();
  const createSession = useCreateTerminalSession();
  const killSession = useKillTerminalSession();

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [newAgentId, setNewAgentId] = React.useState("");

  const agentName = (id: string | null) =>
    id ? (agents.data?.find((a) => a.id === id)?.name ?? shortId(id)) : "shell";

  const open = (body: { agentId?: string }) => {
    createSession.mutate(body, { onSuccess: (s) => setActiveId(s.id) });
  };

  const kill = (id: string) => {
    killSession.mutate(id, {
      onSuccess: () => {
        if (activeId === id) setActiveId(null);
      },
    });
  };

  const list = sessions.data ?? [];
  const active = list.find((s) => s.id === activeId) ?? null;

  return (
    <PageContainer size="lg" className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={newAgentId} onValueChange={setNewAgentId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Interactive agent…" />
          </SelectTrigger>
          <SelectContent>
            {(agents.data ?? [])
              .filter((a) => a.enabled)
              .map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {a.provider}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!newAgentId || createSession.isPending}
          onClick={() => open({ agentId: newAgentId })}
        >
          <Plus className="size-4" /> Agent terminal
        </Button>
        <Button variant="outline" disabled={createSession.isPending} onClick={() => open({})}>
          <Plus className="size-4" /> Shell
        </Button>
        {createSession.isError && (
          <p className="text-sm text-destructive">{createSession.error.message}</p>
        )}
        <div className="flex-1" />
        <p className="text-xs text-muted-foreground">
          Detached sessions stay alive for 10 minutes and replay on reattach.
        </p>
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((s) => (
            <span
              key={s.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                activeId === s.id
                  ? "border-primary bg-primary/10"
                  : "cursor-pointer hover:bg-muted",
              )}
              onClick={() => setActiveId(s.id)}
            >
              <TerminalSquare className="size-3" />
              {agentName(s.agentId)}
              <span className="font-mono text-muted-foreground">{shortId(s.id)}</span>
              <Badge variant="outline" className="text-[9px]">
                {formatDate(s.createdAt)}
              </Badge>
              <button
                className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                title="Kill session"
                onClick={(e) => {
                  e.stopPropagation();
                  kill(s.id);
                }}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {active ? (
        <XtermView key={active.id} session={active} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border text-center">
          <TerminalSquare className="size-10 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No terminal attached</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open an interactive agent session (claude / antigravity) or a plain shell.
            </p>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function XtermView({ session }: { session: TerminalSession }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = React.useState<"connecting" | "connected" | "closed">("connecting");

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
      theme: { background: "#0a0a0a" },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const t = (window as unknown as { __SPARSTROW_TOKEN__?: string }).__SPARSTROW_TOKEN__;
    const q = typeof t === "string" && t ? `?token=${encodeURIComponent(t)}` : "";
    const ws = new WebSocket(
      `${protocol}://${window.location.host}${TERMINAL_WS_PATH}/${session.id}${q}`,
    );

    ws.onopen = () => {
      setStatus("connected");
      fit.fit();
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      term.focus();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") term.write(ev.data);
    };
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("closed");

    const dataSub = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "data", data }));
      }
    });

    const observer = new ResizeObserver(() => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      dataSub.dispose();
      ws.close();
      term.dispose();
    };
  }, [session.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-[#0a0a0a]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs text-muted-foreground">
        <span
          className={cn(
            "size-2 rounded-full",
            status === "connected"
              ? "bg-emerald-500"
              : status === "connecting"
                ? "bg-amber-500 animate-pulse"
                : "bg-red-500",
          )}
        />
        {status}
        <span className="font-mono">{session.id}</span>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 p-1" />
    </div>
  );
}
