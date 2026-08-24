import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Bot,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
} from "lucide-react";
import type { Goal, GoalStatus, PlanNodeView } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalGraph } from "@/components/goals/goal-graph";
import {
  useAgents,
  useCancelGoal,
  useCancelNode,
  useGoalDetail,
  usePauseGoal,
  useProjects,
  useReplanGoal,
  useResumeGoal,
  useRetryNode,
} from "@/api/hooks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Goal status → the locked semantic tokens (design rule 15). */
const GOAL_BADGE: Record<GoalStatus, string> = {
  planning: "border-info/50 text-info",
  running: "border-primary/50 text-primary",
  blocked: "border-warning/50 text-warning",
  done: "border-success/50 text-success",
  cancelled: "text-muted-foreground",
};

export function GoalDetailPage() {
  const { goalId } = useParams<{ goalId: string }>();
  const detail = useGoalDetail(goalId);
  const agents = useAgents();
  const projects = useProjects();
  const pause = usePauseGoal();
  const resume = useResumeGoal();
  const cancel = useCancelGoal();
  const replan = useReplanGoal();
  const retryNode = useRetryNode();
  const cancelNode = useCancelNode();
  const [selectedNode, setSelectedNode] = React.useState<PlanNodeView | null>(null);

  const agentName = React.useCallback(
    (id: string | null) => (id ? (agents.data?.find((a) => a.id === id)?.name ?? null) : null),
    [agents.data],
  );

  // Keep the node dialog live as WS invalidations refresh the detail.
  React.useEffect(() => {
    if (!selectedNode || !detail.data) return;
    const fresh = detail.data.nodes.find((n) => n.id === selectedNode.id);
    if (fresh && fresh !== selectedNode) setSelectedNode(fresh);
  }, [detail.data, selectedNode]);

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          {detail.error?.message ?? "Goal not found."}
        </p>
      </div>
    );
  }

  const { goal, nodes, edges } = detail.data;
  const projectName = goal.projectId
    ? (projects.data?.find((p) => p.id === goal.projectId)?.name ?? null)
    : null;
  const doneCount = nodes.filter((n) => n.status === "done").length;
  const act = (m: { mutate: (v: { id: string }) => void; isPending: boolean }) => ({
    onClick: () => m.mutate({ id: goal.id }),
    disabled: m.isPending,
  });

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <BackLink />
        <Badge variant="outline" className={cn("capitalize", GOAL_BADGE[goal.status])}>
          {goal.status === "planning" && <Loader2 className="size-3 animate-spin" />}
          {goal.status}
        </Badge>
        {goal.paused && (
          <Badge variant="outline" className="border-warning/50 text-warning">
            paused
          </Badge>
        )}
        {goal.planVersion > 0 && (
          <Badge variant="outline" className="tabular-nums">
            v{goal.planVersion} · {doneCount}/{nodes.length} done
          </Badge>
        )}
        {projectName && <Badge variant="outline">{projectName}</Badge>}
        <div className="flex-1" />
        {!["done", "cancelled"].includes(goal.status) && (
          <>
            {goal.paused ? (
              <Button size="sm" variant="outline" {...act(resume)}>
                <Play className="size-3.5" /> Resume
              </Button>
            ) : (
              <Button size="sm" variant="outline" {...act(pause)}>
                <Pause className="size-3.5" /> Pause
              </Button>
            )}
            {goal.planVersion > 0 && (
              <Button size="sm" variant="outline" {...act(replan)}>
                <RefreshCcw className="size-3.5" /> Replan
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-destructive" {...act(cancel)}>
              <Ban className="size-3.5" /> Cancel
            </Button>
          </>
        )}
      </div>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold leading-snug">{goal.prompt}</h1>
        {goal.planSummary && <p className="max-w-3xl text-sm text-muted-foreground">{goal.planSummary}</p>}
      </div>

      {/* State banners (UI states registry, rule 14) */}
      {goal.status === "blocked" && goal.blockedReason && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm font-medium text-warning">Needs you</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{goal.blockedReason}</p>
        </div>
      )}
      {goal.status === "done" && (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          All steps completed.
        </div>
      )}
      {goal.status === "planning" && (
        <div className="flex items-center gap-2 rounded-lg border border-info/40 bg-info/5 p-3 text-sm">
          <Loader2 className="size-4 animate-spin text-info" />
          {goal.planVersion === 0
            ? "The Planner is mapping the steps…"
            : `Replanning after a failure — v${goal.planVersion + 1} is being drafted…`}
          {goal.plannerAttempts > 0 && (
            <span className="text-muted-foreground">(attempt {goal.plannerAttempts + 1})</span>
          )}
        </div>
      )}

      {/* Plan-version timeline ("v2 — replanned after node X failed") */}
      {goal.versionLog.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {goal.versionLog.map((v) => (
            <Badge
              key={v.planVersion}
              variant={v.planVersion === goal.planVersion ? "secondary" : "outline"}
              className="max-w-md gap-1 text-[10px]"
              title={`${v.reason} · ${formatDate(v.at)} · ${v.nodeCount} nodes`}
            >
              <span className="font-semibold">v{v.planVersion}</span>
              <span className="truncate text-muted-foreground">— {v.reason}</span>
            </Badge>
          ))}
        </div>
      )}

      {nodes.length > 0 ? (
        <div className="min-h-0 flex-1">
          <GoalGraph nodes={nodes} edges={edges} agentName={agentName} onNodeClick={setSelectedNode} />
        </div>
      ) : (
        goal.status !== "planning" && (
          <p className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
            No plan yet{goal.status === "blocked" ? " — resolve the block above to continue." : "."}
          </p>
        )
      )}

      {/* Node drill-in */}
      <Dialog open={selectedNode !== null} onOpenChange={(open) => !open && setSelectedNode(null)}>
        <DialogContent className="max-w-lg">
          {selectedNode && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{selectedNode.label}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">{selectedNode.status}</Badge>
                  {agentName(selectedNode.agentId) && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Bot className="size-2.5" /> {agentName(selectedNode.agentId)}
                    </Badge>
                  )}
                  {selectedNode.kind === "push" && <Badge variant="outline">push step</Badge>}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {selectedNode.statusDetail && (
                  <p className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-sm">
                    {selectedNode.statusDetail}
                  </p>
                )}
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
                  {selectedNode.description}
                </p>
                {(selectedNode.pre.length > 0 || selectedNode.effects.length > 0) && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {selectedNode.pre.length > 0 && <p>Needs: {selectedNode.pre.join(", ")}</p>}
                    {selectedNode.effects.length > 0 && <p>Delivers: {selectedNode.effects.join(", ")}</p>}
                  </div>
                )}
                {selectedNode.taskId && (
                  <p className="text-xs text-muted-foreground">
                    Task <span className="font-mono">{selectedNode.taskId}</span> — find it on the{" "}
                    <Link href="/tasks" className="text-primary hover:underline">
                      board
                    </Link>
                    .
                  </p>
                )}
                {(retryNode.isError || cancelNode.isError) && (
                  <p className="text-xs text-destructive">
                    {retryNode.error?.message ?? cancelNode.error?.message}
                  </p>
                )}
              </div>
              <DialogFooter>
                {/* CEO E2 graph controls: cancel in-flight work, retry a failed step. */}
                {selectedNode.taskId !== null &&
                  ["running", "attention", "approval"].includes(selectedNode.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => cancelNode.mutate({ goalId: goal.id, nodeId: selectedNode.id })}
                      disabled={cancelNode.isPending}
                    >
                      <Ban className="size-3.5" />
                      {cancelNode.isPending ? "Cancelling…" : "Cancel this step"}
                    </Button>
                  )}
                {selectedNode.status === "failed" && (
                  <Button
                    size="sm"
                    onClick={() => retryNode.mutate({ goalId: goal.id, nodeId: selectedNode.id })}
                    disabled={retryNode.isPending}
                  >
                    <RotateCcw className="size-3.5" />
                    {retryNode.isPending ? "Retrying…" : "Retry this step"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/tasks"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Tasks
    </Link>
  );
}

/** Compact goal card for the Goals tab list. */
export function GoalCard({ goal, projectName }: { goal: Goal; projectName: string | null }) {
  return (
    <Link
      href={`/tasks/goals/${goal.id}`}
      className="flex flex-col gap-2 rounded-xl border bg-background p-3 text-left shadow-sm transition-colors hover:border-primary/40"
    >
      <p className="line-clamp-2 text-sm font-medium leading-snug">{goal.prompt}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={cn("capitalize", GOAL_BADGE[goal.status])}>
          {goal.status === "planning" && <Loader2 className="size-3 animate-spin" />}
          {goal.status}
        </Badge>
        {goal.paused && (
          <Badge variant="outline" className="border-warning/50 text-warning">
            paused
          </Badge>
        )}
        {goal.planVersion > 0 && (
          <Badge variant="outline" className="tabular-nums text-[10px]">
            v{goal.planVersion}
          </Badge>
        )}
        {projectName && <Badge variant="outline" className="text-[10px]">{projectName}</Badge>}
        <span className="ml-auto text-[10px] text-muted-foreground">{formatDate(goal.updatedAt)}</span>
      </div>
      {goal.status === "blocked" && goal.blockedReason && (
        <p className="line-clamp-2 text-xs text-warning">{goal.blockedReason}</p>
      )}
    </Link>
  );
}
