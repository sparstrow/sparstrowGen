import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { RunEvent } from "@sparstrow/shared";
import { ArrowLeft, ChevronRight, OctagonX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RunStatusBadge } from "@web/components/run-status-badge";
import { RunTranscript } from "@web/components/run-transcript";
import { useAgents, useRun, useRunEvents } from "@web/api/hooks";
import { useLiveEvents } from "@web/lib/live-events";
import { mergeRunEvents } from "@web/lib/merge-run-events";
import { cn } from "@/lib/utils";
import { formatCost, formatDate, formatDuration } from "@/lib/format";
import { callAction } from "@web/lib/call-action";
import { cancelRunAction } from "../actions";
import { useQueryClient } from "@tanstack/react-query";

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const run = useRun(runId);
  const agents = useAgents();
  const fetchedEvents = useRunEvents(runId);
  const queryClient = useQueryClient();
  const [cancelPending, startCancel] = React.useTransition();
  const liveSource = useLiveEvents();
  const [liveEvents, setLiveEvents] = React.useState<RunEvent[]>([]);
  const [memoryOpen, setMemoryOpen] = React.useState(false);

  const isActive = run.data?.status === "running" || run.data?.status === "queued";

  React.useEffect(() => {
    if (!isActive) return;
    return liveSource.subscribeRun(runId, (event) => {
      setLiveEvents((prev) => (prev.some((e) => e.seq === event.seq) ? prev : [...prev, event]));
    });
  }, [runId, isActive, liveSource]);

  const events = React.useMemo(
    () => mergeRunEvents(fetchedEvents.data ?? [], liveEvents),
    [fetchedEvents.data, liveEvents],
  );

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
          <Link href="/runs">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <span className="font-mono text-sm">{r.id}</span>
        <RunStatusBadge status={r.status} />
        {r.untrusted && (
          <span
            className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning"
            title="This run consumed untrusted/external content (sandbox, delegated task, or web/foreign-MCP tools). Signal notes extracted from it are quarantined."
          >
            untrusted content
          </span>
        )}
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
            onClick={() =>
              startCancel(async () => {
                const result = await callAction(() => cancelRunAction(r.id));
                if (!result.ok) return;
                void queryClient.invalidateQueries({ queryKey: ["runs"] });
                void queryClient.invalidateQueries({ queryKey: ["run", r.id] });
              })
            }
            disabled={cancelPending}
          >
            <OctagonX className="size-4" /> Cancel
          </Button>
        )}
      </div>

      {/* E1 (P5): memory provenance at a glance — which notes and directives
          entered this run, from the injector's post-budget manifest. The raw
          block stays available in the collapsible below. */}
      {r.injectedMemory && (
        <div className="space-y-1.5 rounded-md border px-3 py-2 text-xs">
          {r.injectedMemory.notes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">Memory injected:</span>
              {r.injectedMemory.notes.map((n) => (
                <span
                  key={n.id}
                  className="rounded bg-muted px-1.5 py-0.5"
                  title={`${n.path} · scope ${n.scope}${n.projectSlug ? `/${n.projectSlug}` : ""} · written-by ${n.source}`}
                >
                  {n.title}
                  {n.type !== "note" && <span className="ml-1 text-muted-foreground">({n.type})</span>}
                </span>
              ))}
            </div>
          )}
          {r.injectedMemory.directives.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">Directives applied:</span>
              {r.injectedMemory.directives.map((d) => (
                <span key={d.id} className="rounded bg-muted px-1.5 py-0.5" title={d.body}>
                  {d.body.length > 60 ? `${d.body.slice(0, 60)}…` : d.body}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
