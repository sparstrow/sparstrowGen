import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Bot,
  Brain,
  CalendarClock,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  PackagePlus,
  Play,
  Puzzle,
  Settings,
  Sparkles,
  TerminalSquare,
  Users,
  Workflow,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAgents, useProjects, useTeams } from "@/api/hooks";

const PAGES = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/agents/create", label: "Agent Creator", icon: Sparkles },
  { to: "/imports", label: "Imports", icon: PackagePlus },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Task Board", icon: ListChecks },
  { to: "/chat", label: "Chat", icon: MessagesSquare },
  { to: "/messages", label: "Inbox", icon: Inbox },
  { to: "/runs", label: "Runs", icon: Play },
  { to: "/pipelines", label: "Pipelines", icon: Workflow },
  { to: "/schedule", label: "Schedule", icon: CalendarClock },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/skills", label: "Skills", icon: Puzzle },
  { to: "/knowledge", label: "Knowledge Center", icon: BookOpen },
  { to: "/terminals", label: "Terminals", icon: TerminalSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Global Ctrl/Cmd+K palette: jump to any page, agent, team, or project.
 * Entity lists come from the cached queries, so opening it costs nothing.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const agents = useAgents();
  const teams = useTeams();
  const projects = useProjects();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const go = (to: string, params?: Record<string, string>) => {
    onOpenChange(false);
    void navigate({ to, params });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page, agent, team, or project…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {PAGES.map((p) => (
            <CommandItem key={p.to} value={`page ${p.label}`} onSelect={() => go(p.to)}>
              <p.icon /> {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {(agents.data ?? []).length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agents">
              {(agents.data ?? []).map((a) => (
                <CommandItem
                  key={a.id}
                  value={`agent ${a.name}`}
                  onSelect={() => go("/agents")}
                >
                  <Bot /> {a.name}
                  {a.role && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {a.role}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {(teams.data ?? []).length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Teams">
              {(teams.data ?? []).map((t) => (
                <CommandItem
                  key={t.id}
                  value={`team ${t.name}`}
                  onSelect={() => go("/teams/$teamId", { teamId: t.id })}
                >
                  <Users /> {t.name}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {(projects.data ?? []).length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {(projects.data ?? []).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project ${p.name} ${p.slug}`}
                  onSelect={() => go("/projects/$projectId", { projectId: p.id })}
                >
                  <FolderKanban /> {p.name}
                  <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                    {p.slug}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
