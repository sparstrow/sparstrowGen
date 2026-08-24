import { type NodeProps, type Node } from "@xyflow/react";
import { GitPullRequest } from "lucide-react";
import type { PlanNodeStatus } from "@sparstrow/shared";
import { cn } from "@/lib/utils";
import { NodeShell, NodeAgentChip, SEMANTIC_DOT } from "../canvas/node-shell";

/**
 * StatusNode — the P6 member of the shared node family (design rule 15). Run
 * status ring + label + agent chip + drill-in, built on the shared `NodeShell`.
 * P10's `EditableStepNode` reuses the same shell + tokens with form affordances.
 * Ring/dot come from the locked semantic tokens in `../canvas/node-shell`.
 */

export interface StatusNodeData extends Record<string, unknown> {
  label: string;
  status: PlanNodeStatus;
  statusDetail: string | null;
  agentName: string | null;
  kind: string;
}

export type StatusFlowNode = Node<StatusNodeData, "status">;

export function StatusNode({ data }: NodeProps<StatusFlowNode>) {
  return (
    <NodeShell status={data.status} title={data.statusDetail ?? undefined}>
      <div className="flex items-center gap-1.5">
        <span className={cn("size-2 shrink-0 rounded-full", SEMANTIC_DOT[data.status])} />
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
      {data.agentName && <NodeAgentChip name={data.agentName} className="mt-1.5" />}
    </NodeShell>
  );
}
