"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus, Users } from "lucide-react";
import type { Project, Team } from "@sparstrow/shared";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateTeam, useSetTeamProjects } from "@web/api/hooks";

/**
 * The interactive island `page.tsx` reads server-side data around. Owns the
 * toolbar line, the empty state (when there are no teams), and the create
 * dialog — everything about *doing* something on this page. The team list
 * itself, the hierarchy, the counts, are all the Server Component; this
 * never receives a single team.
 *
 * Both trigger buttons live in this one component, deliberately, rather than
 * as two separate mounts. They need to open the SAME dialog, and a second
 * `TeamsPageClient` in the empty state would carry independent dialog state
 * — clicking one button would leave the other's dialog closed and useless.
 * `hasTeams` is how one mount decides which trigger position(s) to render.
 *
 * `projects` arrives as a prop, fetched by the same server request that
 * loaded the teams — not a second client-side round trip the moment this
 * dialog opens, which is what the old `useProjects()` call inside the dialog
 * cost every time before this.
 *
 * The create mutation is unchanged from before this conversion — still
 * `POST /api/v1/teams` via React Query, per T-VR-05's scope: only the READ
 * moves to the server here. Converting the write to a Server Action is a
 * separate, later decision (see this task's Result), not bundled into the
 * first worked example. What DOES change is how success is observed: the
 * mutation's own `invalidateQueries` targets a React Query cache the
 * server-rendered list no longer reads, so it is `router.refresh()` — re-running
 * the Server Component — that actually gets the new team on screen.
 */
export function TeamsPageClient({ projects, hasTeams }: { projects: Project[]; hasTeams: boolean }) {
  const router = useRouter();
  const createTeam = useCreateTeam();
  const setTeamProjects = useSetTeamProjects();

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selectedProjects, setSelectedProjects] = React.useState<Set<string>>(new Set());

  const openForm = () => {
    setName("");
    setDescription("");
    setSelectedProjects(new Set());
    createTeam.reset();
    setTeamProjects.reset();
    setOpen(true);
  };

  const toggleProject = (id: string) => {
    const next = new Set(selectedProjects);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProjects(next);
  };

  const submit = () => {
    const payload = { name: name.trim(), description: description.trim() };
    createTeam.mutate(payload, {
      onSuccess: (team: Team) => {
        if (selectedProjects.size > 0) {
          setTeamProjects.mutate(
            { teamId: team.id, projectIds: Array.from(selectedProjects) },
            {
              onSuccess: () => {
                setOpen(false);
                router.refresh();
              },
              // Even if project assignment fails, the team was created —
              // still close and refresh so it's not left invisible.
              onError: () => {
                setOpen(false);
                router.refresh();
              },
            },
          );
        } else {
          setOpen(false);
          router.refresh();
        }
      },
    });
  };

  const error = createTeam.error?.message ?? setTeamProjects.error?.message ?? null;

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Teams group agents together to work on shared projects.
        </p>
        <Button onClick={openForm}>
          <Plus className="mr-2 size-4" /> New team
        </Button>
      </div>

      {!hasTeams && (
        <div className="mt-4 rounded-xl border border-dashed bg-card py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="size-6 text-primary" />
          </div>
          <p className="mt-4 text-sm font-medium">No teams yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a team to group agents for a shared goal.
          </p>
          <Button className="mt-4" onClick={openForm}>
            <Plus className="mr-2 size-4" /> New team
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
            <DialogDescription>
              Create a new team of agents to tackle projects together.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product Squad"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Handles product ideation and planning."
              />
            </div>

            <div className="space-y-2 border-t pt-2">
              <Label>Assign Projects</Label>
              {projects.length === 0 ? (
                <div className="rounded-md border p-4 text-center">
                  <FolderKanban className="mx-auto mb-1 size-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No projects exist yet to assign.</p>
                </div>
              ) : (
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border bg-secondary/20 p-1">
                  {projects.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjects.has(p.id)}
                        onChange={() => toggleProject(p.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-sm font-medium leading-none">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.slug}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!name.trim() || createTeam.isPending || setTeamProjects.isPending}
            >
              {createTeam.isPending || setTeamProjects.isPending ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
