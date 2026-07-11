import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import type { RunStatus } from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { RunStatusBadge } from "@/components/run-status-badge";
import { useAgents, useCreateRun, useProjects, useRuns } from "@/api/hooks";
import { formatCost, formatDate, formatDuration, shortId } from "@/lib/format";

const STATUSES: RunStatus[] = ["queued", "running", "succeeded", "failed", "cancelled", "timeout"];

export function RunsPage() {
  const navigate = useNavigate();
  const [agentFilter, setAgentFilter] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const agents = useAgents();
  const projects = useProjects();
  const runs = useRuns({
    agentId: agentFilter || undefined,
    status: (statusFilter || undefined) as RunStatus | undefined,
    limit: 200,
  });
  const createRun = useCreateRun();

  const [newAgentId, setNewAgentId] = React.useState("");
  const [newProjectId, setNewProjectId] = React.useState("");
  const [newPrompt, setNewPrompt] = React.useState("");

  const agentName = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? shortId(id);
  const projectName = (id: string | null) =>
    id ? (projects.data?.find((p) => p.id === id)?.name ?? shortId(id)) : "—";

  const submitRun = () => {
    if (!newAgentId || !newPrompt.trim()) return;
    createRun.mutate(
      { agentId: newAgentId, projectId: newProjectId || null, prompt: newPrompt },
      {
        onSuccess: (run) => {
          setDialogOpen(false);
          setNewPrompt("");
          void navigate({ to: "/runs/$runId", params: { runId: run.id } });
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            {(agents.data ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(agentFilter || statusFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAgentFilter("");
              setStatusFilter("");
            }}
          >
            <X className="size-3.5" /> Clear
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> New run
        </Button>
      </div>

      {runs.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (runs.data ?? []).length === 0 ? (
        <div className="rounded-xl border py-16 text-center">
          <p className="text-sm font-medium">No runs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a headless agent run — output streams here live.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Turns</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs.data ?? []).map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to="/runs/$runId"
                      params={{ runId: run.id }}
                      className="hover:underline"
                    >
                      {shortId(run.id)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{agentName(run.agentId)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {projectName(run.projectId)}
                  </TableCell>
                  <TableCell>
                    <RunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{run.trigger}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {run.numTurns ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCost(run.costUsd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatDuration(run.durationMs)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(run.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New run</DialogTitle>
            <DialogDescription>
              Run an agent headlessly. Relevant memory is injected automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Agent</Label>
                <Select value={newAgentId} onValueChange={setNewAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {(agents.data ?? [])
                      .filter((a) => a.enabled)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} · {a.model}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project (optional)</Label>
                <Select value={newProjectId} onValueChange={setNewProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prompt</Label>
              <Textarea
                rows={6}
                placeholder="What should the agent do?"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
              />
            </div>
            {createRun.isError && (
              <p className="text-sm text-destructive">{createRun.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitRun}
              disabled={!newAgentId || !newPrompt.trim() || createRun.isPending}
            >
              {createRun.isPending ? "Starting…" : "Start run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
