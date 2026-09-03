"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { UpdateBanner } from "@web/components/update-banner";
import { DesktopAutoClaim } from "@web/components/desktop-auto-claim";
import { useLiveEvents } from "@web/lib/live-events";
import { useAttentionQueue } from "@web/api/hooks";
import { ThemeToggle } from "@sparstrow/ui/theme/theme-toggle";
import { Breadcrumbs } from "@web/components/layout/breadcrumbs";
import { CommandPalette } from "@web/components/layout/command-palette";
import { PinnedItems } from "@web/components/layout/pinned-items";
import { TabStrip } from "@web/components/layout/tab-strip";
import { WorkspaceSwitcher } from "@web/components/layout/workspace-switcher";
import { useWorkspaceTabs } from "@web/lib/workspace-tabs";
import { NAV_GROUPS, sectionMeta } from "@web/lib/nav-meta";
import type { KnowledgeIndexEntry } from "@web/lib/knowledge.server";

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
 *
 * `/pair` joins this list for the same reason: it's a focused, one-decision
 * confirm screen a browser lands on mid-`sparstrow pair`, not a page anyone
 * navigates to from inside the app -- the full sidebar/header chrome around
 * it would only compete with the one thing on screen that matters.
 */
export function AppShell({
  children,
  knowledgeIndex,
}: {
  children: React.ReactNode;
  knowledgeIndex: KnowledgeIndexEntry[];
}) {
  const pathname = usePathname() || "/";

  if (pathname === "/login" || pathname === "/connect" || pathname.startsWith("/auth/")) {
    return <div className="min-h-screen w-full bg-background text-foreground">{children}</div>;
  }

  return <AuthenticatedShell knowledgeIndex={knowledgeIndex}>{children}</AuthenticatedShell>;
}

function AuthenticatedShell({
  children,
  knowledgeIndex,
}: {
  children: React.ReactNode;
  knowledgeIndex: KnowledgeIndexEntry[];
}) {
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
                  {group.items.map((to) => {
                    const meta = sectionMeta(to);
                    const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
                    return (
                      <Link
                        key={to}
                        href={to}
                        title={meta.label}
                        // `isActive` was spent entirely on className until
                        // 2026-08-24, so the active destination was visible and
                        // silent. DESIGN.md §9 requires the landmark answer
                        // "where am I" for assistive tech too.
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                          collapsed && "md:justify-center md:px-0",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <meta.icon className="size-4" />
                        <span className={cn("flex-1", collapsed && "md:hidden")}>
                          {meta.label}
                        </span>
                        {to === "/" && attentionCount > 0 ? (
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
          v{process.env.NEXT_PUBLIC_APP_VERSION} · Next.js{" "}
          {process.env.NEXT_PUBLIC_NEXT_VERSION}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TabStrip knowledgeIndex={knowledgeIndex} />
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
            <Breadcrumbs knowledgeIndex={knowledgeIndex} />
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
        <DesktopAutoClaim />
        <UpdateBanner />
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
