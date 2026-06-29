import * as React from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Brain,
  CalendarClock,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Play,
  Settings,
  TerminalSquare,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { wsHub } from "@/lib/ws";
import { ThemeToggle } from "@/theme/theme-toggle";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/tasks", label: "Task Board", icon: ListChecks },
  { to: "/messages", label: "Messages", icon: Inbox },
  { to: "/runs", label: "Runs", icon: Play },
  { to: "/pipelines", label: "Pipelines", icon: Workflow },
  { to: "/schedule", label: "Schedule", icon: CalendarClock },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/terminals", label: "Terminals", icon: TerminalSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function useWsConnected(): boolean {
  const [connected, setConnected] = React.useState(wsHub.isConnected);
  React.useEffect(() => wsHub.onStatusChange(setConnected), []);
  return connected;
}

export function AppShell() {
  const connected = useWsConnected();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = NAV.findLast((n) =>
    n.to === "/" ? pathname === "/" : pathname.startsWith(n.to),
  );

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <Bot className="size-5" />
          <span className="text-sm font-semibold tracking-tight">Sparstrowgen</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const isActive =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-xs text-muted-foreground">
          v0.1.0 · local
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
          <h1 className="text-sm font-semibold">{active?.label ?? "Sparstrowgen"}</h1>
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              title={connected ? "Connected to core service" : "Core service unreachable"}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  connected ? "bg-emerald-500" : "bg-red-500 animate-pulse",
                )}
              />
              {connected ? "live" : "offline"}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
