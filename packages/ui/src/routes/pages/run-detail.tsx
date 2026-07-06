import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import type { EffectiveTools, RunEvent } from "@sparstrow/shared";
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

      {/* P5 (design F7): graph usage in the provenance cluster — shown for
          graph-enabled runs INCLUDING zero ("not used" is the diagnostic that
          the success criterion is failing), never for graph-disabled runs. */}
      <GraphUsageLine effectiveTools={r.effectiveTools} events={events} />

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

const GRAPH_TOOLS = [
  "search_graph",
  "trace_path",
  "query_graph",
  "get_graph_schema",
  "get_code_snippet",
  "get_architecture",
  "detect_changes",
];

/** Mirrors core's snapshotAllows: disallow wins (either spelling); empty allowed = all. */
function graphEnabled(eff: EffectiveTools | null | undefined): boolean {
  if (!eff) return false;
  return GRAPH_TOOLS.some((n) => {
    const spellings = [n, `mcp__sparstrow-memory__${n}`];
    if (spellings.some((s) => eff.disallowed.includes(s))) return false;
    return eff.allowed.length === 0 || spellings.some((s) => eff.allowed.includes(s));
  });
}

/**
 * P5 T9: "Graph tools: trace_path ×3 · search_graph ×1" / "not used" — computed
 * from the tool_use blocks already in the transcript (summarizes, never
 * duplicates run_events). Zero is SHOWN for graph-enabled runs: it is the
 * signal that the phase success criterion is failing.
 */
function GraphUsageLine({
  effectiveTools,
  events,
}: {
  effectiveTools: EffectiveTools | null | undefined;
  events: RunEvent[];
}) {
  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      if (e.type !== "assistant") continue;
      const payload = e.payload as { message?: { content?: unknown } } | null;
      const content = payload?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content as { type?: string; name?: string }[]) {
        if (block.type !== "tool_use" || !block.name) continue;
        const bare = block.name.replace(/^mcp__sparstrow-memory__/, "");
        if (GRAPH_TOOLS.includes(bare)) map.set(bare, (map.get(bare) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  if (!graphEnabled(effectiveTools)) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-3 py-2 text-xs">
      <span className="text-muted-foreground">Graph tools:</span>
      {counts.length === 0 ? (
        <span className="italic text-muted-foreground">not used</span>
      ) : (
        counts.map(([name, n]) => (
          <span key={name} className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {name} ×{n}
          </span>
        ))
      )}
    </div>
  );
}
