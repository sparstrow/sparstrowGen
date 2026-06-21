import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Agent } from "@sparstrow/shared";
import { FlaskConical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { AgentFormDialog } from "@/components/agent-form";
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

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Agent | null>(null);
  const [deleting, setDeleting] = React.useState<Agent | null>(null);

  const openCreate = () => {
    setEditing(null);
    createAgent.reset();
    updateAgent.reset();
    setFormOpen(true);
  };
  const openEdit = (agent: Agent) => {
    setEditing(agent);
    createAgent.reset();
    updateAgent.reset();
    setFormOpen(true);
  };

  const mutationError =
    (createAgent.error ?? updateAgent.error) != null
      ? ((createAgent.error ?? updateAgent.error) as Error).message
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Agents wrap a CLI model with a role, access rules, and memory scopes.
        </p>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New agent
        </Button>
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
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="size-4" /> New agent
          </Button>
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
                  <TableCell className="font-medium">{agent.name}</TableCell>
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
                        <DropdownMenuItem onSelect={() => openEdit(agent)}>
                          <Pencil /> Edit
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

      <AgentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        pending={createAgent.isPending || updateAgent.isPending}
        error={mutationError}
        onSubmit={(payload) => {
          if (editing) {
            updateAgent.mutate(
              { id: editing.id, data: payload },
              { onSuccess: () => setFormOpen(false) },
            );
          } else {
            createAgent.mutate(payload, { onSuccess: () => setFormOpen(false) });
          }
        }}
      />

      <Dialog open={deleting != null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              The agent definition is removed. Its memory notes in the vault are kept.
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
