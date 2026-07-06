import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  FileText,
  Folder,
  GitBranch,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useAgents,
  useCreateDirective,
  useCreateTask,
  useCreateVariant,
  useDeleteDirective,
  useProject,
  useProjectBriefing,
  useProjectDirectives,
  useProjectFiles,
  useProjectGitState,
  useProjectGraph,
  useProjectVariants,
  useProjects,
  useGraphEngine,
  useReindexProject,
  useSetBriefing,
  useSyncFromBase,
  useTasks,
  useUpdateDirective,
  type DirEntry,
} from "@/api/hooks";
import { useMemoryNotes } from "@/api/hooks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProjectWorkspacePage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const project = useProject(projectId);
  const projects = useProjects();
  const git = useProjectGitState(projectId);

  if (project.isLoading) {
    return <Skeleton className="mx-auto mt-10 h-96 w-full max-w-5xl" />;
  }
  if (!project.data) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Link to="/projects" className="text-sm text-primary hover:underline">
          ← Projects
        </Link>
        <p className="mt-6 text-sm text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const p = project.data;
  const parent = p.parentProjectId
    ? (projects.data ?? []).find((x) => x.id === p.parentProjectId)
    : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projects
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
          <GitBadge state={git.data} loading={git.isLoading} />
          {p.isSandbox && (
            <Badge variant="outline" className="border-sky-500/40 text-sky-600 dark:text-sky-400" title="Sandbox: memory writes are isolated to this project.">
              sandbox
            </Badge>
          )}
          {parent && (
            <Link
              to="/projects/$projectId"
              params={{ projectId: parent.id }}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              title="Client variant of"
            >
              variant of {parent.name}
            </Link>
          )}
        </div>
        {p.rootDir && <p className="break-all font-mono text-xs text-muted-foreground">{p.rootDir}</p>}
        {p.description && <p className="max-w-3xl text-sm text-muted-foreground">{p.description}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Main stage */}
        <div className="space-y-6">
          <TaskLauncher projectId={projectId} />
          <ActivityFeed projectId={projectId} />
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <Tabs defaultValue="directives">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="directives">Rules</TabsTrigger>
              <TabsTrigger value="memory">Memory</TabsTrigger>
              <TabsTrigger value="scheduled">Schedule</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
            <TabsContent value="directives">
              <DirectivesPanel projectId={projectId} />
            </TabsContent>
            <TabsContent value="memory">
              <MemoryPanel projectSlug={p.slug} />
            </TabsContent>
            <TabsContent value="scheduled">
              <SchedulePanel projectId={projectId} />
            </TabsContent>
            <TabsContent value="files">
              <FilesPanel projectId={projectId} hasRoot={Boolean(p.rootDir)} />
            </TabsContent>
          </Tabs>
          <VariantsPanel
            projectId={projectId}
            isVariant={Boolean(p.parentProjectId)}
            isSandbox={p.isSandbox}
          />
          <CodeGraphPanel projectId={projectId} isSandbox={p.isSandbox} hasRoot={Boolean(p.rootDir)} />
        </div>
      </div>
    </div>
  );
}

function GitBadge({ state, loading }: { state?: ReturnType<typeof useProjectGitState>["data"]; loading: boolean }) {
  if (loading) return <Skeleton className="h-5 w-20" />;
  if (!state) return null;
  if (!state.available) return <Badge variant="outline" className="text-muted-foreground">git n/a</Badge>;
  if (!state.isRepo) return <Badge variant="outline" className="text-muted-foreground">not a repo</Badge>;
  return (
    <Badge variant="outline" className="gap-1" title={`${state.changedFiles} changed file(s)`}>
      <GitBranch className="size-3" />
      {state.branch ?? "detached"}
      {state.dirty && <span className="text-amber-600 dark:text-amber-400">●</span>}
      {state.ahead > 0 && <span className="text-muted-foreground">↑{state.ahead}</span>}
      {state.behind > 0 && <span className="text-muted-foreground">↓{state.behind}</span>}
    </Badge>
  );
}

