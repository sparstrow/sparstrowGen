import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, X } from "lucide-react";
import type { Run, RunStatus } from "@sparstrow/shared";
import { Input } from "@/components/ui/input";
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
import { RunStatusBadge } from "@web/components/run-status-badge";
import { useAgents, useCreateRun, useProjects, useRuns } from "@web/api/hooks";
import { formatCost, formatDate, formatDuration, shortId } from "@/lib/format";

const STATUSES: RunStatus[] = ["queued", "running", "succeeded", "failed", "cancelled", "timeout"];

type SortKey = "createdAt" | "numTurns" | "costUsd" | "durationMs";

function SortHeader({
  label,
  col,
  sort,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === col;
  const Icon = !active ? ArrowUpDown : sort.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={
        "inline-flex items-center gap-1 transition-colors hover:text-foreground " +
        (active ? "text-foreground " : "") +
        (className ?? "")
      }
    >
      {label} <Icon className="size-3" />
    </button>
  );
}

export function RunsPage() {
  const router = useRouter();
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

  // Dense-grid affordances: free-text filter + client-side column sorting.
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "createdAt",
    dir: "desc",
  });
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const visibleRuns = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (runs.data ?? []).filter(
      (r) =>
        !q ||
        r.id.toLowerCase().includes(q) ||
        agentName(r.agentId).toLowerCase().includes(q) ||
        projectName(r.projectId).toLowerCase().includes(q) ||
        r.trigger.toLowerCase().includes(q),
    );
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "createdAt") return a.createdAt.localeCompare(b.createdAt) * dir;
      const av = (a[sort.key] as number | null) ?? -1;
      const bv = (b[sort.key] as number | null) ?? -1;
      return (av - bv) * dir;
    });
  }, [runs.data, query, sort, agents.data, projects.data]);

  const submitRun = () => {
    if (!newAgentId || !newPrompt.trim()) return;
    createRun.mutate(
      { agentId: newAgentId, projectId: newProjectId || null, prompt: newPrompt },
      {
        onSuccess: (run) => {
          setDialogOpen(false);
          setNewPrompt("");
          void router.push(`/runs/${run.id}`);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter runs…"
            className="h-9 w-48 pl-8"
            aria-label="Filter runs"
          />
        </div>
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
        <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded-xl border">
          <Table className="[&_td]:px-3 [&_td]:py-1.5 [&_th]:h-8 [&_th]:px-3">
            <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">
                  <SortHeader label="Turns" col="numTurns" sort={sort} onSort={onSort} />
                </TableHead>
                <TableHead className="text-right">
                  <SortHeader label="Cost" col="costUsd" sort={sort} onSort={onSort} />
                </TableHead>
                <TableHead className="text-right">
                  <SortHeader label="Duration" col="durationMs" sort={sort} onSort={onSort} />
                </TableHead>
                <TableHead>
                  <SortHeader label="Created" col="createdAt" sort={sort} onSort={onSort} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    No runs match “{query}”.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRuns.map((run: Run) => (
                  <TableRow key={run.id} className="text-xs">
                    <TableCell className="font-mono">
                      <Link
                        href={`/runs/${run.id}`}
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
                ))
              )}
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
