import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useProjects, useTeams } from "@web/api/hooks";
import { NAV_META } from "@web/lib/nav-meta";
import type { KnowledgeIndexEntry } from "@web/lib/knowledge.server";
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
export function Breadcrumbs({ knowledgeIndex }: { knowledgeIndex: KnowledgeIndexEntry[] }) {
  const pathname = usePathname();
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
        out.push({
          label: knowledgeIndex.find((a) => a.slug === rest[0])?.title ?? rest[0]!,
        });
        break;
      case "tasks":
        if (rest[0] === "goals" && rest[1]) out.push({ label: `Goal ${shortId(rest[1])}` });
        else out.push({ label: rest.join("/") });
        break;
      default:
        out.push({ label: rest.join("/") });
    }
    return out;
  }, [pathname, projects.data, teams.data, knowledgeIndex]);

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
                    {/* No aria-current here, deliberately. Only the last crumb
                        is the current page and it renders as BreadcrumbPage, so
                        the trail carries exactly one marker. The old router set
                        aria-current on any prefix match, which is why this used
                        to need an explicit exact-match opt-out. */}
                    <Link href={c.to}>
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
