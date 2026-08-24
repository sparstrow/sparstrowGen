import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowRight, Bot, CornerDownRight, Play, Plus, Trash2, User, Users } from "lucide-react";
import type { Task, TaskStatus } from "@sparstrow/shared";
import { BoardCard } from "@/components/board/board-card";
import { BoardColumn } from "@/components/board/board-column";
import { Badge } from "@/components/ui/badge";
import { BlockedProjectActions } from "@/components/blocked-project-actions";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { WorkLauncher } from "@web/components/work-launcher";
import { GoalCard } from "./goals/[goalId]/goal-detail";
import {
  useAgents,
  useCreateTask,
  useDeleteTask,
  useGoals,
  useProjects,
  useRunTask,
  useTasks,
  useUpdateTask,
} from "@/api/hooks";
import { formatDate, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "inbox", label: "Inbox", accent: "bg-muted-foreground" },
  { status: "todo", label: "To do", accent: "bg-info" },
  { status: "in_progress", label: "In progress", accent: "bg-warning" },
  { status: "review", label: "Review", accent: "bg-approval" },
  { status: "done", label: "Done", accent: "bg-success" },
  { status: "failed", label: "Failed", accent: "bg-destructive" },
];

const PRIORITY_LABELS = ["Low", "Normal", "High", "Urgent"] as const;

/** Child status → tree/mini-meter color (P3 delegation affordances). */
const CHILD_STATUS_STYLE: Record<string, string> = {
  done: "text-success",
  failed: "text-destructive",
  in_progress: "text-warning",
  waiting_children: "text-warning",
  pending_approval: "text-info",
  blocked: "text-warning",
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
      {done > 0 && <span className="text-success">{done}✓</span>}
      {active > 0 && <span className="text-warning">{active}▶</span>}
      {failed > 0 && <span className="text-destructive">{failed}⚠</span>}
    </Badge>
  );
}

/**
 * The Goals tab (P6): the shared launcher in Goal mode + the goal list.
 * UI states per rule 14: loading skeletons, error message, and an empty state
 * that says why it's empty and what fills it.
 */
