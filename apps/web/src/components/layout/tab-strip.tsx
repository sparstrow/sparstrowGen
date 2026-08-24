import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, PanelLeft, Plus, X } from "lucide-react";
import { useProjects, useTeams } from "@/api/hooks";
import { getArticle } from "@/lib/knowledge";
import { shortId } from "@/lib/format";
import { sectionMeta } from "@/lib/nav-meta";
import { useWorkspaceTabs, type WorkspaceTab } from "@/lib/workspace-tabs";
import { cn } from "@/lib/utils";

/** Human label for a tab: the section, sharpened to the entity for detail paths. */
function useTabLabel(path: string): string {
  const projects = useProjects();
  const teams = useTeams();
  const pathname = path.split("?")[0]!;
  const segs = pathname.split("/").filter(Boolean);
  const meta = sectionMeta(pathname);
  if (segs.length < 2 || pathname === "/agents/create") return meta.label;
  const [section, id] = segs;
  switch (section) {
    case "projects":
      return projects.data?.find((p) => p.id === id)?.name ?? meta.label;
    case "teams":
      return teams.data?.find((t) => t.id === id)?.name ?? meta.label;
    case "runs":
      return `Run ${shortId(id!)}`;
    case "knowledge":
      return getArticle(id!)?.title ?? meta.label;
    default:
      return meta.label;
  }
}

function Tab({
  tab,
  active,
  closable,
  onActivate,
  onClose,
}: {
  tab: WorkspaceTab;
  active: boolean;
  closable: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const label = useTabLabel(tab.path);
  const Icon = sectionMeta(tab.path).icon;
  return (
    <div
      className={cn(
        "group flex h-full max-w-44 shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 text-sm transition-colors",
        active
          ? "border-border bg-background font-medium"
          : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onActivate}
        className="flex min-w-0 flex-1 items-center gap-1.5 focus:outline-none"
        title={label}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {closable && (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label} tab`}
          className={cn(
            "rounded p-0.5 text-muted-foreground/60 transition-opacity hover:bg-muted hover:text-foreground focus:outline-none",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Multica-style workspace tab strip: every open tab is an independent surface
 * inside the app; navigation follows the active tab, + opens another one.
 * Desktop-only (hidden below md, where the drawer nav takes over).
 */
export function TabStrip() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const currentPath = pathname + (qs ? `?${qs}` : "");
  const { tabs, activeId, syncActivePath, activate, openTab, closeTab, toggleSidebar } =
    useWorkspaceTabs();

  // Any in-app navigation belongs to the active tab.
  React.useEffect(() => {
    syncActivePath(currentPath);
  }, [currentPath, syncActivePath]);

  const go = (path: string) => router.push(path);

  return (
    <div className="hidden h-10 shrink-0 items-end gap-1 border-b bg-muted/40 px-2 pt-1.5 md:flex">
      <div className="mb-0.5 flex items-center gap-0.5 self-center">
        <button
          type="button"
          onClick={toggleSidebar}
          title="Toggle sidebar"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          title="Back"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
        >
          <ArrowLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => router.forward()}
          title="Forward"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>

      <div className="flex h-full min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Tab
            key={t.id}
            tab={t}
            active={t.id === activeId}
            closable={tabs.length > 1}
            onActivate={() => {
              const tab = activate(t.id);
              if (tab) go(tab.path);
            }}
            onClose={() => {
              const next = closeTab(t.id);
              if (next) go(next.path);
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            openTab("/");
            go("/");
          }}
          title="New tab"
          aria-label="New tab"
          className="mb-1 shrink-0 self-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
