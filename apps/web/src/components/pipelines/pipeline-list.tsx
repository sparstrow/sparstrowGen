import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { DraftPipeline } from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { usePipelineDraftEditor } from "./use-pipeline-draft-editor";

export function PipelineList({
  value,
  roster,
  onChange,
}: {
  value: DraftPipeline;
  roster: { id: string; name: string }[];
  onChange: (next: DraftPipeline) => void;
}) {
  const { steps, updateField, patchStep, addStep, removeStep, moveStep } = usePipelineDraftEditor({
    value,
    onChange,
  });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-2 pb-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pipeline-list-name" className="text-xs text-muted-foreground">
            Pipeline name
          </Label>
          <Input
            id="pipeline-list-name"
            value={value.name ?? ""}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="e.g. Research → Draft → Review"
            maxLength={100}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pipeline-list-desc" className="text-xs text-muted-foreground">
            Description
          </Label>
          <Input
            id="pipeline-list-desc"
            value={value.description ?? ""}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="space-y-4">
        {steps.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground bg-muted/20">
            <p>No steps yet.</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={addStep}>
              <Plus className="mr-2 size-4" /> Add the first step
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-4 shadow-sm bg-card">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">step {i + 1}</Badge>
                  
                  <div className="flex items-center gap-2 flex-1">
                    <Select value={step.agentId} onValueChange={(v) => patchStep(i, { agentId: v, unresolvedAgentName: undefined })}>
                      <SelectTrigger className="w-[200px]" aria-label={`Select agent for step ${i + 1}`}>
                        <SelectValue placeholder="Pick an agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {roster.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {step.unresolvedAgentName && (
                      <span className="text-xs font-semibold px-2 py-1 bg-destructive/10 text-destructive rounded border border-destructive/20">
                        Unknown: {step.unresolvedAgentName}
                      </span>
                    )}
                  </div>

                  <Select
                    value={step.onFailure}
                    onValueChange={(v) => patchStep(i, { onFailure: v as "abort" | "continue" })}
                  >
                    <SelectTrigger className="w-[180px]" aria-label={`On failure behavior for step ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="abort">abort on failure</SelectItem>
                      <SelectItem value="continue">continue on failure</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={i === 0}
                      onClick={() => moveStep(i, -1)}
                      aria-label={`Move step ${i + 1} up`}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                      aria-label={`Move step ${i + 1} down`}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => removeStep(i)}
                      aria-label={`Delete step ${i + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`prompt-${i}`} className="text-xs text-muted-foreground">
                    Prompt (use {"{{input}}"} to pipe previous output)
                  </Label>
                  <Textarea
                    id={`prompt-${i}`}
                    rows={4}
                    value={step.promptTemplate ?? ""}
                    onChange={(e) => patchStep(i, { promptTemplate: e.target.value })}
                    placeholder={
                      i === 0
                        ? "{{trigger_prompt}} — or write a full prompt"
                        : "Refine this draft:\n\n{{input}}"
                    }
                    className="font-mono text-xs resize-y"
                  />
                </div>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addStep} className="mt-2">
              <Plus className="mr-2 size-4" /> Add step
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
