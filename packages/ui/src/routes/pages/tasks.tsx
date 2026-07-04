import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, CornerDownRight, Play, Plus, Trash2, User, Users } from "lucide-react";
import type { Task, TaskStatus } from "@sparstrow/shared";
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
import { Textarea } from "@/components/ui/textarea";
import {
  useAgents,
  useCreateTask,
  useDeleteTask,
  useProjects,
  useRunTask,
  useTasks,
  useUpdateTask,
} from "@/api/hooks";
import { formatDate, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "inbox", label: "Inbox", accent: "bg-slate-400" },
  { status: "todo", label: "To do", accent: "bg-sky-500" },
  { status: "in_progress", label: "In progress", accent: "bg-amber-500" },
  { status: "review", label: "Review", accent: "bg-violet-500" },
  { status: "done", label: "Done", accent: "bg-emerald-500" },
  { status: "failed", label: "Failed", accent: "bg-red-500" },
];

const PRIORITY_LABELS = ["Low", "Normal", "High", "Urgent"] as const;

/** Child status → tree/mini-meter color (P3 delegation affordances). */
const CHILD_STATUS_STYLE: Record<string, string> = {
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
  in_progress: "text-amber-600 dark:text-amber-400",
  waiting_children: "text-amber-600 dark:text-amber-400",
  pending_approval: "text-sky-600 dark:text-sky-400",
  blocked: "text-amber-600 dark:text-amber-400",
};

/** "3 · 1✓ 1▶ 1⚠" — a parent card's children at a glance (design contract). */
function ChildrenMeter({ children }: { children: Task[] }) {
  const done = children.filter((c) => c.status === "done").length;
  const failed = children.filter((c) => c.status === "failed").length;
  const active = children.length - done - failed;
  return (
    <Badge variant="outline" className="gap-1 text-[10px] tabular-nums" title={`${children.length} subtasks: ${done} done, ${active} active, ${failed} failed`}>
      <CornerDownRight className="size-2.5" />
      {children.length}
      {done > 0 && <span className="text-emerald-600 dark:text-emerald-400">{done}✓</span>}
      {active > 0 && <span className="text-amber-600 dark:text-amber-400">{active}▶</span>}
      {failed > 0 && <span className="text-red-600 dark:text-red-400">{failed}⚠</span>}
    </Badge>
  );
}

function priorityBadge(priority: number) {
  const variants = [
    "text-muted-foreground",
    "",
    "border-amber-500/50 text-amber-600 dark:text-amber-400",
    "border-red-500/50 text-red-600 dark:text-red-400",
  ];
  return (
    <Badge variant="outline" className={cn("text-[10px]", variants[priority] ?? "")}>
      {PRIORITY_LABELS[priority] ?? `P${priority}`}
    </Badge>
  );
}

