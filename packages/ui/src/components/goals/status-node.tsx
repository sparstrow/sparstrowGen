import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Bot, GitPullRequest } from "lucide-react";
import type { PlanNodeStatus } from "@sparstrow/shared";
import { cn } from "@/lib/utils";

/**
 * StatusNode — THE node family (design rule 15: one canvas, one status
 * vocabulary). Status ring + label + agent chip + drill-in; P10's
 * EditableStepNode reuses this shell with form affordances.
 * Ring colors are the locked semantic tokens: attention/blocked=amber,
 * approval=violet, failed=red, done=emerald (green glow per the vision),
 * skipped=gray, running=animated accent, pending=muted.
 */

export interface StatusNodeData extends Record<string, unknown> {
  label: string;
  status: PlanNodeStatus;
  statusDetail: string | null;
  agentName: string | null;
  kind: string;
}

export type StatusFlowNode = Node<StatusNodeData, "status">;

const RING: Record<PlanNodeStatus, string> = {
  pending: "border-muted-foreground/30 border-dashed",
  ready: "border-muted-foreground/50",
  running: "border-primary ring-2 ring-primary/30 animate-pulse",
  attention: "border-amber-500 ring-2 ring-amber-500/30",
  approval: "border-violet-500 ring-2 ring-violet-500/30",
  done: "border-emerald-500 ring-2 ring-emerald-500/40 shadow-[0_0_14px_rgba(16,185,129,0.35)]",
  failed: "border-red-500 ring-2 ring-red-500/30",
  skipped: "border-muted-foreground/20 opacity-50",
};

const DOT: Record<PlanNodeStatus, string> = {
  pending: "bg-muted-foreground/40",
  ready: "bg-muted-foreground",
  running: "bg-primary",
  attention: "bg-amber-500",
  approval: "bg-violet-500",
  done: "bg-emerald-500",
  failed: "bg-red-500",
  skipped: "bg-muted-foreground/30",
};

export function StatusNode({ data }: NodeProps<StatusFlowNode>) {
  return (
    <div
      className={cn(
        "w-56 rounded-xl border-2 bg-background p-3 text-left shadow-sm transition-colors",
        RING[data.status],
      )}
      title={data.statusDetail ?? undefined}
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-muted-foreground/50" />
      <div className="flex items-center gap-1.5">
        <span className={cn("size-2 shrink-0 rounded-full", DOT[data.status])} />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {data.status}
        </span>
        {data.kind === "push" && (
          <GitPullRequest className="ml-auto size-3 shrink-0 text-muted-foreground" aria-label="push step" />
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug">{data.label}</p>
      {data.statusDetail && (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{data.statusDetail}</p>
      )}
      {data.agentName && (
        <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Bot className="size-2.5 shrink-0" />
          <span className="truncate">{data.agentName}</span>
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-muted-foreground/50" />
    </div>
  );
}
