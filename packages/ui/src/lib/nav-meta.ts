import {
  BookOpen,
  Bot,
  Puzzle,
  Brain,
  CalendarClock,
  Compass,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Monitor,
  PackagePlus,
  Play,
  Settings,
  Sparkles,
  TerminalSquare,
  Users,
  Workflow,
} from "lucide-react";

export interface NavMeta {
  label: string;
  icon: typeof LayoutDashboard;
}

/** One source of truth for section label + icon, shared by the sidebar, command palette, and tab strip. */
export const NAV_META: Record<string, NavMeta> = {
  "": { label: "Dashboard", icon: LayoutDashboard },
  // Not in `NAV_GROUPS` (no permanent sidebar row — T-M10-03 phase decision):
  // the dashboard card and this breadcrumb are the only entry points to a page
  // that stops being useful once setup is complete.
  setup: { label: "Setup", icon: Compass },
  agents: { label: "Agents", icon: Bot },
  imports: { label: "Imports", icon: PackagePlus },
  teams: { label: "Teams", icon: Users },
  projects: { label: "Projects", icon: FolderKanban },
  tasks: { label: "Task Board", icon: ListChecks },
  chat: { label: "Chat", icon: MessagesSquare },
  messages: { label: "Inbox", icon: Inbox },
  runs: { label: "Runs", icon: Play },
  machines: { label: "Machines", icon: Monitor },
  pipelines: { label: "Pipelines", icon: Workflow },
  schedule: { label: "Schedule", icon: CalendarClock },
  memory: { label: "Memory", icon: Brain },
  skills: { label: "Skills", icon: Puzzle },
  knowledge: { label: "Knowledge Center", icon: BookOpen },
  terminals: { label: "Terminals", icon: TerminalSquare },
  settings: { label: "Settings", icon: Settings },
};

export const AGENT_CREATOR_META: NavMeta = { label: "Agent Creator", icon: Sparkles };

export function sectionMeta(path: string): NavMeta {
  const section = path.split("?")[0]!.split("/").filter(Boolean)[0] ?? "";
  if (path.startsWith("/agents/create")) return AGENT_CREATOR_META;
  return NAV_META[section] ?? { label: section, icon: LayoutDashboard };
}