function TaskLauncher({ projectId }: { projectId: string }) {
  const agents = useAgents();
  const createTask = useCreateTask();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [agentIds, setAgentIds] = React.useState<string[]>([]);

  const launch = () => {
    if (!title.trim()) return;
    createTask.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        projectId,
        assignedAgentId: agentIds.length === 1 ? agentIds[0] : null,
        assignedAgentIds: agentIds.length > 1 ? agentIds : undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setAgentIds([]);
        },
      },
    );
  };

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">What would you like to work on in this project?</p>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Describe a task…" />
      <Textarea
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Details for the agent (optional)…"
      />
      <div className="flex flex-wrap gap-1.5">
        {(agents.data ?? [])
          .filter((a) => a.enabled)
          .map((a) => {
            const on = agentIds.includes(a.id);
            return (
              <Button
                key={a.id}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() => setAgentIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}
              >
                <Bot className="size-3" /> {a.name}
              </Button>
            );
          })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {agentIds.length === 0 && "Unassigned → lands in the inbox."}
          {agentIds.length === 1 && "Runs immediately."}
          {agentIds.length > 1 && `${agentIds.length} agents → ephemeral swarm.`}
        </span>
        <Button size="sm" disabled={!title.trim() || createTask.isPending} onClick={launch}>
          {createTask.isPending ? "Launching…" : "Launch task"}
        </Button>
      </div>
      {createTask.isError && <p className="text-xs text-destructive">{createTask.error.message}</p>}
    </div>
  );
}

