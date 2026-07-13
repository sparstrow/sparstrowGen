import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Agent } from "@sparstrow/shared";
import { Copy, Eye, FlaskConical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Agents wrap a CLI model with a role, access rules, and memory scopes.
        </p>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(agents.data ?? []).map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium">
                    <button
                      className="rounded text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openViewer(agent)}
                    >
                      {agent.name}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {agent.role || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{agent.provider}</Badge>
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
              ))}
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