export function TasksPage() {
  const agents = useAgents();
  const projects = useProjects();
  const tasks = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const runTask = useRunTask();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Task | null>(null);

  const [newTitle, setNewTitle] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  // P3: multiple assignees form an ephemeral team (a swarm) around the task.
  const [newAgentIds, setNewAgentIds] = React.useState<string[]>([]);
  const [newProjectId, setNewProjectId] = React.useState("");
  const [newPriority, setNewPriority] = React.useState("1");

  const agentName = (id: string | null) =>
    id ? (agents.data?.find((a) => a.id === id)?.name ?? shortId(id)) : null;
  const projectName = (id: string | null) =>
    id ? (projects.data?.find((p) => p.id === id)?.name ?? shortId(id)) : null;

  // Keep the detail sheet in sync when WS invalidation refreshes the list.
  React.useEffect(() => {
    if (!selected || !tasks.data) return;
    const fresh = tasks.data.find((t) => t.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [tasks.data, selected]);

  const submitTask = () => {
    if (!newTitle.trim()) return;
    createTask.mutate(
      {
        title: newTitle.trim(),
        description: newDescription,
        // One agent = plain assignment; two or more = ephemeral swarm (P3).
        assignedAgentId: newAgentIds.length === 1 ? newAgentIds[0] : null,
        assignedAgentIds: newAgentIds.length > 1 ? newAgentIds : undefined,
        projectId: newProjectId || null,
        priority: Number(newPriority),
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setNewTitle("");
          setNewDescription("");
          setNewAgentIds([]);
          setNewPriority("1");
        },
      },
    );
  };

  // waiting_children (a suspended lead) and blocked_answered (wake in flight) are
  // working states, not workflow stages — they render inside "In progress" with
  // their own whisper rather than growing the board (design contract: 6 columns).
  const byStatus = (status: TaskStatus) =>
    (tasks.data ?? []).filter((t) =>
      status === "in_progress"
        ? (["in_progress", "waiting_children", "blocked_answered"] as TaskStatus[]).includes(t.status)
        : t.status === status,
    );

  const childrenOf = (taskId: string) => (tasks.data ?? []).filter((t) => t.parentTaskId === taskId);
  const parentOf = (task: Task) =>
    task.parentTaskId ? (tasks.data ?? []).find((t) => t.id === task.parentTaskId) : undefined;

  // Blocked/awaiting-approval tasks are exceptional states, not workflow stages, so
  // they render as an amber attention band above the 6-column board (design H5) — the
  // board never grows a 7th column, and these never silently vanish. Full detail +
  // the answer composer live in the Dashboard attention queue.
  const needsAttention = (tasks.data ?? []).filter((t) =>
    (["blocked", "pending_approval"] as TaskStatus[]).includes(t.status),
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Assigning a task to an agent runs them with the task protocol — results land back here.
        </p>
        <div className="flex-1" />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New task
        </Button>
      </div>

      {needsAttention.length > 0 && (
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm transition-colors hover:bg-amber-500/10"
        >
          <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
            {needsAttention.length}
          </span>
          <span className="font-medium">
            {needsAttention.length === 1 ? "1 task needs" : `${needsAttention.length} tasks need`} your attention
          </span>
          <span className="text-muted-foreground">— answer on the Dashboard →</span>
        </Link>
      )}

      {tasks.isLoading ? (
        <div className="grid grid-cols-6 gap-3">
          {COLUMNS.map((c) => (
            <Skeleton key={c.status} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map((col) => {
            const items = byStatus(col.status);
            return (
              <div key={col.status} className="flex min-h-48 flex-col rounded-xl border bg-muted/30">
                <div className="flex items-center gap-2 border-b px-3 py-2.5">
                  <span className={cn("size-2 rounded-full", col.accent)} />
                  <span className="text-xs font-semibold">{col.label}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {items.map((task) => {
                    const kids = childrenOf(task.id);
                    const parent = parentOf(task);
                    return (
                      <button
                        key={task.id}
                        onClick={() => setSelected(task)}
                        className="rounded-lg border bg-background p-2.5 text-left shadow-sm transition-colors hover:border-primary/40"
                      >
                        <p className="line-clamp-2 text-xs font-medium">{task.title}</p>
                        {task.status === "waiting_children" && kids.length > 0 && (
                          <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                            waiting on {kids.filter((k) => !["done", "failed"].includes(k.status)).length} subtask(s)
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {priorityBadge(task.priority)}
                          {/* P3 delegation affordances: parent chip on children, mini-meter on parents. */}
                          {parent && (
                            <Badge variant="outline" className="max-w-32 gap-1 text-[10px] text-muted-foreground" title={`subtask of: ${parent.title}`}>
                              <CornerDownRight className="size-2.5 shrink-0" />
                              <span className="truncate">{parent.title}</span>
                            </Badge>
                          )}
                          {kids.length > 0 && <ChildrenMeter children={kids} />}
                          {task.assignedAgentId && (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <Bot className="size-2.5" />
                              {agentName(task.assignedAgentId)}
                            </Badge>
                          )}
                          {task.createdByType === "agent" && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              by {agentName(task.createdByAgentId) ?? "agent"}
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/60">
                      Empty
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>
              Assign it to an agent to run them immediately; leave unassigned to triage later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What needs doing?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={5}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="The assignee runs with only this text — include everything they need."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <div className="flex flex-wrap gap-1.5">
                {(agents.data ?? [])
                  .filter((a) => a.enabled)
                  .map((a) => {
                    const on = newAgentIds.includes(a.id);
                    return (
                      <Button
                        key={a.id}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        onClick={() =>
                          setNewAgentIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]))
                        }
                      >
                        <Bot className="size-3" /> {a.name}
                      </Button>
                    );
                  })}
              </div>
              <p className="text-xs text-muted-foreground">
                {newAgentIds.length === 0 && "None selected — the task lands in the inbox for later triage."}
                {newAgentIds.length === 1 && "One agent — runs immediately with the task protocol."}
                {newAgentIds.length > 1 && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" />
                    {newAgentIds.length} agents — an ephemeral team forms around this task; each gets a subtask and results are aggregated for your review.
                  </span>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={newProjectId} onValueChange={setNewProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
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
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_LABELS.map((label, i) => (
                      <SelectItem key={label} value={String(i)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {createTask.isError && (
              <p className="text-sm text-destructive">{createTask.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitTask} disabled={!newTitle.trim() || createTask.isPending}>
              {createTask.isPending ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{selected.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{selected.id}</span>
                  {priorityBadge(selected.priority)}
                  {selected.createdByType === "user" ? (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <User className="size-2.5" /> created by you
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Bot className="size-2.5" /> by {agentName(selected.createdByAgentId) ?? "agent"}
                    </Badge>
                  )}
                  {projectName(selected.projectId) && (
                    <Badge variant="outline" className="text-[10px]">
                      {projectName(selected.projectId)}
                    </Badge>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {selected.description && (
                  <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
                    {selected.description}
                  </p>
                )}

                {/* P3: delegation context — parent link + the children tree
                    (an indented status-colored list, deliberately NOT a canvas). */}
                {parentOf(selected) && (
                  <button
                    className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    onClick={() => setSelected(parentOf(selected)!)}
                  >
                    <CornerDownRight className="size-3.5 rotate-180 text-muted-foreground" />
                    <span className="text-muted-foreground">subtask of</span>
                    <span className="truncate font-medium">{parentOf(selected)!.title}</span>
                  </button>
                )}
                {childrenOf(selected.id).length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Subtasks</Label>
                    <div className="rounded-lg border">
                      {childrenOf(selected.id).map((child) => (
                        <button
                          key={child.id}
                          className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent"
                          onClick={() => setSelected(child)}
                        >
                          <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{child.title}</span>
                          {child.assignedAgentId && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {agentName(child.assignedAgentId)}
                            </span>
                          )}
                          <span className={cn("shrink-0 text-xs font-medium", CHILD_STATUS_STYLE[child.status] ?? "text-muted-foreground")}>
                            {child.status.replace(/_/g, " ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    {/* Escalation states are machine-managed — surface them read-only
                        instead of a Select the owner could desync. */}
                    {!COLUMNS.some((c) => c.status === selected.status) ? (
                      <div className="flex h-9 items-center rounded-md border px-3">
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                          {selected.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    ) : (
                      <Select
                        value={selected.status}
                        onValueChange={(status) =>
                          updateTask.mutate({
                            id: selected.id,
                            data: { status: status as TaskStatus },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLUMNS.map((c) => (
                            <SelectItem key={c.status} value={c.status}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assignee</Label>
                    <Select
                      value={selected.assignedAgentId ?? ""}
                      onValueChange={(agentId) =>
                        updateTask.mutate({ id: selected.id, data: { assignedAgentId: agentId } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
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
                  </div>
                </div>

                {selected.result && (
                  <div className="space-y-1.5">
                    <Label>Result</Label>
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
                      {selected.result}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Created {formatDate(selected.createdAt)}</span>
                  <span>·</span>
                  <span>Updated {formatDate(selected.updatedAt)}</span>
                  {selected.runId && (
                    <>
                      <span>·</span>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: selected.runId }}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        onClick={() => setSelected(null)}
                      >
                        View run <ArrowRight className="size-3" />
                      </Link>
                    </>
                  )}
                </div>

                {(updateTask.isError || runTask.isError) && (
                  <p className="text-sm text-destructive">
                    {updateTask.error?.message ?? runTask.error?.message}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    deleteTask.mutate(selected.id);
                    setSelected(null);
                  }}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
                {selected.assignedAgentId &&
                  ["inbox", "todo", "failed", "review"].includes(selected.status) && (
                    <Button
                      size="sm"
                      onClick={() => runTask.mutate(selected.id)}
                      disabled={runTask.isPending}
                    >
                      <Play className="size-3.5" />
                      {runTask.isPending ? "Starting…" : "Run with assignee"}
                    </Button>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
