import { Link } from "@tanstack/react-router";
import { Activity, Bot, FolderKanban, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RunStatusBadge } from "@/components/run-status-badge";
import { AttentionQueue } from "@/components/attention-queue";
import { PrQueueCard } from "@/components/pr-queue";
import { useAgents, useHealth, useProjects, useRuns } from "@/api/hooks";
import { formatCost, formatDate, formatDuration } from "@/lib/format";

export function DashboardPage() {
  const health = useHealth();
  const agents = useAgents();
  const projects = useProjects();
  const runs = useRuns({ limit: 50 });

  const activeRuns = (runs.data ?? []).filter(
    (r) => r.status === "running" || r.status === "queued",
  );
  const recentRuns = (runs.data ?? []).slice(0, 10);
  const agentName = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      {/* The founder's #1 daily surface: blocked agents + reviews come first (design C1). */}
      <AttentionQueue />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">System</CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            {health.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : health.data ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={health.data.ok ? "success" : "destructive"}>
                    {health.data.ok ? "healthy" : "degraded"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">v{health.data.version}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  search: fts {health.data.search.fts ? "✓" : "✗"} · vec{" "}
                  {health.data.search.vec ? "✓" : "✗"}
                </p>
              </>
            ) : (
              <Badge variant="destructive">core offline</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Providers</CardTitle>
            <Bot className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            {(health.data?.providers ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <span className="text-sm">{p.id}</span>
                <Badge variant={p.ok ? "success" : "destructive"}>
                  {p.ok ? (p.version ?? "ok") : "unavailable"}
                </Badge>
              </div>
            ))}
            {health.isLoading && <Skeleton className="h-6 w-full" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Workspace</CardTitle>
            <FolderKanban className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-semibold">{agents.data?.length ?? "—"}</p>
                <p className="text-xs text-muted-foreground">agents</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{projects.data?.length ?? "—"}</p>
                <p className="text-xs text-muted-foreground">projects</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{activeRuns.length}</p>
                <p className="text-xs text-muted-foreground">active runs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Memory vault</CardTitle>
            <HardDrive className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {health.data?.vault.path ?? "…"}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Open this folder as a vault in Obsidian.
            </p>
          </CardContent>
        </Card>
      </div>

      {activeRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeRuns.map((run) => (
              <Link
                key={run.id}
                to="/runs/$runId"
                params={{ runId: run.id }}
                className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <RunStatusBadge status={run.status} />
                  <span className="text-sm font-medium">{agentName(run.agentId)}</span>
                  <span className="max-w-md truncate text-xs text-muted-foreground">
                    {run.prompt}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* The founder's #2 morning surface: open PRs across every project (design §6). */}
      <PrQueueCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : recentRuns.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No runs yet. Create an agent, then start a run from the Runs page.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRuns.map((run) => (
                  <TableRow key={run.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: run.id }}
                        className="font-medium hover:underline"
                      >
                        {agentName(run.agentId)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <RunStatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{run.trigger}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDuration(run.durationMs)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCost(run.costUsd)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(run.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
