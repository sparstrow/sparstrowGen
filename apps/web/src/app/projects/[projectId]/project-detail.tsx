import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  FileText,
  Folder,
  GitBranch,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { ActorAvatar } from "@/components/actor-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WorkLauncher } from "@web/components/work-launcher";
import {
  useAgents,
  useCreateDirective,
  useCreateTask,
  useCreateVariant,
  useDeleteDirective,
  useProject,
  useProjectBriefing,
  useProjectDream,
  useProjectDirectives,
  useProjectFiles,
  useProjectGitState,
  useProjectGraph,
  useProjectGraphUsage,
  useProjectVariants,
  useProjectPrs,
  useProjects,
  useUpdateProject,
  useGraphEngine,
  useLaunchViz,
  useProjectViz,
  useReindexProject,
  useRunDreamNow,
  useStopViz,
  useSetBriefing,
  useSetProjectDream,
  useSyncFromBase,
  useTasks,
  useUpdateDirective,
  type DirEntry,
} from "@web/api/hooks";
import { useMemoryNotes } from "@web/api/hooks";
import { PrRow, ProfileBadge } from "@web/components/pr-queue";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const projects = useProjects();
  const git = useProjectGitState(projectId);

  if (project.isLoading) {
    return <Skeleton className="mx-auto mt-10 h-96 w-full max-w-5xl" />;
  }
  if (!project.data) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Link href="/projects" className="text-sm text-primary hover:underline">
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
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projects
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
          <GitBadge state={git.data} loading={git.isLoading} />
          <ProfileBadge profile={p.executionProfile === "production_app" ? "production_app" : "factory"} />
          {p.isSandbox && (
            <Badge variant="outline" className="border-info/40 text-info" title="Sandbox: memory writes are isolated to this project.">
              sandbox
            </Badge>
          )}
          {parent && (
            <Link
              href={`/projects/${parent.id}`}
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
        {/* Main stage — the canonical launcher instance (rule 16); P6 adds Goal mode. */}
        <div className="space-y-6">
          <WorkLauncher projectId={projectId} />
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
          <GitPanel
            projectId={projectId}
            profile={p.executionProfile === "production_app" ? "production_app" : "factory"}
            stagingBranch={p.stagingBranch ?? null}
            hasRemote={Boolean(p.gitRemote)}
          />
          <DreamCyclePanel projectId={projectId} isSandbox={p.isSandbox} />
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
      {state.dirty && <span className="text-warning">●</span>}
      {state.ahead > 0 && <span className="text-muted-foreground">↑{state.ahead}</span>}
      {state.behind > 0 && <span className="text-muted-foreground">↓{state.behind}</span>}
    </Badge>
  );
}

/**
 * P7 §6 (per-project view) — the execution profile control + this project's open
 * PRs. The profile decides git-ops guard rails: `factory` PRs to main; a
 * `production_app` protects its staging branch too and PRs there. Flipping it is
 * the manual owner action the plan locked (P7-Q3 defaults everything to factory).
 */
