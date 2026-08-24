import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAgents, useCreateGoal, useCreateTask, useTeams } from "@web/api/hooks";
import { cn } from "@/lib/utils";

/**
 * THE launcher (design rule 16): one shared component with an explicit
 * Task / Goal mode switch. Canonical instance = the project workspace main
 * stage; the Tasks page's Goals tab mounts the same. Pipeline definitions
 * keep their own page until P10 unifies authoring on the canvas.
 */
export function WorkLauncher({
  projectId = null,
  defaultMode = "task",
}: {
  projectId?: string | null;
  defaultMode?: "task" | "goal";
}) {
  const [mode, setMode] = React.useState<"task" | "goal">(defaultMode);
  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-medium">
          {mode === "task" ? "What would you like to work on?" : "What outcome should the factory plan for?"}
        </p>
        <div className="flex rounded-lg border p-0.5">
          {(["task", "goal"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {mode === "task" ? <TaskMode projectId={projectId} /> : <GoalMode projectId={projectId} />}
    </div>
  );
}

function TaskMode({ projectId }: { projectId: string | null }) {
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
    <>
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
          {agentIds.length > 1 && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" /> {agentIds.length} agents → ephemeral swarm.
            </span>
          )}
        </span>
        <Button size="sm" disabled={!title.trim() || createTask.isPending} onClick={launch}>
          {createTask.isPending ? "Launching…" : "Launch task"}
        </Button>
      </div>
      {createTask.isError && <p className="text-xs text-destructive">{createTask.error.message}</p>}
    </>
  );
}

function GoalMode({ projectId }: { projectId: string | null }) {
  const teams = useTeams();
  const createGoal = useCreateGoal();
  const router = useRouter();
  const [prompt, setPrompt] = React.useState("");
  const [teamId, setTeamId] = React.useState("");

  const launch = () => {
    if (!prompt.trim()) return;
    createGoal.mutate(
      { prompt: prompt.trim(), projectId, teamId: teamId || null },
      {
        onSuccess: (goal) => {
          setPrompt("");
          setTeamId("");
          void router.push(`/tasks/goals/${goal.id}`);
        },
      },
    );
  };

  const activeTeams = (teams.data ?? []).filter((t) => !t.archivedAt);
  return (
    <>
      <Textarea
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the outcome — the Planner decomposes it into a dependency graph of agent work…"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue placeholder="Any agent (no team bound)" />
          </SelectTrigger>
          <SelectContent>
            {activeTeams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          Team-bounded goals only assign that team's members.
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Plans ending in a push/PR step get a consensus review before pushing.
        </span>
        <Button size="sm" disabled={!prompt.trim() || createGoal.isPending} onClick={launch}>
          <Target className="size-3.5" />
          {createGoal.isPending ? "Planning…" : "Launch goal"}
        </Button>
      </div>
      {createGoal.isError && <p className="text-xs text-destructive">{createGoal.error.message}</p>}
    </>
  );
}
