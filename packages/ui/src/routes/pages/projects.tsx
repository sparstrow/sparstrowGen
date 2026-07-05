import * as React from "react";
import { Link } from "@tanstack/react-router";
import type { Project, ProjectCreateMode } from "@sparstrow/shared";
import { FolderGit2, FolderPlus, Github, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useProjects, useProvisionProject } from "@/api/hooks";
import { formatDate } from "@/lib/format";

const MODES: { mode: ProjectCreateMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { mode: "scratch", label: "Start from scratch", icon: <FolderPlus className="size-4" />, hint: "Create a new empty folder." },
  { mode: "bind", label: "Use existing folder", icon: <FolderGit2 className="size-4" />, hint: "Bind a local codebase." },
  { mode: "clone", label: "Import from GitHub", icon: <Github className="size-4" />, hint: "Clone a public repository." },
];

export function ProjectsPage() {
  const projects = useProjects();
  const provision = useProvisionProject();

  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<ProjectCreateMode>("scratch");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [rootDir, setRootDir] = React.useState("");
  const [gitUrl, setGitUrl] = React.useState("");
  const [gitInit, setGitInit] = React.useState(false);
  const [isSandbox, setIsSandbox] = React.useState(false);

  // Only base projects at the root; variants live under their base's Variants list.
  const roots = (projects.data ?? []).filter((p) => !p.parentProjectId);

  const openModal = () => {
    setMode("scratch");
    setName("");
    setDescription("");
    setRootDir("");
    setGitUrl("");
    setGitInit(false);
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Projects bind agents to a real directory — with git state, directives, and scoped memory.
        </p>
        <Button onClick={openModal}>
          <Plus className="size-4" /> New project
        </Button>
      </div>

      {projects.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roots.map((project) => (
            <Link key={project.id} to="/projects/$projectId" params={{ projectId: project.id }}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    {project.isSandbox && (
                      <Badge variant="outline" className="text-[10px] border-sky-500/40 text-sky-600 dark:text-sky-400">
                        sandbox
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline" className="w-fit font-mono text-[10px]">
                    {project.slug}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {project.description || "No description."}
                  </p>
                  {project.rootDir && (
                    <p className="break-all font-mono text-xs text-muted-foreground">{project.rootDir}</p>
                  )}
                  <p className="text-xs text-muted-foreground">created {formatDate(project.createdAt)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
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
              <Label>{mode === "clone" ? "Clone into (absolute path)" : "Root directory (absolute path)"}</Label>
              <Input
                value={rootDir}
                onChange={(e) => setRootDir(e.target.value)}
                placeholder={"C:\\Projects\\my-app"}
                className="font-mono text-xs"
              />
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