function GitPanel({
  projectId,
  profile,
  stagingBranch,
  hasRemote,
}: {
  projectId: string;
  profile: "factory" | "production_app";
  stagingBranch: string | null;
  hasRemote: boolean;
}) {
  const update = useUpdateProject();
  const prs = useProjectPrs(projectId);
  const [staging, setStaging] = React.useState(stagingBranch ?? "");

  const setProfile = (next: "factory" | "production_app") => {
    update.mutate({
      id: projectId,
      data: {
        executionProfile: next,
        stagingBranch: next === "production_app" ? staging.trim() || "staging" : null,
      },
    });
  };

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div>
        <p className="text-sm font-medium">Git &amp; pull requests</p>
        <p className="text-xs text-muted-foreground">
          Profile sets the PR target and push guard rails.
        </p>
      </div>

      <div className="flex gap-2">
        {(["factory", "production_app"] as const).map((v) => (
          <button
            key={v}
            type="button"
            disabled={update.isPending}
            onClick={() => setProfile(v)}
            className={cn(
              "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-accent",
              profile === v && "border-primary bg-accent",
            )}
          >
            {v === "production_app" ? "production app" : "factory"}
          </button>
        ))}
      </div>

      {profile === "production_app" && (
        <div className="flex items-center gap-2">
          <Input
            className="h-8 font-mono text-xs"
            placeholder="staging"
            value={staging}
            onChange={(e) => setStaging(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending || staging.trim() === (stagingBranch ?? "")}
            onClick={() => setProfile("production_app")}
          >
            Set branch
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        PRs target <span className="font-mono">{profile === "production_app" ? (stagingBranch ?? "staging") : "main"}</span>.
      </p>

      {!hasRemote ? (
        <p className="text-xs text-muted-foreground">No git remote — bind or clone one to open PRs.</p>
      ) : prs.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : prs.data?.error ? (
        <p className="text-xs text-muted-foreground">{prs.data.error}</p>
      ) : (prs.data?.pullRequests.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">No open pull requests.</p>
      ) : (
        <div className="space-y-1">
          {prs.data!.pullRequests.map((pr) => (
            <PrRow key={pr.number} pr={pr} />
          ))}
        </div>
      )}
      {update.isError && <p className="text-xs text-destructive">{update.error.message}</p>}
    </div>
  );
}

function ActivityFeed({ projectId }: { projectId: string }) {
  const tasks = useTasks({ projectId });
  const agents = useAgents();
  const rows = (tasks.data ?? []).slice(0, 15);
  const agentName = (id: string | null) =>
    id ? (agents.data?.find((a) => a.id === id)?.name ?? null) : null;
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
            <div
              key={t.id}
              className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent"
            >
              <ActorAvatar
                name={agentName(t.assignedAgentId)}
                kind={t.assignedAgentId ? "agent" : "user"}
                size="sm"
                title={agentName(t.assignedAgentId) ?? "Unassigned"}
              />
              <Link href="/tasks" className="min-w-0 flex-1 truncate hover:underline">
                {t.title}
              </Link>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {t.status.replace(/_/g, " ")}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(t.updatedAt)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus:outline-none">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Task actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/tasks">Open Task Board</Link>
                  </DropdownMenuItem>
                  {t.runId && (
                    <DropdownMenuItem asChild>
                      <Link href={`/runs/${t.runId}`}>
                        View run
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(t.id)}>
                    Copy task id
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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
  const [confirmRemove, setConfirmRemove] = React.useState<{ id: string; body: string } | null>(
    null,
  );

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
            aria-label="Delete directive"
            onClick={() => setConfirmRemove({ id: d.id, body: d.body })}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <ConfirmDialog
        open={confirmRemove != null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title="Delete this directive?"
        description={
          confirmRemove
            ? `“${confirmRemove.body}” will no longer be injected into runs for this project.`
            : "This rule will no longer be injected into runs for this project."
        }
        pending={remove.isPending}
        pendingLabel="Deleting…"
        onConfirm={() =>
          confirmRemove &&
          remove.mutate(
            { projectId, id: confirmRemove.id },
            { onSuccess: () => setConfirmRemove(null) },
          )
        }
      />
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
            href="/memory"
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

/**
 * P5 dream cycle (P5-Q1: OFF until enabled per project): nightly memory
 * consolidation — signal extraction from the day's runs, near-duplicate
 * merges (originals archived, never deleted), contradiction flags into the
 * Attention queue. Results land as an inbox digest + ws event.
 */
function DreamCyclePanel({ projectId, isSandbox }: { projectId: string; isSandbox: boolean }) {
  const dream = useProjectDream(projectId);
  const setDream = useSetProjectDream();
  const runNow = useRunDreamNow();
  const enabled = dream.data?.enabled ?? false;
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Dream cycle</p>
          <p className="text-xs text-muted-foreground">
            Nightly memory consolidation: signals, merges, contradiction flags.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={setDream.isPending || isSandbox}
          onCheckedChange={(on) => setDream.mutate({ projectId, enabled: on })}
        />
      </div>
      {isSandbox && (
        <p className="text-xs text-muted-foreground">
          Sandboxes don&apos;t dream — promote the project to enable nightly consolidation.
        </p>
      )}
      {enabled && dream.data?.cronExpr && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] text-muted-foreground">schedule: {dream.data.cronExpr}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={runNow.isPending}
            onClick={() => runNow.mutate(projectId)}
          >
            Run now
          </Button>
        </div>
      )}
      {runNow.isSuccess && (
        <p className="text-xs text-success">
          Dream cycle started — the digest lands in your inbox.
        </p>
      )}
      {setDream.isError && <p className="text-xs text-destructive">{setDream.error.message}</p>}
      {runNow.isError && <p className="text-xs text-destructive">{runNow.error.message}</p>}
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
                  <Folder className="size-3.5 shrink-0 text-info" />
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
  const usage = useProjectGraphUsage(projectId, graph.data?.state === "ready");
  const viz = useProjectViz(projectId, graph.data?.state === "ready");
  const reindex = useReindexProject();
  const launchViz = useLaunchViz();
  const stopViz = useStopViz();

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
          <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
            install it in Settings
          </Link>{" "}
          to give agents structure-aware code search.
        </p>
      ) : !hasRoot ? (
        <p className="text-xs text-muted-foreground">Bind a root directory to build a code graph.</p>
      ) : (
        <div className="space-y-2">
          {s?.state === "ready" && (
            <>
              <p className="font-mono text-[11px] text-muted-foreground">
                {(s.nodes ?? 0).toLocaleString()} nodes · {(s.edges ?? 0).toLocaleString()} edges
                {s.indexedAt ? ` · indexed ${formatDate(s.indexedAt)}` : ""}
              </p>
              {usage.data && usage.data.totalRuns > 0 && (
                <p className="font-mono text-[11px] text-muted-foreground">
                  used in {usage.data.runsWithGraph} of {usage.data.totalRuns} runs
                </p>
              )}
            </>
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

          {/* T11 (UC2): viz launch — gated on a non-empty graph (F10); the
              security/idle framing travels WITH the affordance (F9); a stopped
              viz shows an honest Relaunch state, never a mystery dead tab (F2). */}
          {s?.state === "ready" && (s.nodes ?? 0) > 0 && (
            <div className="border-t pt-2">
              {viz.data?.running && viz.data.url ? (
                <div className="space-y-1.5">
                  <span className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" asChild>
                      <a href={viz.data.url} target="_blank" rel="noreferrer noopener">
                        Open 3D view
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" disabled={stopViz.isPending} onClick={() => stopViz.mutate(projectId)}>
                      Stop
                    </Button>
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Running — stops after {Math.round((viz.data.idleStopMs ?? 900000) / 60000)} min; the open tab goes dead then.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={launchViz.isPending}
                    onClick={() =>
                      launchViz.mutate(projectId, {
                        onSuccess: (r) => {
                          if (r.ok && r.url) window.open(r.url, "_blank", "noopener,noreferrer");
                        },
                      })
                    }
                  >
                    {launchViz.isPending ? "Starting…" : "Launch 3D view"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Local, unauthenticated, read-only visualization — opens in a new tab, stops after 15 min.
                  </p>
                  {launchViz.data && !launchViz.data.ok && (
                    <p className="text-xs text-destructive">
                      {launchViz.data.reason === "ui-not-installed"
                        ? "Viz engine variant not installed — install it from Settings (Install viz)."
                        : (launchViz.data.detail ?? "Could not start the visualization.")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
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
        {sync.isSuccess && <p className="mt-2 text-xs text-success">Review task created.</p>}
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
          href={`/projects/${v.id}`}
          className="block truncate rounded px-1 py-1 text-xs transition-colors hover:bg-accent"
        >
          {v.name}
        </Link>
      ))}
    </div>
  );
}
