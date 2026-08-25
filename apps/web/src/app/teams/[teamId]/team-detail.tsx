import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Trash2, 
  Users, 
  FolderKanban, 
  Check, 
  X,
  Plus,
  Bot,
  MessageSquare,
  Send,
  Pencil,
  Rocket
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TasksPage } from "../../tasks/tasks";
import { PipelinesPage } from "../../pipelines/pipelines";
import { SchedulePage } from "../../schedule/schedule";
import { PipelineCanvas } from "@web/components/pipelines/pipeline-canvas";
import { 
  useTeam, 
  useUpdateTeam, 
  useDeleteTeam, 
  useProjects, 
  useSetTeamProjects,
  useAgents,
  useAddTeamMember,
  useUpdateTeamMember,
  useRemoveTeamMember,
  useTeamManagerChat,
  useCreatePipeline
} from "@web/api/hooks";
import { ManagerChatPanel } from "@web/components/team/manager-chat-panel";
import { cn } from "@/lib/utils";
import {
  validateDraftForPublish,
  draftToCreatePayload,
  type TeamMember,
  type DraftPipeline,
} from "@sparstrow/shared";

function getInitials(name: string) {
  return name.substring(0, 2).toUpperCase();
}

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const router = useRouter();

  const teamQuery = useTeam(teamId);
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const [deleting, setDeleting] = React.useState(false);
  
  // Header inline edit state
  const team = teamQuery.data;
  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editDesc, setEditDesc] = React.useState("");

  React.useEffect(() => {
    if (team && !isEditing) {
      setEditName(team.name);
      setEditDesc(team.description);
    }
  }, [team, isEditing]);

  const cancelEdit = () => {
    setIsEditing(false);
    if (team) {
      setEditName(team.name);
      setEditDesc(team.description);
    }
  };

  const saveEdit = () => {
    if (!editName.trim() || !team) return;
    updateTeam.mutate(
      { id: team.id, data: { name: editName.trim(), description: editDesc.trim() } },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") cancelEdit();
    if (e.key === "Enter" && e.ctrlKey) saveEdit();
  };

  if (teamQuery.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="p-6">
        <p className="text-destructive">Team not found.</p>
        <Button variant="link" className="mt-4 px-0" asChild>
          <Link href="/teams"><ArrowLeft className="mr-2 size-4" /> Back to Teams</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <Button variant="link" className="px-0 text-muted-foreground mb-4 h-auto py-0" asChild>
          <Link href="/teams"><ArrowLeft className="mr-2 size-4" /> Teams</Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-4">
            {isEditing ? (
              <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm" onKeyDown={handleKeyDown}>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Team Name</Label>
                  <Input 
                    autoFocus
                    value={editName} 
                    onChange={(e) => setEditName(e.target.value)}
                    className="font-bold text-lg" 
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Textarea 
                    rows={2} 
                    value={editDesc} 
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="resize-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button 
                    size="sm" 
                    onClick={saveEdit} 
                    disabled={!editName.trim() || updateTeam.isPending}
                  >
                    <Check className="size-4 mr-2" /> Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="size-4 mr-2" /> Cancel
                  </Button>
                  <span className="text-xs text-muted-foreground ml-2">Press Esc to cancel</span>
                </div>
              </div>
            ) : (
              <div className="group relative rounded-lg border border-transparent p-2 -ml-2 transition-colors hover:border-border hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {/* Defensive floor, not the fix: the real contract is the backend
                        actually populating `members` per teamDetailSchema (see
                        BUG-2026-08-22-teams-page-crashes-with-real-data). This only
                        guards against a future contract drift turning back into a
                        hard crash. */}
                    <Users className="size-3" /> {(team.members ?? []).length}
                  </Badge>
                  {team.isEphemeral && (
                    <Badge variant="outline" className="border-info/40 text-info" title="Auto-created around a multi-assign task; archives itself when the task finishes.">
                      ephemeral
                    </Badge>
                  )}
                  {team.archivedAt && (
                    <Badge variant="outline" className="text-muted-foreground" title="Soft-archived — kept for run/task history, no longer counts as a shared team.">
                      archived
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-muted-foreground max-w-3xl">
                  {team.description || <span className="italic">No description provided.</span>}
                </p>
                {team.isEphemeral && (
                  <p className="mt-2 text-sm text-info bg-info/10 p-2 rounded-md border border-info/20 w-fit">
                    This is an ephemeral team created around a task. It is read-only and will be archived automatically.
                  </p>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setIsEditing(true)}
                >
                  Edit details
                </Button>
              </div>
            )}
          </div>
          
          <Button 
            variant="destructive" 
            size="icon" 
            onClick={() => setDeleting(true)} 
            className="shrink-0"
            title="Delete team"
            aria-label="Delete team"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tasks" className="flex flex-col gap-6">
        <TabsList className="w-fit">
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks">
          <TasksPage teamId={team.id} readOnly={team.isEphemeral} />
        </TabsContent>
        <TabsContent value="pipelines">
          <PipelinesPage teamId={team.id} readOnly={team.isEphemeral} />
        </TabsContent>
        <TabsContent value="schedules">
          <SchedulePage teamId={team.id} readOnly={team.isEphemeral} />
        </TabsContent>
        <TabsContent value="members">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <MembersSection teamId={team.id} members={team.members ?? []} readOnly={team.isEphemeral} />
            </div>
            <div className="space-y-6">
              <ProjectsSection teamId={team.id} assignedProjects={team.projects ?? []} readOnly={team.isEphemeral} />
              <ManagerChatPanel
                teamId={team.id}
                roster={(team.members ?? []).map((m) => ({ id: m.agentId, name: m.agentName }))}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Team</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{team.name}</strong>? 
              Agents and projects are kept, but the team grouping will be removed permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              disabled={deleteTeam.isPending}
              onClick={() => deleteTeam.mutate(team.id, { onSuccess: () => router.push("/teams") })}
            >
              {deleteTeam.isPending ? "Deleting..." : "Delete Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------
// Members Section
// ----------------------------------------------------------------------

function MembersSection({ teamId, members, readOnly }: { teamId: string, members: any[], readOnly?: boolean }) {
  const agentsQuery = useAgents();
  const removeMember = useRemoveTeamMember();
  
  const [addOpen, setAddOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" /> Team Members
        </h2>
        {!readOnly && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-2" /> Add Member
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed py-8 text-center bg-card">
          <p className="text-sm text-muted-foreground">No agents in this team.</p>
          {!readOnly && (
            <Button variant="link" size="sm" className="mt-2" onClick={() => setAddOpen(true)}>
              Add the first member
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <MemberRow key={m.id} teamId={teamId} member={m} readOnly={readOnly} />
          ))}
        </div>
      )}

      <AddMemberDialog 
        teamId={teamId}
        open={addOpen} 
        onOpenChange={setAddOpen} 
        existingAgentIds={new Set(members.map(m => m.agentId))} 
        agents={agentsQuery.data ?? []}
      />
    </div>
  );
}

function MemberRow({ teamId, member, readOnly }: { teamId: string, member: any, readOnly?: boolean }) {
  const updateMember = useUpdateTeamMember();
  const removeMember = useRemoveTeamMember();
  
  const [isEditing, setIsEditing] = React.useState(false);
  const [roleInput, setRoleInput] = React.useState(member.teamRole || "");

  const save = () => {
    updateMember.mutate({
      teamId,
      memberId: member.id,
      data: { teamRole: roleInput.trim() || null }
    }, {
      onSuccess: () => setIsEditing(false)
    });
  };

  const cancel = () => {
    setIsEditing(false);
    setRoleInput(member.teamRole || "");
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
        {getInitials(member.agentName)}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{member.agentName}</span>
          {member.agentRole && (
            <Badge variant="outline" className="font-normal text-[10px] uppercase">{member.agentRole}</Badge>
          )}
        </div>
        
        {isEditing ? (
          <div className="flex items-center gap-2 mt-2">
            <Input 
              autoFocus
              size={1}
              className="h-7 text-xs w-48" 
              placeholder="e.g. Lead Developer" 
              value={roleInput}
              onChange={e => setRoleInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
            />
            <Button size="icon" variant="ghost" className="size-7" onClick={save} disabled={updateMember.isPending}>
              <Check className="size-4 text-success" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={cancel}>
              <X className="size-4 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <div 
            className={cn("text-xs text-muted-foreground mt-1 flex items-center gap-1", !readOnly && "cursor-pointer hover:text-foreground transition-colors group")}
            onClick={() => !readOnly && setIsEditing(true)}
          >
            {member.teamRole ? (
              <span className="font-medium text-foreground">{member.teamRole}</span>
            ) : (
              <span className="italic">No team role set</span>
            )}
            {!readOnly && <span className="opacity-0 group-hover:opacity-100 text-[10px] underline ml-1">Edit</span>}
          </div>
        )}
      </div>
      
      {!readOnly && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => removeMember.mutate({ teamId, memberId: member.id })}
          disabled={removeMember.isPending}
          title="Remove member"
          aria-label={`Remove ${member.agentName}`}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

function AddMemberDialog({ teamId, open, onOpenChange, existingAgentIds, agents }: { 
  teamId: string, open: boolean, onOpenChange: (o: boolean) => void, 
  existingAgentIds: Set<string>, agents: any[] 
}) {
  const addMember = useAddTeamMember();
  
  const [selectedAgentId, setSelectedAgentId] = React.useState("");
  const [teamRole, setTeamRole] = React.useState("");
  
  const availableAgents = agents.filter(a => !existingAgentIds.has(a.id));

  const submit = () => {
    if (!selectedAgentId) return;
    addMember.mutate({
      teamId,
      data: { agentId: selectedAgentId, teamRole: teamRole.trim() || null }
    }, {
      onSuccess: () => {
        setSelectedAgentId("");
        setTeamRole("");
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>Select an agent to join the team.</DialogDescription>
        </DialogHeader>
        
        {availableAgents.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            All available agents are already in this team.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Agent</Label>
              <div className="grid gap-2 max-h-48 overflow-y-auto p-1">
                {availableAgents.map(a => (
                  <div 
                    key={a.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors",
                      selectedAgentId === a.id ? "bg-primary/10 border-primary" : "hover:bg-muted"
                    )}
                    onClick={() => setSelectedAgentId(a.id)}
                  >
                    <Bot className={cn("size-4", selectedAgentId === a.id ? "text-primary" : "text-muted-foreground")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none">{a.name}</p>
                      {a.role && <p className="text-xs text-muted-foreground mt-1 truncate">{a.role}</p>}
                    </div>
                    {selectedAgentId === a.id && <Check className="size-4 text-primary" />}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Team Role (optional)</Label>
              <Input 
                value={teamRole} 
                onChange={e => setTeamRole(e.target.value)} 
                placeholder="e.g. Lead QA, Designer" 
              />
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={submit} 
            disabled={!selectedAgentId || addMember.isPending || availableAgents.length === 0}
          >
            {addMember.isPending ? "Adding..." : "Add Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Projects Section
// ----------------------------------------------------------------------

function ProjectsSection({ teamId, assignedProjects, readOnly }: { teamId: string, assignedProjects: any[], readOnly?: boolean }) {
  const projectsQuery = useProjects();
  const setProjects = useSetTeamProjects();
  
  const [manageOpen, setManageOpen] = React.useState(false);
  const [editingSet, setEditingSet] = React.useState<Set<string>>(new Set());

  const openManage = () => {
    setEditingSet(new Set(assignedProjects.map(p => p.id)));
    setManageOpen(true);
  };

  const save = () => {
    setProjects.mutate({ teamId, projectIds: Array.from(editingSet) }, {
      onSuccess: () => setManageOpen(false)
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderKanban className="size-5 text-muted-foreground" /> Assigned Projects
        </h2>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={openManage}>
            Manage
          </Button>
        )}
      </div>

      {assignedProjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects assigned.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignedProjects.map(p => (
            <Badge key={p.id} variant="secondary" className="px-3 py-1 text-sm font-normal">
              {p.name}
            </Badge>
          ))}
        </div>
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Projects</DialogTitle>
            <DialogDescription>Assign projects to this team.</DialogDescription>
          </DialogHeader>
          
          <div className="max-h-60 overflow-y-auto space-y-2 py-2">
            {(projectsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No projects exist in the system.</p>
            ) : (
              (projectsQuery.data ?? []).map(p => (
                <label key={p.id} className="flex items-center gap-3 p-3 rounded-md border hover:bg-secondary/50 cursor-pointer">
                  <input 
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={editingSet.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(editingSet);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setEditingSet(next);
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.slug}</p>
                  </div>
                </label>
              ))
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={setProjects.isPending}>
              {setProjects.isPending ? "Saving..." : "Save Assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
