import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import type { RunEvent } from "@sparstrow/shared";
import { ArrowLeft, ChevronRight, OctagonX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RunStatusBadge } from "@/components/run-status-badge";
import { RunTranscript } from "@/components/run-transcript";
import { useAgents, useCancelRun, useRun, useRunEvents } from "@/api/hooks";
import { wsHub } from "@/lib/ws";
import { cn } from "@/lib/utils";
import { formatCost, formatDate, formatDuration } from "@/lib/format";

export function RunDetailPage() {
  const { runId } = useParams({ from: "/runs/$runId" });
  const run = useRun(runId);
  const agents = useAgents();
  const fetchedEvents = useRunEvents(runId);
  const cancelRun = useCancelRun();
  const [liveEvents, setLiveEvents] = React.useState<RunEvent[]>([]);
  const [memoryOpen, setMemoryOpen] = React.useState(false);

  const isActive = run.data?.status === "running" || run.data?.status === "queued";

  React.useEffect(() => {
    if (!isActive) return;
    return wsHub.subscribe((event) => {
      if (event.type === "run.event" && event.runId === runId) {
        setLiveEvents((prev) =>
          prev.some((e) => e.seq === event.event.seq) ? prev : [...prev, event.event],
        );
      }
    });
  }, [runId, isActive]);

  const events = React.useMemo(() => {
    const merged = new Map<number, RunEvent>();
    for (const e of fetchedEvents.data ?? []) merged.set(e.seq, e);
    for (const e of liveEvents) merged.set(e.seq, e);
    return [...merged.values()].sort((a, b) => a.seq - b.seq);
  }, [fetchedEvents.data, liveEvents]);

  const agent = agents.data?.find((a) => a.id === run.data?.agentId);

  if (run.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!run.data) {
    return <p className="text-sm text-muted-foreground">Run not found.</p>;
  }
  const r = run.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/runs">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <span className="font-mono text-sm">{r.id}</span>
        <RunStatusBadge status={r.status} />
        {agent && <span className="text-sm text-muted-foreground">{agent.name} · {agent.model}</span>}
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{formatDuration(r.durationMs)}</span>
          <span>{formatCost(r.costUsd)}</span>
          {r.numTurns != null && <span>{r.numTurns} turns</span>}
          <span>{formatDate(r.createdAt)}</span>
        </div>
        {isActive && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => cancelRun.mutate(r.id)}
            disabled={cancelRun.isPending}
          >
            <OctagonX className="size-4" /> Cancel
          </Button>
        )}
      </div>

      {r.injectedContext && (
        <div className="rounded-md border">
          <button
            type="button"
            onClick={() => setMemoryOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", memoryOpen && "rotate-90")}
            />
            Injected memory context
          </button>
          {memoryOpen && (
            <pre className="max-h-64 overflow-auto border-t bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap">
              {r.injectedContext}
            </pre>
          )}
        </div>
      )}

      {/* P2 effective-tools snapshot: the immutable audit artifact of what this run
          could touch (resolved Global→Agent→Project→Task at spawn). Flat list, not a
          matrix (design H6) — the provenance matrix is deferred. */}
      {r.effectiveTools && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-3 py-2 text-xs">
          <span className="text-muted-foreground">Tools this run could use:</span>
          {r.effectiveTools.allowed.length > 0 ? (
            r.effectiveTools.allowed.map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {t}
              </span>
            ))
          ) : (
            <span className="italic text-muted-foreground">provider default</span>
          )}
          {r.effectiveTools.disallowed.map((t) => (
            <span
              key={t}
              className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive line-through"
              title="denied by policy"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{r.prompt}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <RunTranscript events={events} live={isActive} />
        </CardContent>
      </Card>

      {(r.resultText || r.error) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {r.resultText && <p className="whitespace-pre-wrap text-sm">{r.resultText}</p>}
            {r.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {r.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
