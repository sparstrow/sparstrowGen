import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PullRequestSummary } from "@sparstrow/shared";
import { closeDb, openDb } from "../db/connection.js";
import { projects } from "../db/schema.js";

// The PAT presence + the GitHub fetch are the two things pr-queue leans on; mock
// both so the queue logic (grouping, degrade, cache, profile mapping) is tested
// hermetically without a real secret store or network round-trip.
const hasSecret = vi.fn(() => false);
vi.mock("../secrets/secret-store.js", () => ({
  SECRET_GITHUB_PAT: "github.pat",
  hasSecret: () => hasSecret(),
}));

const listOpenPullRequests = vi.fn(async (_remote: string | null): Promise<PullRequestSummary[]> => []);
vi.mock("./git-ops.js", async (importActual) => {
  const actual = await importActual<typeof import("./git-ops.js")>();
  return { ...actual, listOpenPullRequests: (r: string | null) => listOpenPullRequests(r) };
});

const ts = "2026-01-01T00:00:00Z";

function seed() {
  const db = openDb(":memory:").db;
  db.insert(projects)
    .values([
      { id: "prj_ssh", name: "SSH Repo", slug: "ssh", gitRemote: "git@github.com:acme/ssh.git", createdAt: ts, updatedAt: ts },
      { id: "prj_https", name: "HTTPS Repo", slug: "https", gitRemote: "https://github.com/acme/https", executionProfile: "production_app", stagingBranch: "staging", createdAt: ts, updatedAt: ts },
      { id: "prj_gitlab", name: "GitLab Repo", slug: "gitlab", gitRemote: "https://gitlab.com/acme/x.git", createdAt: ts, updatedAt: ts },
      { id: "prj_none", name: "No Remote", slug: "none", gitRemote: null, createdAt: ts, updatedAt: ts },
    ])
    .run();
  return db;
}

const pr = (number: number): PullRequestSummary => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/acme/x/pull/${number}`,
  state: "open",
  head: "agent/x",
  base: "main",
  draft: false,
  createdAt: ts,
  author: "agent-sparstrow",
});

describe("pr-queue (P7 §6 aggregate PR queue)", () => {
  beforeEach(() => {
    closeDb();
    seed();
    hasSecret.mockReturnValue(false);
    listOpenPullRequests.mockReset();
    listOpenPullRequests.mockResolvedValue([]);
  });
  afterEach(() => closeDb());

  it("with no PAT: only GitHub-remote projects group, each degraded, no network call", async () => {
    const { getPrQueue, clearPrQueueCache } = await import("./pr-queue.js");
    clearPrQueueCache();
    const q = await getPrQueue();
    expect(q.patConfigured).toBe(false);
    // ssh + https are GitHub; gitlab + null are excluded.
    expect(q.projects.map((p) => p.projectId).sort()).toEqual(["prj_https", "prj_ssh"]);
    expect(q.totalOpen).toBe(0);
    for (const g of q.projects) {
      expect(g.error).toMatch(/PAT not configured/);
      expect(g.pullRequests).toEqual([]);
    }
    expect(listOpenPullRequests).not.toHaveBeenCalled();
  });

  it("maps execution profile and parses the repo owner/name", async () => {
    const { getPrQueue, clearPrQueueCache } = await import("./pr-queue.js");
    clearPrQueueCache();
    const q = await getPrQueue();
    const https = q.projects.find((p) => p.projectId === "prj_https")!;
    const ssh = q.projects.find((p) => p.projectId === "prj_ssh")!;
    expect(https.profile).toBe("production_app");
    expect(https.repo).toBe("acme/https");
    expect(ssh.profile).toBe("factory");
    expect(ssh.repo).toBe("acme/ssh");
  });

  it("with a PAT: fetches PRs and sums totalOpen", async () => {
    hasSecret.mockReturnValue(true);
    listOpenPullRequests.mockImplementation(async (remote) =>
      remote?.includes("ssh") ? [pr(1), pr(2)] : [pr(3)],
    );
    const { getPrQueue, clearPrQueueCache } = await import("./pr-queue.js");
    clearPrQueueCache();
    const q = await getPrQueue();
    expect(q.patConfigured).toBe(true);
    expect(q.totalOpen).toBe(3);
    expect(q.projects.every((g) => g.error === null)).toBe(true);
  });

  it("caches per-remote so a second call within the TTL does not re-fetch", async () => {
    hasSecret.mockReturnValue(true);
    listOpenPullRequests.mockResolvedValue([pr(1)]);
    const { getPrQueue, clearPrQueueCache } = await import("./pr-queue.js");
    clearPrQueueCache();
    await getPrQueue();
    const callsAfterFirst = listOpenPullRequests.mock.calls.length;
    await getPrQueue();
    expect(listOpenPullRequests.mock.calls.length).toBe(callsAfterFirst); // served from cache
    clearPrQueueCache();
    await getPrQueue();
    expect(listOpenPullRequests.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("getProjectPrs: non-GitHub remote degrades with a clear error", async () => {
    const { getProjectPrs } = await import("./pr-queue.js");
    const gitlab = await getProjectPrs("prj_gitlab");
    expect(gitlab?.repo).toBeNull();
    expect(gitlab?.error).toMatch(/no GitHub remote/);
    const none = await getProjectPrs("prj_none");
    expect(none?.error).toMatch(/no GitHub remote/);
  });

  it("getProjectPrs: unknown project id returns null", async () => {
    const { getProjectPrs } = await import("./pr-queue.js");
    expect(await getProjectPrs("prj_missing")).toBeNull();
  });
});
