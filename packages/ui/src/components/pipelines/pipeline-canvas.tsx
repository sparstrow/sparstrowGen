import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";
import type { DraftPipeline, DraftPipelineStep } from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EditableStepNode, type EditableFlowNode } from "./editable-step-node";

/**
 * PipelineCanvas — the P10 editable sibling of the P6 read-only graph (design
 * rule 15: React Flow is the only canvas). A CONTROLLED editor: the parent owns
 * the `DraftPipeline` and wires Publish (Part 5c); this renders the linear chain
 * of `EditableStepNode`s and lifts every edit through `onChange`.
 *
 * v1 is LINEAR (P10-Q2): edges derive from step order, so nodes are not
 * hand-connectable and there is no way to author a cycle or a second start.
 */

const nodeTypes = { editableStep: EditableStepNode };

const STEP_GAP_Y = 175;

export function PipelineCanvas({
  value,
  roster,
  onChange,
}: {
  value: DraftPipeline;
  roster: { id: string; name: string }[];
  onChange: (next: DraftPipeline) => void;
}) {
  const steps: DraftPipelineStep[] = value.steps ?? [];

  // Which step's prompt is open in the editor dialog (null = closed).
  const [promptIndex, setPromptIndex] = React.useState<number | null>(null);
  const [promptDraft, setPromptDraft] = React.useState("");

  const setSteps = (next: DraftPipelineStep[]) => onChange({ ...value, steps: next });
  const patchStep = (i: number, patch: Partial<DraftPipelineStep>) =>
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps([...steps, { onFailure: "abort" }]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSteps(next);
  };

  const openPrompt = (i: number) => {
    setPromptDraft(steps[i]?.promptTemplate ?? "");
    setPromptIndex(i);
  };
  const savePrompt = () => {
    if (promptIndex !== null) patchStep(promptIndex, { promptTemplate: promptDraft });
    setPromptIndex(null);
  };

  const rfNodes: EditableFlowNode[] = steps.map((s, i) => ({
    id: `step-${i}`,
    type: "editableStep",
    position: { x: 0, y: i * STEP_GAP_Y },
    draggable: false,
    data: {
      index: i + 1,
      agentId: s.agentId,
      unresolvedAgentName: s.unresolvedAgentName,
      promptTemplate: s.promptTemplate,
      onFailure: s.onFailure,
      roster,
      isFirst: i === 0,
      isLast: i === steps.length - 1,
      // Resolving an agent clears the Part 4 fix-up marker.
      onChangeAgent: (agentId) => patchStep(i, { agentId, unresolvedAgentName: undefined }),
      onEditPrompt: () => openPrompt(i),
      onToggleFailure: () => patchStep(i, { onFailure: s.onFailure === "continue" ? "abort" : "continue" }),
      onMove: (dir) => moveStep(i, dir),
      onDelete: () => removeStep(i),
    },
  }));

  const rfEdges: Edge[] = steps.slice(1).map((_, i) => ({
    id: `e-${i}`,
    source: `step-${i}`,
    target: `step-${i + 1}`,
    style: { strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  }));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pipeline-name" className="text-xs text-muted-foreground">
            Pipeline name
          </Label>
          <Input
            id="pipeline-name"
            value={value.name ?? ""}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="e.g. Research → Draft → Review"
            maxLength={100}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pipeline-desc" className="text-xs text-muted-foreground">
            Description
          </Label>
          <Input
            id="pipeline-desc"
            value={value.description ?? ""}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-xl border bg-muted/20">
        {steps.length === 0 ? (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              No steps yet. Pipelines run one agent after another, piping each output into the next.
            </p>
            <Button size="sm" onClick={addStep}>
              <Plus className="mr-2 size-4" /> Add the first step
            </Button>
          </div>
        ) : (
          <>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              proOptions={{ hideAttribution: true }}
              nodesConnectable={false}
              edgesFocusable={false}
              deleteKeyCode={null}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
            <Button
              size="sm"
              variant="secondary"
              className="absolute bottom-4 right-4 z-10 shadow-md"
              onClick={addStep}
            >
              <Plus className="mr-2 size-4" /> Add step
            </Button>
          </>
        )}
      </div>

      <Dialog open={promptIndex !== null} onOpenChange={(o) => !o && setPromptIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Step {promptIndex !== null ? promptIndex + 1 : ""} prompt</DialogTitle>
            <DialogDescription>
              Instructions for this agent. Use <code className="rounded bg-muted px-1">{"{{input}}"}</code> to pipe
              the previous step&apos;s output.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            rows={8}
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            placeholder="e.g. Summarize {{input}} into 3 bullet points."
            className="resize-none font-mono text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptIndex(null)}>
              Cancel
            </Button>
            <Button onClick={savePrompt}>Save prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
