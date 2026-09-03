import { eq } from "drizzle-orm";
import type { ProjectPrGroup, PrQueue, PullRequestSummary } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { projects } from "../db/schema.js";
import { SECRET_GITHUB_PAT, hasSecret } from "../secrets/secret-store.js";
import { listOpenPullRequests, parseGitHubRemote } from "./git-ops.js";

/**
 * P7 UI §6 — the aggregate PR queue. The founder's #2 morning surface must not
 * require visiting N project pages, so this collects every project's open PRs in
 * one call. GitHub is rate-limited and slow, so results are cached per-remote
 * (60s) and fetched in parallel; the whole thing degrades to empty groups rather
 * than throwing, and reports `patConfigured` so the UI can prompt for a token.
 */

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; prs: PullRequestSummary[] }>();

/** Invalidate the per-remote cache — called when the PAT changes. */
export function clearPrQueueCache(): void {
  cache.clear();
}

async function cachedList(remote: string, nowMs: number): Promise<PullRequestSummary[]> {
  const hit = cache.get(remote);
  if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.prs;
  const prs = await listOpenPullRequests(remote);
  cache.set(remote, { at: nowMs, prs });
  return prs;
}

export async function getPrQueue(): Promise<PrQueue> {
  const patConfigured = hasSecret(SECRET_GITHUB_PAT);
  const nowMs = Date.now();
  const rows = getDb().select().from(projects).orderBy(projects.name).all();

  const githubProjects = rows.filter((p) => parseGitHubRemote(p.gitRemote) !== null);
  const groups: ProjectPrGroup[] = await Promise.all(
    githubProjects.map(async (p): Promise<ProjectPrGroup> => {
      const parsed = parseGitHubRemote(p.gitRemote)!;
      const prs = patConfigured ? await cachedList(p.gitRemote!, nowMs) : [];
      return {
        projectId: p.id,
        projectName: p.name,
        profile: p.executionProfile === "production_app" ? "production_app" : "factory",
        remote: p.gitRemote,
        repo: `${parsed.owner}/${parsed.repo}`,
        pullRequests: prs,
        error: patConfigured ? null : "GitHub PAT not configured",
      };
    }),
  );

  return {
    patConfigured,
    projects: groups,
    totalOpen: groups.reduce((n, g) => n + g.pullRequests.length, 0),
  };
}

/** Per-project PR list (the filtered view on project detail). */
export async function getProjectPrs(projectId: string): Promise<ProjectPrGroup | null> {
  const p = getDb().select().from(projects).where(eq(projects.id, projectId)).get();
  if (!p) return null;
  const parsed = parseGitHubRemote(p.gitRemote);
  if (!parsed) {
    return {
      projectId: p.id,
      projectName: p.name,
      profile: p.executionProfile === "production_app" ? "production_app" : "factory",
      remote: p.gitRemote,
      repo: null,
      pullRequests: [],
      error: "project has no GitHub remote",
    };
  }
  const patConfigured = hasSecret(SECRET_GITHUB_PAT);
  const prs = patConfigured ? await cachedList(p.gitRemote!, Date.now()) : [];
  return {
    projectId: p.id,
    projectName: p.name,
    profile: p.executionProfile === "production_app" ? "production_app" : "factory",
    remote: p.gitRemote,
    repo: `${parsed.owner}/${parsed.repo}`,
    pullRequests: prs,
    error: patConfigured ? null : "GitHub PAT not configured",
  };
}
