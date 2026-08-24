import Link from "next/link";
import { GitPullRequest } from "lucide-react";
import type { ProjectPrGroup, PullRequestSummary } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrQueue } from "@web/api/hooks";
import { formatDate } from "@/lib/format";

/** One PR row — repo/branch context, checks-less GitHub link (the founder's #2 surface). */
export function PrRow({ pr }: { pr: PullRequestSummary }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 items-center gap-2">
        <GitPullRequest className="size-4 shrink-0 text-success" />
        <span className="text-xs text-muted-foreground">#{pr.number}</span>
        <span className="min-w-0 truncate text-sm font-medium">{pr.title}</span>
        {pr.draft && <Badge variant="secondary">draft</Badge>}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">
          {pr.head} → {pr.base}
        </span>
        <span>{formatDate(pr.createdAt)}</span>
      </div>
    </a>
  );
}

/** A profile badge shared across the PR surfaces. */
export function ProfileBadge({ profile }: { profile: "factory" | "production_app" }) {
  return (
    <Badge variant={profile === "production_app" ? "warning" : "secondary"}>
      {profile === "production_app" ? "production app" : "factory"}
    </Badge>
  );
}

/** A project's group of open PRs (used both in the aggregate queue and detail view). */
export function PrGroup({ group }: { group: ProjectPrGroup }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Link
          href={`/projects/${group.projectId}`}
          className="text-sm font-semibold hover:underline"
        >
          {group.projectName}
        </Link>
        <ProfileBadge profile={group.profile} />
        {group.repo && <span className="font-mono text-xs text-muted-foreground">{group.repo}</span>}
      </div>
      {group.error ? (
        <p className="px-1 text-xs text-muted-foreground">{group.error}</p>
      ) : group.pullRequests.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">No open pull requests.</p>
      ) : (
        <div className="space-y-1">
          {group.pullRequests.map((pr) => (
            <PrRow key={pr.number} pr={pr} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * P7 §6 — the aggregate PR queue on the Dashboard. Collapses to a single "connect
 * a token" prompt when no PAT is set; otherwise lists every GitHub-remote project's
 * open PRs so the founder's morning review never requires visiting N project pages.
 */
export function PrQueueCard() {
  const queue = usePrQueue();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <GitPullRequest className="size-4 text-muted-foreground" />
          Pull requests
          {queue.data && queue.data.totalOpen > 0 && (
            <Badge variant="secondary">{queue.data.totalOpen}</Badge>
          )}
        </CardTitle>
        <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
          Git settings
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {queue.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !queue.data ? (
          <p className="text-sm text-destructive">Could not load the PR queue.</p>
        ) : !queue.data.patConfigured ? (
          <p className="text-sm text-muted-foreground">
            No GitHub PAT configured — add one in{" "}
            <Link href="/settings" className="underline">
              Settings → Git
            </Link>{" "}
            to see open pull requests here.
          </p>
        ) : queue.data.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects with a GitHub remote yet.</p>
        ) : (
          queue.data.projects.map((group) => <PrGroup key={group.projectId} group={group} />)
        )}
      </CardContent>
    </Card>
  );
}