function ActivityFeed({ projectId }: { projectId: string }) {
  const tasks = useTasks({ projectId });
  const rows = (tasks.data ?? []).slice(0, 15);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Recent activity</p>
      {tasks.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border py-8 text-center text-xs text-muted-foreground">
          No tasks yet — launch one above.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((t) => (
            <Link
              key={t.id}
              to="/tasks"
              className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {t.status.replace(/_/g, " ")}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(t.updatedAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function DirectivesPanel({ projectId }: { projectId: string }) {
  const directives = useProjectDirectives(projectId);
  const create = useCreateDirective();
  const update = useUpdateDirective();
  const remove = useDeleteDirective();
  const [draft, setDraft] = React.useState("");

  const add = () => {
    if (!draft.trim()) return;
    create.mutate({ projectId, data: { body: draft.trim() } }, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">
        Always-injected project rules — every run in this project follows them.
      </p>
      {(directives.data ?? []).map((d) => (
        <div key={d.id} className="flex items-start gap-2 rounded-md border p-2">
          <Switch
            checked={d.enabled}
            onCheckedChange={(enabled) => update.mutate({ projectId, id: d.id, data: { enabled } })}
            className="mt-0.5"
          />
          <span className={cn("flex-1 text-xs", !d.enabled && "text-muted-foreground line-through")}>{d.body}</span>
          <button
            className="text-muted-foreground hover:text-destructive"
            onClick={() => remove.mutate({ projectId, id: d.id })}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a rule…"
          className="text-xs"
        />
        <Button size="sm" variant="outline" disabled={!draft.trim() || create.isPending} onClick={add}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function MemoryPanel({ projectSlug }: { projectSlug: string }) {
  const notes = useMemoryNotes({ scope: "project", projectSlug });
  const rows = notes.data ?? [];
  return (
    <div className="space-y-2 rounded-xl border p-3">
      {notes.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No project memory yet. Auto-index runs on creation (summary notes + code graph); “Reindex” refreshes both.
        </p>
      ) : (
        rows.map((n) => (
          <Link
            key={n.id}
            to="/memory"
            className="flex items-center gap-2 rounded-md px-1 py-1.5 text-xs transition-colors hover:bg-accent"
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{n.title}</span>
          </Link>
        ))
      )}
    </div>
  );
}

function SchedulePanel({ projectId }: { projectId: string }) {
  const briefing = useProjectBriefing(projectId);
  const setBriefing = useSetBriefing();
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Morning briefing</p>
          <p className="text-xs text-muted-foreground">Daily project status from the Project Reporter.</p>
        </div>
        <Switch
          checked={briefing.data?.enabled ?? false}
          disabled={setBriefing.isPending}
          onCheckedChange={(enabled) => setBriefing.mutate({ projectId, enabled })}
        />
      </div>
      {briefing.data?.enabled && briefing.data.cronExpr && (
        <p className="font-mono text-[11px] text-muted-foreground">schedule: {briefing.data.cronExpr}</p>
      )}
    </div>
  );
}

function FilesPanel({ projectId, hasRoot }: { projectId: string; hasRoot: boolean }) {
  if (!hasRoot) {
    return (
      <div className="rounded-xl border p-3">
        <p className="py-6 text-center text-xs text-muted-foreground">
          Bind a root directory to browse files.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border p-2 text-xs">
      <FileTree projectId={projectId} subpath="" depth={0} />
    </div>
  );
}

function FileTree({ projectId, subpath, depth }: { projectId: string; subpath: string; depth: number }) {
  const listing = useProjectFiles(projectId, subpath);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  if (listing.isLoading) return <Skeleton className="my-1 h-4 w-full" />;
  if (listing.isError) return <p className="px-2 py-1 text-destructive">{listing.error.message}</p>;
  return (
    <div>
      {(listing.data?.entries ?? []).map((entry: DirEntry) => {
        const childPath = subpath ? `${subpath}/${entry.name}` : entry.name;
        const isOpen = open.has(entry.name);
        return (
          <div key={entry.name}>
            <button
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent"
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              onClick={() =>
                entry.type === "dir" &&
                setOpen((s) => {
                  const n = new Set(s);
                  n.has(entry.name) ? n.delete(entry.name) : n.add(entry.name);
                  return n;
                })
              }
            >
              {entry.type === "dir" ? (
                <>
                  <ChevronRight className={cn("size-3 shrink-0 transition-transform", isOpen && "rotate-90")} />
                  <Folder className="size-3.5 shrink-0 text-sky-500" />
                </>
              ) : (
                <FileText className="ml-3 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
            {entry.type === "dir" && isOpen && (
              <FileTree projectId={projectId} subpath={childPath} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * P5: per-project code-graph state (design F3: standalone sidebar panel, not a
 * Memory-tab section — the graph is NOT memory notes; F4: per-project state
 * lives HERE, Settings shows engine-level only). Header badge is visible
 * without expanding anything (F11); all feedback is inline text (F8 — no
 * toast system exists). Cold-start states per F1.
 */
function CodeGraphPanel({
  projectId,
  isSandbox,
  hasRoot,
}: {
  projectId: string;
  isSandbox: boolean;
  hasRoot: boolean;
}) {
  const engine = useGraphEngine();
  const graph = useProjectGraph(projectId);
  const reindex = useReindexProject();

  const engineInstalled = engine.data?.installed ?? false;
  const s = graph.data;
  const badge = !engineInstalled
    ? { variant: "outline" as const, label: "engine not installed" }
    : !s || s.state === "none"
      ? { variant: "outline" as const, label: "no graph" }
      : s.state === "ready"
        ? { variant: "success" as const, label: "ready" }
        : s.state === "failed"
          ? { variant: "destructive" as const, label: "failed" }
          : s.state === "stale"
            ? { variant: "warning" as const, label: "stale" }
            : { variant: "secondary" as const, label: s.state === "queued" ? "queued" : "indexing…" };

  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Code graph</p>
        {engine.isLoading || graph.isLoading ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          <Badge variant={badge.variant}>{badge.label}</Badge>
        )}
      </div>

      {!engineInstalled ? (
        <p className="text-xs text-muted-foreground">
          Graph engine not installed —{" "}
          <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
            install it in Settings
          </Link>{" "}
          to give agents structure-aware code search.
        </p>
      ) : !hasRoot ? (
        <p className="text-xs text-muted-foreground">Bind a root directory to build a code graph.</p>
      ) : (
        <div className="space-y-2">
          {s?.state === "ready" && (
            <p className="font-mono text-[11px] text-muted-foreground">
              {(s.nodes ?? 0).toLocaleString()} nodes · {(s.edges ?? 0).toLocaleString()} edges
              {s.indexedAt ? ` · indexed ${formatDate(s.indexedAt)}` : ""}
            </p>
          )}
          {(s?.state === "queued" || s?.state === "indexing") && (
            <p className="text-xs text-muted-foreground">
              Indexing… agents fall back to file search until it finishes.
            </p>
          )}
          {s?.state === "failed" && (
            <p className="text-xs text-destructive">{s.detail ?? "Index failed."}</p>
          )}
          {(s?.state === "none" || s?.state === "stale" || s?.state === "failed") && (
            <p className="text-xs text-muted-foreground">
              {s?.state === "stale"
                ? "Engine was updated — Reindex to rebuild the graph."
                : s?.state === "failed"
                  ? "Reindex to retry."
                  : isSandbox
                    ? "Sandboxes index only when you click Reindex (untrusted code is never parsed automatically)."
                    : "No graph yet — Reindex to build it (also queued nightly)."}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={reindex.isPending || s?.state === "queued" || s?.state === "indexing"}
            onClick={() => reindex.mutate(projectId)}
          >
            <RefreshCw className="size-3.5" />{" "}
            {s?.state === "queued" || s?.state === "indexing" ? "Indexing…" : "Reindex"}
          </Button>
          {reindex.isSuccess && reindex.data.graph !== "queued" && (
            <p className="text-xs text-muted-foreground">Graph pass skipped: {reindex.data.graph}.</p>
          )}
          {reindex.isError && <p className="text-xs text-destructive">{reindex.error.message}</p>}
        </div>
      )}
    </div>
  );
}

function VariantsPanel({
  projectId,
  isVariant,
  isSandbox,
}: {
  projectId: string;
  isVariant: boolean;
  isSandbox: boolean;
}) {
  const variants = useProjectVariants(projectId);
  const sync = useSyncFromBase();
  const createVariant = useCreateVariant();
  const [forking, setForking] = React.useState(false);
  const [vName, setVName] = React.useState("");
  const [vRoot, setVRoot] = React.useState("");
  const rows = variants.data ?? [];

  if (isVariant) {
    return (
      <div className="rounded-xl border p-3">
        <p className="mb-2 text-sm font-medium">Client variant</p>
        <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(projectId)}>
          <RefreshCw className="size-3.5" /> {sync.isPending ? "Queuing…" : "Sync from base"}
        </Button>
        {sync.isSuccess && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Review task created.</p>}
        {sync.isError && <p className="mt-2 text-xs text-destructive">{sync.error.message}</p>}
      </div>
    );
  }

  // A sandbox base can't be forked (EH7 — its isolated memory must not be copied
  // into a searchable variant scope); hide the affordance entirely.
  if (isSandbox) {
    if (rows.length === 0) return null;
    return (
      <div className="rounded-xl border p-3">
        <p className="mb-2 text-sm font-medium">Client variants</p>
        <VariantList rows={rows} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Client variants</p>
        <Button size="sm" variant="outline" onClick={() => setForking((v) => !v)}>
          <Plus className="size-3.5" /> New variant
        </Button>
      </div>
      {rows.length > 0 && <VariantList rows={rows} />}
      {forking && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <Input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Variant name (e.g. Clinic A)" className="text-xs" />
          <Input
            value={vRoot}
            onChange={(e) => setVRoot(e.target.value)}
            placeholder={"C:\\Projects\\clinic-a"}
            className="font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!vName.trim() || !vRoot.trim() || createVariant.isPending}
              onClick={() =>
                createVariant.mutate(
                  { baseId: projectId, name: vName.trim(), rootDir: vRoot.trim() },
                  {
                    onSuccess: () => {
                      setForking(false);
                      setVName("");
                      setVRoot("");
                    },
                  },
                )
              }
            >
              {createVariant.isPending ? "Forking…" : "Fork"}
            </Button>
            <span className="text-[11px] text-muted-foreground">Clones the base repo + copies its project memory.</span>
          </div>
          {createVariant.isError && <p className="text-xs text-destructive">{createVariant.error.message}</p>}
        </div>
      )}
    </div>
  );
}

function VariantList({ rows }: { rows: { id: string; name: string }[] }) {
  return (
    <div className="space-y-1">
      {rows.map((v) => (
        <Link
          key={v.id}
          to="/projects/$projectId"
          params={{ projectId: v.id }}
          className="block truncate rounded px-1 py-1 text-xs transition-colors hover:bg-accent"
        >
          {v.name}
        </Link>
      ))}
    </div>
  );
}
