import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useProjects, useTeams } from "@/api/hooks";
import { getArticle } from "@/lib/knowledge";
import { NAV_META } from "@/lib/nav-meta";
import { shortId } from "@/lib/format";

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
    // `NAV_META` is the one source of truth for a section's label. This file
    // used to keep a second copy of the same map, which silently drifted the
    // moment a destination was added — M8's `/machines` shipped a breadcrumb
    // reading a lowercase "machines" for exactly that reason.
    const sectionLabel = NAV_META[section!]?.label ?? section!;
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
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="min-w-0 flex-nowrap gap-1 sm:gap-1">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <React.Fragment key={`${c.label}-${i}`}>
              {i > 0 && (
                <BreadcrumbSeparator className="shrink-0 text-muted-foreground/60" />
              )}
              <BreadcrumbItem className="min-w-0">
                {c.to && !last ? (
                  <BreadcrumbLink asChild className="shrink-0">
                    {/* exact: a parent crumb prefix-matches the current path, and
                        without this the router marks it aria-current="page" too —
                        two current-page markers in one breadcrumb trail. */}
                    <Link to={c.to} activeOptions={{ exact: true }}>
                      {c.label}
                    </Link>
                  </BreadcrumbLink>
                ) : last ? (
                  <BreadcrumbPage className="truncate font-semibold">
                    {c.label}
                  </BreadcrumbPage>
                ) : (
                  <span className="shrink-0">{c.label}</span>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
