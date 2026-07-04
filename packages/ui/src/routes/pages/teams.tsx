import * as React from "react";
import { FolderKanban, Plus, Users } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateTeam, useTeams, useProjects, useSetTeamProjects } from "@/api/hooks";
import type { Team } from "@sparstrow/shared";

// Helper for initials
function getInitials(name: string) {
  return name.substring(0, 2).toUpperCase();
}

export function TeamsPage() {
  const navigate = useNavigate();
  const teamsQuery = useTeams();
  const projectsQuery = useProjects();
  const createTeam = useCreateTeam();
  const setTeamProjects = useSetTeamProjects();

  const [formOpen, setFormOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selectedProjects, setSelectedProjects] = React.useState<Set<string>>(new Set());

  const openForm = () => {
    setName("");
    setDescription("");
    setSelectedProjects(new Set());
    createTeam.reset();
    setTeamProjects.reset();
    setFormOpen(true);
  };

  const toggleProject = (id: string) => {
    const next = new Set(selectedProjects);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProjects(next);
  };

  const submit = () => {
    const payload = {
      name: name.trim(),
      description: description.trim(),
    };
    
    createTeam.mutate(payload, {
      onSuccess: (team: Team) => {
        if (selectedProjects.size > 0) {
          setTeamProjects.mutate({
            teamId: team.id,
            projectIds: Array.from(selectedProjects),
          }, {
            onSuccess: () => setFormOpen(false),
            onError: () => setFormOpen(false), // Even if projects fail, team is created
          });
        } else {
          setFormOpen(false);
        }
      }
    });
  };

  const error = createTeam.error?.message ?? setTeamProjects.error?.message ?? null;
  const isLoading = teamsQuery.isLoading;
  const teams = teamsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Teams group agents together to work on shared projects.
        </p>
        <Button onClick={openForm}>
          <Plus className="size-4 mr-2" /> New team
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center bg-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="size-6 text-primary" />
          </div>
          <p className="mt-4 text-sm font-medium">No teams yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a team to group agents for a shared goal.
          </p>
          <Button className="mt-4" onClick={openForm}>
            <Plus className="size-4 mr-2" /> New team
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <Card 
              key={team.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors flex flex-col group"
              role="button"
              tabIndex={0}
              onClick={() => navigate({ to: "/teams/$teamId", params: { teamId: team.id } })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate({ to: "/teams/$teamId", params: { teamId: team.id } });
                }
              }}
            >
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-base group-hover:text-primary transition-colors">
                    {team.name}
                  </CardTitle>
                  {(team.isEphemeral || team.archivedAt) && (
                    <div className="flex gap-1.5">
                      {team.isEphemeral && (
                        <Badge variant="outline" className="text-[10px] border-sky-500/40 text-sky-600 dark:text-sky-400">
                          ephemeral
                        </Badge>
                      )}
                      {team.archivedAt && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          archived
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                  <Users className="size-3" />
                  {team.memberCount}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 flex-1">
                <p className="line-clamp-2 text-sm text-muted-foreground min-h-[40px]">
                  {team.description || "No description."}
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {team.projectCount > 0 ? (
                      <Badge variant="outline" className="flex items-center gap-1 font-normal">
                        <FolderKanban className="size-3 text-muted-foreground" />
                        {team.projectCount} project{team.projectCount !== 1 && 's'}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No projects</span>
                    )}
                  </div>
                  
                  {team.members.length > 0 && (
                    <div className="flex -space-x-2">
                      {team.members.map((m) => (
                        <div 
                          key={m.agentId} 
                          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-background bg-secondary text-[10px] font-medium ring-1 ring-border"
                          title={m.agentName}
                        >
                          {getInitials(m.agentName)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
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
            
            <div className="space-y-2 pt-2 border-t">
              <Label>Assign Projects</Label>
              {projectsQuery.isLoading ? (
                <Skeleton className="h-20" />
              ) : projects.length === 0 ? (
                <div className="rounded-md border p-4 text-center">
                  <FolderKanban className="mx-auto size-5 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">No projects exist yet to assign.</p>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2 p-1 border rounded-md bg-secondary/20">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-secondary cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={selectedProjects.has(p.id)}
                        onChange={() => toggleProject(p.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.slug}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!name.trim() || createTeam.isPending || setTeamProjects.isPending}
            >
              {createTeam.isPending || setTeamProjects.isPending ? "Creating..." : "Create team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
