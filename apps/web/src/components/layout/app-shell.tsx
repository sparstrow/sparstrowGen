"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Bot,
  Brain,
  CalendarClock,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessagesSquare,
  PackagePlus,
  Play,
  Puzzle,
  Search,
  Settings,
  TerminalSquare,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { UpdateBanner } from "@sparstrow/ui/components/update-banner";
import { useLiveEvents } from "@sparstrow/ui/lib/live-events";
import { useAttentionQueue } from "@sparstrow/ui/api/hooks";
import { ThemeToggle } from "@sparstrow/ui/theme/theme-toggle";
import { Breadcrumbs } from "@sparstrow/ui/components/layout/breadcrumbs";
import { CommandPalette } from "@sparstrow/ui/components/layout/command-palette";
import { PinnedItems } from "@sparstrow/ui/components/layout/pinned-items";
import { TabStrip } from "@sparstrow/ui/components/layout/tab-strip";
import { WorkspaceSwitcher } from "@sparstrow/ui/components/layout/workspace-switcher";
import { useWorkspaceTabs } from "@sparstrow/ui/lib/workspace-tabs";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_GROUPS: { heading: string | null; items: NavItem[] }[] = [
  {
    heading: null,
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    heading: "Personal",
    items: [
      { to: "/chat", label: "Chat", icon: MessagesSquare },
      { to: "/messages", label: "Inbox", icon: Inbox },
      { to: "/tasks", label: "Task Board", icon: ListChecks },
      { to: "/memory", label: "Memory", icon: Brain },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { to: "/agents", label: "Agents", icon: Bot },
      { to: "/teams", label: "Teams", icon: Users },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/runs", label: "Runs", icon: Play },
      { to: "/pipelines", label: "Pipelines", icon: Workflow },
      { to: "/schedule", label: "Schedule", icon: CalendarClock },
      { to: "/imports", label: "Imports", icon: PackagePlus },
    ],
  },
  {
    heading: "Configure",
    items: [
      { to: "/skills", label: "Skills", icon: Puzzle },
      { to: "/terminals", label: "Terminals", icon: TerminalSquare },
      { to: "/knowledge", label: "Knowledge Center", icon: BookOpen },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/**
 * M5: reports whichever transport this host actually installed — Realtime
 * here, `wsHub` in the local UI — via the same injected source `run-detail.tsx`
 * subscribes to. A chip claiming "live" while the real channel is dead is
 * worse than today's permanent-offline reading, because permanent-offline is
 * at least conservative; getting this wrong in the new direction is the trap.
 */
function useWsConnected(): boolean {
  const source = useLiveEvents();
  const [connected, setConnected] = React.useState(source.isConnected);
  React.useEffect(() => {
    setConnected(source.isConnected);
    return source.onStatusChange(setConnected);
  }, [source]);
  return connected;
}

/**
 * Auth routes render bare -- no sidebar, no header, no attention-queue polling.
 *
 * This split exists as two components rather than an early `return` inside one
 * because the shell below calls hooks. Bailing out mid-component made the hook
 * count depend on the URL, so the very first navigation after signing in
 * ("/login" -> "/") crashed with "rendered more hooks than during the previous
 * render" -- the one transition every single user makes.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";

  if (pathname === "/login" || pathname.startsWith("/auth/")) {
    return <div className="min-h-screen w-full bg-background text-foreground">{children}</div>;
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const connected = useWsConnected();
  const pathname = usePathname() || "/";
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  React.useEffect(() => setMobileNavOpen(false), [pathname]);

  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const collapsed = useWorkspaceTabs((s) => s.sidebarCollapsed);
  const attention = useAttentionQueue();
  const attentionCount = attention.data?.length ?? 0;

  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes("MAC"));
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200 md:static md:translate-x-0",
          collapsed && "md:w-14",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-1 border-b border-sidebar-border p-2">
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher collapsed={collapsed && !mobileNavOpen} />
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:text-sidebar-accent-foreground md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-2">
          <div className="px-2 pt-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Search (Ctrl K)"
              className={cn(
                "flex w-full items-center gap-2 rounded-md border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                collapsed && "md:justify-center md:border-transparent md:bg-transparent md:px-0 md:hover:bg-sidebar-accent/60",
              )}
            >
              <Search className="size-4" />
              <span className={cn("flex-1 text-left", collapsed && "md:hidden")}>Search…</span>
              <kbd
                className={cn(
                  "rounded border bg-muted px-1.5 font-mono text-[10px]",
                  collapsed && "md:hidden",
                )}
              >
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>
          </div>

          <PinnedItems collapsed={collapsed && !mobileNavOpen} />

          <nav className="space-y-4 px-2 pt-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.heading ?? "root"}>
                {group.heading && (
                  <p
                    className={cn(
                      "px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70",
                      collapsed && "md:hidden",
                    )}
                  >
                    {group.heading}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive =
                      item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                    return (
                      <Link
                        key={item.to}
                        href={item.to}
                        title={item.label}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                          collapsed && "md:justify-center md:px-0",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon className="size-4" />
                        <span className={cn("flex-1", collapsed && "md:hidden")}>
                          {item.label}
                        </span>
                        {item.to === "/" && attentionCount > 0 ? (
                          <span
                            className={cn(
                              "rounded-full bg-warning px-1.5 text-xs font-semibold text-white",
                              collapsed && "md:hidden",
                            )}
                          >
                            {attentionCount}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div
          className={cn(
            "border-t border-sidebar-border p-3 text-xs text-muted-foreground",
            collapsed && "md:hidden",
          )}
        >
          v0.1.0 · Next.js 15
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TabStrip />
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="-ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <Breadcrumbs />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {attentionCount > 0 ? (
              <Link href="/" title={`${attentionCount} item(s) need your attention`}>
                <Badge variant="warning" className="gap-1.5 rounded-full">
                  <span className="size-1.5 rounded-full bg-warning" />
                  {attentionCount} waiting
                </Badge>
              </Link>
            ) : null}
            <Badge
              variant={connected ? "success" : "destructive"}
              className="gap-1.5 rounded-full"
              title={connected ? "Connected to core service" : "Core service unreachable"}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connected ? "bg-success" : "bg-destructive animate-pulse",
                )}
              />
              {connected ? "live" : "offline"}
            </Badge>
            <ThemeToggle />
          </div>
        </header>
        <UpdateBanner />
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
