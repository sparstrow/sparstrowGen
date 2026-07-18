import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Agent } from "@sparstrow/shared";
import {
  ArrowDownWideNarrow,
  Copy,
  Eye,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { ActorAvatar } from "@/components/actor-avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AgentFormDialog,
  agentToForm,
  formToPayload,
  type AgentFormValues,
} from "@/components/agent-form";
import { NewAgentButton } from "@/components/new-agent-button";
import { SkillViewer } from "@/components/skill-viewer";
import {
  useAgents,
  useCreateAgent,
  useDeleteAgent,
  useTestSpawnAgent,
  useUpdateAgent,
} from "@/api/hooks";
import { formatDate } from "@/lib/format";

export function AgentsPage() {
  const navigate = useNavigate();
  const agents = useAgents();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const testSpawn = useTestSpawnAgent();

  // Manual create dialog (F2 "Manually create" / Agent Creator handoff).
  const [manualOpen, setManualOpen] = React.useState(false);
  const [manualSeed, setManualSeed] = React.useState<AgentFormValues | null>(null);
  // SkillViewer (F1).
  const [viewer, setViewer] = React.useState<{ agent: Agent; edit: boolean } | null>(null);
  const [deleting, setDeleting] = React.useState<Agent | null>(null);

  const openManual = () => {
    setManualSeed(null);
    createAgent.reset();
    setManualOpen(true);
  };
  // Intake 0001: the Agent Creator is a dedicated full page (session-backed).
  const openCreator = () => {
    createAgent.reset();
    void navigate({ to: "/agents/create" });
  };
  const openViewer = (agent: Agent, edit = false) => {
    updateAgent.reset();
    setViewer({ agent, edit });
  };

  const duplicate = (agent: Agent) => {
    const values = agentToForm(agent);
    values.name = `${agent.name} copy`;
    createAgent.mutate(formToPayload(values));
  };

  // Keep the open SkillViewer pointed at fresh data after a save.
  const viewerAgent = viewer
    ? ((agents.data ?? []).find((a) => a.id === viewer.agent.id) ?? viewer.agent)
    : null;

  const manualError =
    createAgent.error != null ? (createAgent.error as Error).message : null;
  const saveError = updateAgent.error != null ? (updateAgent.error as Error).message : null;

  // Multica-style toolbar: free-text search + segmented count filter + sort.
  const [query, setQuery] = React.useState("");
  const [segment, setSegment] = React.useState<"all" | "enabled" | "disabled">("all");
  const [sortByName, setSortByName] = React.useState(false);

  const all = agents.data ?? [];
  const enabledCount = all.filter((a) => a.enabled).length;
  const segments = [
    { key: "all" as const, label: "All", count: all.length },
    { key: "enabled" as const, label: "Enabled", count: enabledCount },
    { key: "disabled" as const, label: "Disabled", count: all.length - enabledCount },
  ];
  const q = query.trim().toLowerCase();
  const visible = all
    .filter((a) => (segment === "all" ? true : segment === "enabled" ? a.enabled : !a.enabled))
    .filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        (a.role ?? "").toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.provider.toLowerCase().includes(q),
    )
    .sort((a, b) =>
      sortByName ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="h-9 w-52 pl-8"
            aria-label="Search agents"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          {segments.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                segment === s.key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              <span className="tabular-nums text-muted-foreground">{s.count}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setSortByName((v) => !v)}
          title="Toggle sort order"
        >
          <ArrowDownWideNarrow className="size-3.5" />
          {sortByName ? "Name" : "Last active"}
        </Button>
        <NewAgentButton onManual={openManual} onCreator={openCreator} />
      </div>

      {agents.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (agents.data ?? []).length === 0 ? (
        <div className="rounded-xl border py-16 text-center">
          <p className="text-sm font-medium">No agents yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first agent to start running tasks with Claude Code.
          </p>
          <div className="mt-4 flex justify-center">
            <NewAgentButton onManual={openManual} onCreator={openCreator} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table className="[&_td]:py-2">
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No agents match{q ? ` “${query.trim()}”` : " this filter"}.
                  </TableCell>
                </TableRow>
              ) : (
              visible.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <button
                      className="flex items-center gap-2.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openViewer(agent)}
                    >
                      <span className="relative">
                        <ActorAvatar name={agent.name} size="md" />
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
                            agent.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                          )}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium hover:underline">
                            {agent.name}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {agent.provider}
                          </Badge>
                        </span>
                        <span className="block max-w-64 truncate text-xs text-muted-foreground">
                          {agent.role || "No role description"}
                        </span>
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        agent.enabled
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          agent.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                      {agent.enabled ? "Ready" : "Disabled"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{agent.model}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {agent.permissionMode}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={agent.enabled}
                      onCheckedChange={(enabled) =>
                        updateAgent.mutate({ id: agent.id, data: { enabled } })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(agent.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openViewer(agent)}>
                          <Eye /> View agent
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openViewer(agent, true)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => duplicate(agent)}>
                          <Copy /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            testSpawn.mutate(agent.id, {
                              onSuccess: (run) =>
                                void navigate({
                                  to: "/runs/$runId",
                                  params: { runId: run.id },
                                }),
                            })
                          }
                        >
                          <FlaskConical /> Test spawn
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleting(agent)}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <SkillViewer
        agent={viewerAgent}
        open={viewer != null}
        startInEdit={viewer?.edit ?? false}
        onOpenChange={(open) => !open && setViewer(null)}
        saving={updateAgent.isPending}
        saveError={saveError}
        onSave={(payload) =>
          viewer &&
          updateAgent.mutate({ id: viewer.agent.id, data: payload })
        }
      />

      <AgentFormDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        seed={manualSeed}
        pending={createAgent.isPending}
        error={manualError}
        onSubmit={(payload) =>
          createAgent.mutate(payload, { onSuccess: () => setManualOpen(false) })
        }
      />

      <Dialog open={deleting != null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              The agent definition and its generated SKILL.md are removed. Its memory notes in the
              vault are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteAgent.isPending}
              onClick={() =>
                deleting &&
                deleteAgent.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
