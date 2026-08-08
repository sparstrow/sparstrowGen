import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Project, ProjectCreateMode } from "@sparstrow/shared";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  Github,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { DirectoryPickerDialog } from "@/components/directory-picker-dialog";
import { useProjects, useProvisionProject } from "@/api/hooks";
import { nativePickerAvailable, pickDirectoryNative } from "@/lib/directory-picker";
import { formatDate } from "@/lib/format";
import { pinKey, usePins } from "@/lib/pins";

const MODES: { mode: ProjectCreateMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { mode: "scratch", label: "Start from scratch", icon: <FolderPlus className="size-4" />, hint: "Create a new empty folder." },
  { mode: "bind", label: "Use existing folder", icon: <FolderGit2 className="size-4" />, hint: "Bind a local codebase." },
  { mode: "clone", label: "Import from GitHub", icon: <Github className="size-4" />, hint: "Clone a public repository." },
];

type ProjectSortKey = "name" | "createdAt";

export function ProjectsPage() {
  const navigate = useNavigate();
  const projects = useProjects();
  const provision = useProvisionProject();
  const pins = usePins();

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: ProjectSortKey; dir: "asc" | "desc" }>({
    key: "createdAt",
    dir: "desc",
  });
  const onSort = (key: ProjectSortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" },
    );

  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<ProjectCreateMode>("scratch");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [rootDir, setRootDir] = React.useState("");
  const [gitUrl, setGitUrl] = React.useState("");
  const [gitInit, setGitInit] = React.useState(false);
  const [isSandbox, setIsSandbox] = React.useState(false);
  const [pickerError, setPickerError] = React.useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = React.useState(false);

  // 001 FR-007/FR-008: the desktop shell gets the real Explorer dialog. Resolved
  // once — the bridge is injected before the app loads and never appears later.
  const nativePicker = React.useMemo(nativePickerAvailable, []);

  // FR-003/FR-004: fill the field on a choice, leave it alone on cancel. A
  // rejection means the shell could not open the dialog at all; say so and
  // leave the owner typing, rather than failing silently.
  const browseNative = async () => {
    setPickerError(null);
    try {
      const picked = await pickDirectoryNative(rootDir.trim() || undefined);
      if (picked) setRootDir(picked);
    } catch (err) {
      setPickerError(
        `Could not open the folder picker: ${err instanceof Error ? err.message : String(err)}. Type the path instead.`,
      );
    }
  };

  // Only base projects at the root; variants live under their base's Variants list.
  const roots = (projects.data ?? []).filter((p) => !p.parentProjectId);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = roots.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.rootDir ?? "").toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) =>
      (sort.key === "name"
        ? a.name.localeCompare(b.name)
        : a.createdAt.localeCompare(b.createdAt)) * dir,
    );
  }, [roots, query, sort]);

  const togglePin = (p: Project) => {
    const key = pinKey("project", p.id);
    if (pins.isPinned(key)) pins.unpin(key);
    else pins.pin({ key, kind: "project", label: p.name, to: `/projects/${p.id}` });
  };

  const sortIcon = (key: ProjectSortKey) =>
    sort.key !== key ? ArrowUpDown : sort.dir === "desc" ? ArrowDown : ArrowUp;

  const openModal = () => {
    setMode("scratch");
    setName("");
    setDescription("");
    setRootDir("");
    setGitUrl("");
    setGitInit(false);
    setPickerError(null);
    setIsSandbox(false);
    provision.reset();
    setOpen(true);
  };

  const submit = () => {
    if (!name.trim() || !rootDir.trim()) return;
    provision.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        mode,
        rootDir: rootDir.trim(),
        gitUrl: mode === "clone" ? gitUrl.trim() : undefined,
        gitInit: mode === "scratch" ? gitInit : false,
        isSandbox: mode !== "scratch" ? isSandbox : false,
      },
      { onSuccess: () => setOpen(false) },
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
            placeholder="Filter projects…"
            className="h-9 w-56 pl-8"
            aria-label="Filter projects"
          />
        </div>
        <p className="hidden text-sm text-muted-foreground lg:block">
          Projects bind agents to a real directory — with git state, directives, and scoped memory.
        </p>
        <div className="flex-1" />
        <Button onClick={openModal}>
          <Plus className="size-4" /> New project
        </Button>
      </div>

      {projects.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : roots.length === 0 ? (
        <div className="rounded-xl border py-16 text-center">
          <p className="text-sm font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one per initiative — apps, a product, a client engagement…
          </p>
          <Button className="mt-4" onClick={openModal}>
            <Plus className="size-4" /> New project
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table className="[&_td]:px-3 [&_td]:py-2 [&_th]:h-8 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => onSort("name")}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    Project {React.createElement(sortIcon("name"), { className: "size-3" })}
                  </button>
                </TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Directory</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => onSort("createdAt")}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    Created {React.createElement(sortIcon("createdAt"), { className: "size-3" })}
                  </button>
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No projects match “{query}”.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer text-xs"
                    onClick={() =>
                      void navigate({ to: "/projects/$projectId", params: { projectId: project.id } })
                    }
                  >
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: project.id }}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.name}
                        </Link>
                        {project.isSandbox && (
                          <Badge variant="outline" className="text-[10px] border-sky-500/40 text-sky-600 dark:text-sky-400">
                            sandbox
                          </Badge>
                        )}
                        {pins.isPinned(pinKey("project", project.id)) && (
                          <Pin className="size-3 text-muted-foreground" />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">{project.slug}</TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-muted-foreground" title={project.rootDir ?? undefined}>
                      {project.rootDir || "—"}
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-muted-foreground">
                      {project.description || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(project.createdAt)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Project actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              void navigate({
                                to: "/projects/$projectId",
                                params: { projectId: project.id },
                              })
                            }
                          >
                            Open workspace
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => togglePin(project)}>
                            {pins.isPinned(pinKey("project", project.id)) ? (
                              <>
                                <PinOff className="size-4" /> Unpin from sidebar
                              </>
                            ) : (
                              <>
                                <Pin className="size-4" /> Pin to sidebar
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!project.rootDir}
                            onClick={() =>
                              project.rootDir && void navigator.clipboard.writeText(project.rootDir)
                            }
                          >
                            Copy directory path
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

      {/* 3-path creation modal (§4) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Bind a project to a directory on this machine.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  onClick={() => setMode(m.mode)}
                  className={
                    "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors " +
                    (mode === m.mode ? "border-primary bg-primary/5" : "hover:bg-accent")
                  }
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {m.icon}
                    {m.label}
                  </span>
                  <span className="text-muted-foreground">{m.hint}</span>
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My App" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {mode === "clone" && (
              <div className="space-y-1.5">
                <Label>Public git URL</Label>
                <Input
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo.git"
                  className="font-mono text-xs"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="project-root-dir">
                {mode === "clone" ? "Clone into (absolute path)" : "Root directory (absolute path)"}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="project-root-dir"
                  value={rootDir}
                  onChange={(e) => setRootDir(e.target.value)}
                  placeholder={"C:\\Projects\\my-app"}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={nativePicker ? browseNative : () => setBrowserOpen(true)}
                  className="shrink-0"
                >
                  <FolderOpen className="size-4" />
                  Browse…
                </Button>
              </div>
              {pickerError && <p className="text-xs text-destructive">{pickerError}</p>}
              {!nativePicker && (
                <DirectoryPickerDialog
                  open={browserOpen}
                  onOpenChange={setBrowserOpen}
                  mode={mode}
                  initialPath={rootDir}
                  onSelect={(picked) => {
                    setRootDir(picked);
                    setBrowserOpen(false);
                  }}
                />
              )}
            </div>

            {mode === "scratch" && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={gitInit} onCheckedChange={setGitInit} />
                Initialize a git repository
              </label>
            )}
            {mode !== "scratch" && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={isSandbox} onCheckedChange={setIsSandbox} />
                Open in a sandbox — isolate this project's memory from production
              </label>
            )}

            {provision.isError && <p className="text-sm text-destructive">{provision.error.message}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                !name.trim() ||
                !rootDir.trim() ||
                (mode === "clone" && !gitUrl.trim()) ||
                provision.isPending
              }
            >
              {provision.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
