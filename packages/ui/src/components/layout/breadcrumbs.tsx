import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useProjects, useTeams } from "@/api/hooks";
import { getArticle } from "@/lib/knowledge";
import { shortId } from "@/lib/format";

const SECTION_LABELS: Record<string, string> = {
  agents: "Agents",
  imports: "Imports",
  teams: "Teams",
  projects: "Projects",
  tasks: "Task Board",
  chat: "Chat",
  messages: "Inbox",
  runs: "Runs",
  pipelines: "Pipelines",
  schedule: "Schedule",
  memory: "Memory",
  skills: "Skills",
  knowledge: "Knowledge Center",
  terminals: "Terminals",
  settings: "Settings",
};

interface Crumb {
  label: string;
  to?: string;
}

/**
 * Dynamic breadcrumbs derived from the router's current pathname. Detail
 * segments resolve to real entity names (Projects / My App) via the cached
 * list queries — no extra fetches.
 */
export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const projects = useProjects();
  const teams = useTeams();

  const crumbs = React.useMemo<Crumb[]>(() => {
    const segs = pathname.split("/").filter(Boolean);
    if (segs.length === 0) return [{ label: "Dashboard" }];

    const [section, ...rest] = segs;
    const out: Crumb[] = [];
    const sectionLabel = SECTION_LABELS[section!] ?? section!;
    out.push({ label: sectionLabel, to: rest.length > 0 ? `/${section}` : undefined });

    if (rest.length === 0) return out;

    switch (section) {
      case "projects":
        out.push({
          label: projects.data?.find((p) => p.id === rest[0])?.name ?? shortId(rest[0]!),
        });
        break;
      case "teams":
        out.push({
          label: teams.data?.find((t) => t.id === rest[0])?.name ?? shortId(rest[0]!),
        });
        break;
      case "runs":
        out.push({ label: shortId(rest[0]!) });
        break;
      case "agents":
        out.push({ label: rest[0] === "create" ? "Agent Creator" : shortId(rest[0]!) });
        break;
      case "knowledge":
        out.push({ label: getArticle(rest[0]!)?.title ?? rest[0]! });
        break;
      case "tasks":
        if (rest[0] === "goals" && rest[1]) out.push({ label: `Goal ${shortId(rest[1])}` });
        else out.push({ label: rest.join("/") });
        break;
      default:
        out.push({ label: rest.join("/") });
    }
    return out;
  }, [pathname, projects.data, teams.data]);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <React.Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
            {c.to && !last ? (
              <Link
                to={c.to}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={
                  last ? "truncate font-semibold" : "shrink-0 text-muted-foreground"
                }
                aria-current={last ? "page" : undefined}
              >
                {c.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
