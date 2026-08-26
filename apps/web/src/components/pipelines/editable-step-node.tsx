import { type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NodeShell, type NodeSemanticStatus } from "../canvas/node-shell";

/**
 * EditableStepNode — the P10 member of the shared node family (design rule 15).
 * Same `NodeShell` + semantic tokens as the P6 `StatusNode`, but with authoring
 * affordances: agent picker, prompt preview (click → edit), on-failure toggle,
 * reorder, delete. A step with an unresolved agent (Part 4 fix-up marker) maps
 * onto the `attention` (amber) token until the owner picks a real roster agent.
 */

export interface EditableStepNodeData extends Record<string, unknown> {
  index: number; // 1-based, for display
  agentId?: string;
  unresolvedAgentName?: string;
  promptTemplate?: string;
  onFailure?: "abort" | "continue";
  roster: { id: string; name: string }[];
  isFirst: boolean;
  isLast: boolean;
  onChangeAgent: (agentId: string) => void;
  onEditPrompt: () => void;
  onToggleFailure: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}

export type EditableFlowNode = Node<EditableStepNodeData, "editableStep">;

export function EditableStepNode({ data }: NodeProps<EditableFlowNode>) {
  const resolved = Boolean(data.agentId) && !data.unresolvedAgentName;
  const status: NodeSemanticStatus = resolved ? "ready" : "attention";

  return (
    <NodeShell status={status}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Step {data.index}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className="nodrag rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
            onClick={() => data.onMove(-1)}
            disabled={data.isFirst}
            aria-label={`Move step ${data.index} up`}
          >
            <ArrowUp className="size-3" />
          </button>
          <button
            type="button"
            className="nodrag rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
            onClick={() => data.onMove(1)}
            disabled={data.isLast}
            aria-label={`Move step ${data.index} down`}
          >
            <ArrowDown className="size-3" />
          </button>
          <button
            type="button"
            className="nodrag rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={data.onDelete}
            aria-label={`Delete step ${data.index}`}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>

      <div className="mt-1.5">
        <Select value={data.agentId ?? ""} onValueChange={data.onChangeAgent}>
          <SelectTrigger className="nodrag h-7 text-xs" aria-label="Step agent">
            <SelectValue
              placeholder={data.unresolvedAgentName ? `Unknown: ${data.unresolvedAgentName}` : "Select agent…"}
            />
          </SelectTrigger>
          <SelectContent className="nowheel">
            {data.roster.map((r) => (
              <SelectItem key={r.id} value={r.id} className="text-xs">
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data.unresolvedAgentName && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-warning/10 px-1.5 py-0.5 text-[10px] leading-snug text-warning">
          <AlertTriangle className="size-2.5 shrink-0" />
          <span>Unknown agent — pick a replacement</span>
        </p>
      )}

      <button
        type="button"
        onClick={data.onEditPrompt}
        className="nodrag mt-1.5 block w-full rounded-md border bg-muted/40 p-1.5 text-left text-[10px] leading-snug transition-colors hover:bg-muted"
      >
        {data.promptTemplate ? (
          <span className="line-clamp-2 text-foreground">{data.promptTemplate}</span>
        ) : (
          <span className="italic text-muted-foreground">Add a prompt…</span>
        )}
      </button>

      <button
        type="button"
        onClick={data.onToggleFailure}
        className={cn(
          "nodrag mt-1.5 text-[10px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground",
        )}
        title="Toggle what happens if this step fails"
      >
        on failure: {data.onFailure ?? "abort"}
      </button>
    </NodeShell>
  );
}
