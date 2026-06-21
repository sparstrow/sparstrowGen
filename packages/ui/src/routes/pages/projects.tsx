import * as React from "react";
import type { Project } from "@sparstrow/shared";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateProject, useDeleteProject, useProjects, useUpdateProject } from "@/api/hooks";
import { formatDate } from "@/lib/format";

export function ProjectsPage() {
  const projects = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Project | null>(null);
  const [deleting, setDeleting] = React.useState<Project | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [rootDir, setRootDir] = React.useState("");

  const openForm = (project: Project | null) => {
    setEditing(project);
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setRootDir(project?.rootDir ?? "");
    createProject.reset();
    updateProject.reset();
    setFormOpen(true);
  };

  const submit = () => {
    const payload = {
      name: name.trim(),
      description: description.trim(),
      rootDir: rootDir.trim() || null,
    };
    if (editing) {
      updateProject.mutate(
        { id: editing.id, data: payload },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createProject.mutate(payload, { onSuccess: () => setFormOpen(false) });
    }
  };

  const error = (createProject.error ?? updateProject.error)?.message ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Projects scope agent memory — each gets a vault folder under projects/&lt;slug&gt;/.
        </p>
        <Button onClick={() => openForm(null)}>
          <Plus className="size-4" /> New project
        </Button>
      </div>

      {projects.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (projects.data ?? []).length === 0 ? (
        <div className="rounded-xl border py-16 text-center">
          <p className="text-sm font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one per initiative — apps, startup company, product manufacturing…
          </p>
          <Button className="mt-4" onClick={() => openForm(null)}>
            <Plus className="size-4" /> New project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(projects.data ?? []).map((project) => (
            <Card key={project.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">{project.name}</CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {project.slug}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openForm(project)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleting(project)}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {project.description || "No description."}
                </p>
                {project.rootDir && (
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {project.rootDir}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  created {formatDate(project.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New project"}</DialogTitle>
            <DialogDescription>
              Memory saved to this project lives in the vault under projects/&lt;slug&gt;/.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Startup Company"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Root directory (optional)</Label>
              <Input
                value={rootDir}
                onChange={(e) => setRootDir(e.target.value)}
                placeholder={"C:\\Projects\\my-app"}
                className="font-mono text-xs"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!name.trim() || createProject.isPending || updateProject.isPending}
            >
              {editing ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting != null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              The project is removed from the database. Its vault folder and notes are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteProject.isPending}
              onClick={() =>
                deleting &&
                deleteProject.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
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