function GoalsTab() {
  const goals = useGoals();
  const projects = useProjects();
  const projectName = (id: string | null) =>
    id ? (projects.data?.find((p) => p.id === id)?.name ?? null) : null;

  return (
    <div className="space-y-4">
      <WorkLauncher defaultMode="goal" />
      {goals.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : goals.isError ? (
        <p className="rounded-lg border py-8 text-center text-sm text-destructive">
          {goals.error.message}
        </p>
      ) : (goals.data ?? []).length === 0 ? (
        <p className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
          No goals yet — describe an outcome above and the Planner maps the steps into a live node
          graph.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(goals.data ?? []).map((g) => (
            <GoalCard key={g.id} goal={g} projectName={projectName(g.projectId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function priorityBadge(priority: number) {
  const variants = [
    "text-muted-foreground",
    "",
    "border-warning/50 text-warning",
    "border-destructive/50 text-destructive",
  ];
  return (
    <Badge variant="outline" className={cn("text-[10px]", variants[priority] ?? "")}>
      {PRIORITY_LABELS[priority] ?? `P${priority}`}
    </Badge>
  );
}

export function TasksPage({ teamId, readOnly }: { teamId?: string; readOnly?: boolean } = {}) {
  const agents = useAgents();
  const projects = useProjects();
  const tasks = useTasks({ teamId });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const runTask = useRunTask();

  const [createOpen, setCreateOpen] = React.useState(false);
  // Per-column quick-add: the + in a column header creates directly into that stage.
  const [createStatus, setCreateStatus] = React.useState<TaskStatus | null>(null);
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
        onSuccess: (task) => {
          // The server decides the initial column (inbox, or todo when
          // assigned); a column quick-add then moves it there, same as a drag.
          if (createStatus && task.status !== createStatus) {
            updateTask.mutate({ id: task.id, data: { status: createStatus } });
          }
          setCreateOpen(false);
          setCreateStatus(null);
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
  //
  // project_not_available (M4) follows the same rule, in "To do": the work still
  // needs doing, it just cannot start on that machine yet. A seventh column
  // would break the contract, and leaving it out of all six — which is what
  // happened before this line — made a parked task invisible, which is the
  // worst of the three options.
  const byStatus = (status: TaskStatus) =>
    (tasks.data ?? []).filter((t) =>
      status === "in_progress"
        ? (["in_progress", "waiting_children", "blocked_answered"] as TaskStatus[]).includes(t.status)
        : status === "todo"
          ? (["todo", "project_not_available"] as TaskStatus[]).includes(t.status)
          : t.status === status,
    );

  const childrenOf = (taskId: string) => (tasks.data ?? []).filter((t) => t.parentTaskId === taskId);
  const parentOf = (task: Task) =>
    task.parentTaskId ? (tasks.data ?? []).find((t) => t.id === task.parentTaskId) : undefined;

  // Kanban drag: a pointer-distance activation keeps plain clicks opening the
  // detail dialog; a drop onto a column (or a card in it) moves the task there.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || readOnly) return;
    const overId = String(over.id);
    let targetStatus: TaskStatus | null = null;
    if (overId.startsWith("col:")) {
      targetStatus = overId.slice(4) as TaskStatus;
    } else {
      const overTask = (tasks.data ?? []).find((t) => t.id === overId);
      if (overTask) {
        targetStatus = COLUMNS.some((c) => c.status === overTask.status)
          ? overTask.status
          : "in_progress";
      }
    }
    const task = (tasks.data ?? []).find((t) => t.id === active.id);
    if (!task || !targetStatus || task.status === targetStatus) return;
    if (!COLUMNS.some((c) => c.status === targetStatus)) return;
    updateTask.mutate({ id: task.id, data: { status: targetStatus } });
  };

  // Escalation/suspension states are machine-managed — those cards can't be
  // dragged into a different workflow stage by hand.
  const draggable = (t: Task) => !readOnly && COLUMNS.some((c) => c.status === t.status);

  // Blocked/awaiting-approval tasks are exceptional states, not workflow stages, so
  // they render as an amber attention band above the 6-column board (design H5) — the
  // board never grows a 7th column, and these never silently vanish. Full detail +
  // the answer composer live in the Dashboard attention queue.
  const needsAttention = (tasks.data ?? []).filter((t) =>
    (["blocked", "pending_approval"] as TaskStatus[]).includes(t.status),
  );

  return (
    <div className="flex h-full flex-col gap-4">
      {/* P6-Q1: Goals live INSIDE /tasks as a mode/tab — not a separate page. */}
      <Tabs defaultValue="board" className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-2">
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
          </TabsList>
          <p className="hidden text-sm text-muted-foreground lg:block">
            Assigning a task to an agent runs them with the task protocol — results land back here.
          </p>
          <div className="flex-1" />
          {!readOnly && (
            <Button
              onClick={() => {
                setCreateStatus(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" /> New task
            </Button>
          )}
        </div>

        <TabsContent value="goals" className="min-h-0 flex-1 overflow-y-auto">
          <GoalsTab />
        </TabsContent>
        <TabsContent value="board" className="flex min-h-0 flex-1 flex-col gap-4">
      {needsAttention.length > 0 && (
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm transition-colors hover:bg-warning/10"
        >
          <span className="rounded-full bg-warning px-1.5 text-xs font-semibold text-white">
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
      ) : tasks.data?.length === 0 && teamId ? (
        <div className="rounded-xl border border-dashed py-16 text-center bg-card">
          <p className="text-sm font-medium">No tasks in this team yet</p>
          {!readOnly && (
            <Button variant="link" size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
              Create the first task
            </Button>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3 xl:grid-cols-6">
            {COLUMNS.map((col) => {
              const items = byStatus(col.status);
              return (
                <BoardColumn
                  key={col.status}
                  status={col.status}
                  label={col.label}
                  accent={col.accent}
                  count={items.length}
                  itemIds={items.map((t) => t.id)}
                  onAdd={
                    !readOnly && !["done", "failed"].includes(col.status)
                      ? () => {
                          setCreateStatus(col.status);
                          setCreateOpen(true);
                        }
                      : undefined
                  }
                >
                  {items.map((task) => {
                    const kids = childrenOf(task.id);
                    const parent = parentOf(task);
                    return (
                      <BoardCard
                        key={task.id}
                        id={task.id}
                        disabled={!draggable(task)}
                        onClick={() => setSelected(task)}
                      >
                        <p className="line-clamp-2 text-xs font-medium">{task.title}</p>
                        {task.status === "waiting_children" && kids.length > 0 && (
                          <p className="mt-0.5 text-[10px] text-warning">
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
                        {/*
                          M4: the four recovery actions, on the card rather than
                          behind the detail panel. This state is not information
                          — it is a decision waiting to be made, and burying it
                          one click deeper is how a blocked task stays blocked.
                        */}
                        {task.status === "project_not_available" && (
                          <div onClick={(event) => event.stopPropagation()}>
                            <BlockedProjectActions task={task} />
                          </div>
                        )}
                      </BoardCard>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/60">
                      Drop a card here
                    </p>
                  )}
                </BoardColumn>
              );
            })}
          </div>
        </DndContext>
      )}
        </TabsContent>
      </Tabs>

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
                        <Badge variant="outline" className="border-warning/40 text-warning">
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
