import * as React from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Play, Plus, Trash2, Workflow, Bot } from "lucide-react";
import type { Pipeline, RunStatus } from "@sparstrow/shared";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RunStatusBadge } from "@/components/run-status-badge";
import {
  useAgents,
  useCreatePipeline,
  useDeletePipeline,
  usePipelineRuns,
  usePipelines,
  useRunPipeline,
  useUpdatePipeline,
  useTeam,
} from "@/api/hooks";
import { ManagerChatPanel } from "@/components/team/manager-chat-panel";
import { formatDate, shortId } from "@/lib/format";

interface StepDraft {
  agentId: string;
  promptTemplate: string;
  onFailure: "abort" | "continue";
}

const EMPTY_STEP: StepDraft = { agentId: "", promptTemplate: "{{input}}", onFailure: "abort" };

export function PipelinesPage({ teamId, readOnly }: { teamId?: string; readOnly?: boolean } = {}) {
  const pipelines = usePipelines(teamId);
  const agents = useAgents();
  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();
  const deletePipeline = useDeletePipeline();
  const runPipeline = useRunPipeline();

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Pipeline | null>(null);
  const [runTarget, setRunTarget] = React.useState<Pipeline | null>(null);
  const [expandedRuns, setExpandedRuns] = React.useState<string | null>(null);
  const [managerOpen, setManagerOpen] = React.useState(false);

  const teamQuery = useTeam(teamId ?? "");
  const roster = teamQuery.data?.members.map((m) => ({ id: m.agentId, name: m.agentName })) ?? [];

  // editor state
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [steps, setSteps] = React.useState<StepDraft[]>([{ ...EMPTY_STEP }]);

  // run dialog state
  const [runPrompt, setRunPrompt] = React.useState("");

  const agentName = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? shortId(id);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setSteps([{ ...EMPTY_STEP }]);
    setEditorOpen(true);
  };

  const openEdit = (p: Pipeline) => {
    setEditing(p);
    setName(p.name);
    setDescription(p.description);
    setSteps(
      p.steps.map((s) => ({
        agentId: s.agentId,
        promptTemplate: s.promptTemplate,
        onFailure: s.onFailure,
      })),
    );
    setEditorOpen(true);
  };

  const patchStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const stepsValid = steps.length > 0 && steps.every((s) => s.agentId && s.promptTemplate.trim());
  const saving = createPipeline.isPending || updatePipeline.isPending;

  const submit = () => {
    const body = {
      name: name.trim(),
      description,
      steps: steps.map((s, i) => ({ ...s, position: i })),
    };
    const onSuccess = () => setEditorOpen(false);
    if (editing) {
      updatePipeline.mutate({ id: editing.id, data: body }, { onSuccess });
    } else {
      createPipeline.mutate({ ...body, projectId: null, teamId: null, enabled: true }, { onSuccess });
    }
  };

  const submitRun = () => {
    if (!runTarget || !runPrompt.trim()) return;
    runPipeline.mutate(
      { id: runTarget.id, prompt: runPrompt },
      {
        onSuccess: () => {
          setExpandedRuns(runTarget.id);
          setRunTarget(null);
          setRunPrompt("");
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Chain agents — each step's prompt template can use {"{{input}}"},{" "}
          {"{{trigger_prompt}}"} and {"{{steps.N.output}}"}.
        </p>
        <div className="flex-1" />
        {!readOnly && (
          <div className="flex items-center gap-2">
            {teamId && (
              <Button variant="outline" onClick={() => setManagerOpen(true)}>
                <Bot className="mr-2 size-4" /> Draft with Manager
              </Button>
            )}
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New pipeline
            </Button>
          </div>
        )}
      </div>

      {pipelines.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (pipelines.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center bg-card">
          <Workflow className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">{teamId ? "No pipelines in this team yet" : "No pipelines yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {teamId ? "Create one to chain agents together." : "Build a multi-step chain like research → draft → review."}
          </p>
          {teamId && !readOnly && (
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => setManagerOpen(true)}>
                <Bot className="mr-2 size-4" /> Draft with Manager
              </Button>
              <Button onClick={openCreate}>
                <Plus className="mr-2 size-4" /> Create pipeline
              </Button>
            </div>
          )}
          {!teamId && !readOnly && (
            <Button variant="link" size="sm" className="mt-2" onClick={openCreate}>
              Create the first pipeline
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(pipelines.data ?? []).map((p) => (
            <div key={p.id} className="rounded-xl border">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    {!p.enabled && <Badge variant="outline">disabled</Badge>}
                  </div>
                  {p.description && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{p.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {p.steps.map((s, i) => (
                      <React.Fragment key={s.id}>
                        {i > 0 && <ChevronRight className="size-3" />}
                        <Badge variant="secondary" className="text-[10px]">
                          {i + 1}. {agentName(s.agentId)}
                        </Badge>
                      </React.Fragment>
                    ))}
                    {p.steps.length === 0 && <span>no steps</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(enabled) =>
                      updatePipeline.mutate({ id: p.id, data: { enabled } })
                    }
                  />
                  <Button
                    size="sm"
                    disabled={!p.enabled || p.steps.length === 0}
                    onClick={() => {
                      setRunTarget(p);
                      setRunPrompt("");
                    }}
                  >
                    <Play className="size-3.5" /> Run
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deletePipeline.mutate(p.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedRuns(expandedRuns === p.id ? null : p.id)}
                  >
                    {expandedRuns === p.id ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                    Runs
                  </Button>
                </div>
              </div>
              {expandedRuns === p.id && <PipelineRunList pipelineId={p.id} />}
            </div>
          ))}
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New pipeline"}</DialogTitle>
            <DialogDescription>
              Steps run in order; each step's output becomes the next step's {"{{input}}"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="research → draft → review" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Steps</Label>
              {steps.map((step, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">step {i + 1}</Badge>
                    <Select value={step.agentId} onValueChange={(v) => patchStep(i, { agentId: v })}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Pick an agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {(agents.data ?? [])
                          .filter((a) => a.enabled)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={step.onFailure}
                      onValueChange={(v) => patchStep(i, { onFailure: v as "abort" | "continue" })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="abort">abort on failure</SelectItem>
                        <SelectItem value="continue">continue on failure</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={steps.length === 1}
                      onClick={() => removeStep(i)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    rows={3}
                    value={step.promptTemplate}
                    onChange={(e) => patchStep(i, { promptTemplate: e.target.value })}
                    placeholder={
                      i === 0
                        ? "{{trigger_prompt}} — or write a full prompt"
                        : "Refine this draft:\n\n{{input}}"
                    }
                    className="font-mono text-xs"
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setSteps((s) => [...s, { ...EMPTY_STEP }])}>
                <Plus className="size-3.5" /> Add step
              </Button>
            </div>

            {(createPipeline.isError || updatePipeline.isError) && (
              <p className="text-sm text-destructive">
                {createPipeline.error?.message ?? updatePipeline.error?.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim() || !stepsValid || saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run dialog */}
      <Dialog open={runTarget !== null} onOpenChange={(open) => !open && setRunTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Run {runTarget?.name}</DialogTitle>
            <DialogDescription>
              This prompt is available to every step as {"{{trigger_prompt}}"} and feeds step 1's{" "}
              {"{{input}}"}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={5}
            value={runPrompt}
            onChange={(e) => setRunPrompt(e.target.value)}
            placeholder="What should the pipeline work on?"
          />
          {runPipeline.isError && (
            <p className="text-sm text-destructive">{runPipeline.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRun} disabled={!runPrompt.trim() || runPipeline.isPending}>
              {runPipeline.isPending ? "Starting…" : "Start pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manager dialog */}
      {teamId && (
        <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none">
            <DialogTitle className="sr-only">Draft Pipeline with Manager</DialogTitle>
            <DialogDescription className="sr-only">
              Chat with the team manager to draft a pipeline.
            </DialogDescription>
            <ManagerChatPanel teamId={teamId} roster={roster} defaultMode="draft" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PipelineRunList({ pipelineId }: { pipelineId: string }) {
  const runs = usePipelineRuns(pipelineId);
  if (runs.isLoading) {
    return (
      <div className="border-t p-3">
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  const items = runs.data ?? [];
  return (
    <div className="divide-y border-t">
      {items.length === 0 && (
        <p className="p-3 text-sm text-muted-foreground">No runs yet.</p>
      )}
      {items.map((pr) => (
        <div key={pr.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
          <span className="font-mono text-xs">{shortId(pr.id)}</span>
          <RunStatusBadge status={pr.status as RunStatus} />
          <span className="text-muted-foreground">step {pr.currentStep + 1}</span>
          <span className="text-muted-foreground">{pr.trigger}</span>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {formatDate(pr.startedAt)} {pr.finishedAt ? `→ ${formatDate(pr.finishedAt)}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
