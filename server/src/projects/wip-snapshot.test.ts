import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests drive REAL git against REAL repos, because the claim being tested
 * is "this does not disturb your repository" — only git can falsify that. The
 * cost is speed: each snapshot is ~5 process spawns, and under full-suite
 * parallelism on Windows that comfortably exceeds vitest's 5s default.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

/**
 * The settings table lives behind getDb(). These tests are about git behaviour,
 * not persistence, so the store is a plain map — and `isDbOpen: false` is itself
 * a case worth covering, because finalize can race core's shutdown.
 */
const store = new Map<string, string>();
let dbOpen = true;

vi.mock("../db/connection.js", () => ({
  isDbOpen: () => dbOpen,
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (pred: { key?: string }) => ({
          get: () => {
            const key = pred?.key;
            const value = key ? store.get(key) : undefined;
            return value == null ? undefined : { key, value };
          },
        }),
      }),
    }),
  }),
}));

// drizzle's eq() builds an SQL object; the fake above just needs the key back.
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (_col: unknown, value: string) => ({ key: value }),
}));

const {
  listSnapshots,
  pruneSnapshots,
  snapshotWorkingTree,
  wipSnapshotEnabled,
  wipSnapshotKeep,
} = await import("./wip-snapshot.js");
const { SETTING_WIP_SNAPSHOT, SETTING_WIP_SNAPSHOT_KEEP, WIP_SNAPSHOT_REF_PREFIX } = await import(
  "@sparstrow/shared"
);

/** Every git call in these tests, so a missing `git` skips rather than fails. */
let gitAvailable = true;
function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "", GIT_CONFIG_SYSTEM: "" },
  }).trim();
}

function makeRepo(withCommit = true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-wip-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@sparstrow.test");
  git(dir, "config", "user.name", "Test");
  if (withCommit) {
    fs.writeFileSync(path.join(dir, "tracked.txt"), "original\n");
    fs.writeFileSync(path.join(dir, ".gitignore"), "secret.env\nnode_modules/\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "initial");
  }
  return dir;
}

const dirs: string[] = [];
const repo = (withCommit = true) => {
  const d = makeRepo(withCommit);
  dirs.push(d);
  return d;
};

beforeEach(() => {
  store.clear();
  dbOpen = true;
  try {
    execFileSync("git", ["--version"], { windowsHide: true, stdio: "ignore" });
  } catch {
    gitAvailable = false;
  }
});

afterEach(() => {
  for (const d of dirs.splice(0)) {
    // Windows holds handles open briefly after a git process exits, so removal
    // can EPERM. Retry, and never let temp-dir cleanup fail a passing test.
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    } catch {
      /* the OS will reclaim it */
    }
  }
});

describe("wip snapshot settings", () => {
  it("defaults to ON, because the setting only pays out after something broke", () => {
    expect(wipSnapshotEnabled()).toBe(true);
  });

  it("is disabled only by an explicit falsey word", () => {
    for (const value of ["off", "false", "0", "no", "OFF", " Off "]) {
      store.set(SETTING_WIP_SNAPSHOT, value);
      expect(wipSnapshotEnabled()).toBe(false);
    }
    // A malformed value must not silently disable a data-protection feature.
    for (const value of ["on", "true", "yes", "banana", ""]) {
      store.set(SETTING_WIP_SNAPSHOT, value);
      expect(wipSnapshotEnabled()).toBe(true);
    }
  });

  it("falls back to defaults when the database is already closed", () => {
    store.set(SETTING_WIP_SNAPSHOT, "off");
    dbOpen = false;
    expect(wipSnapshotEnabled()).toBe(true);
    expect(wipSnapshotKeep()).toBe(50);
  });

  it("rejects a non-positive or unparseable retention", () => {
    for (const value of ["0", "-3", "abc", ""]) {
      store.set(SETTING_WIP_SNAPSHOT_KEEP, value);
      expect(wipSnapshotKeep()).toBe(50);
    }
    store.set(SETTING_WIP_SNAPSHOT_KEEP, "5");
    expect(wipSnapshotKeep()).toBe(5);
  });
});

describe("snapshotWorkingTree", () => {
  it("skips cleanly when disabled, without a rootDir, or outside a repo", async () => {
    if (!gitAvailable) return;
    store.set(SETTING_WIP_SNAPSHOT, "off");
    expect((await snapshotWorkingTree({ rootDir: repo(), runId: "r1" })).skipped).toBe("disabled");

    store.clear();
    expect((await snapshotWorkingTree({ rootDir: null, runId: "r1" })).skipped).toBe("no-root-dir");
    expect(
      (await snapshotWorkingTree({ rootDir: path.join(os.tmpdir(), "nope-xyz"), runId: "r1" }))
        .skipped,
    ).toBe("no-root-dir");

    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-plain-"));
    dirs.push(plain);
    expect((await snapshotWorkingTree({ rootDir: plain, runId: "r1" })).skipped).toBe("not-a-repo");
  });

  it("writes a ref holding the uncommitted work", async () => {
    if (!gitAvailable) return;
    const dir = repo();
    fs.writeFileSync(path.join(dir, "tracked.txt"), "AGENT EDIT\n");
    fs.writeFileSync(path.join(dir, "brand-new.txt"), "created by the agent\n");

    const snap = await snapshotWorkingTree({ rootDir: dir, runId: "run-abc", agentName: "coder" });
    expect(snap.skipped).toBeNull();
    expect(snap.ref).toBe(`${WIP_SNAPSHOT_REF_PREFIX}run-abc`);

    expect(git(dir, "show", `${snap.ref}:tracked.txt`)).toBe("AGENT EDIT");
    expect(git(dir, "show", `${snap.ref}:brand-new.txt`)).toBe("created by the agent");
    // Parented on HEAD, so `git log` on the snapshot shows the real history.
    expect(git(dir, "rev-parse", `${snap.ref}^`)).toBe(git(dir, "rev-parse", "HEAD"));
  });

  it("leaves HEAD, the branch list, the index and the working tree untouched", async () => {
    if (!gitAvailable) return;
    const dir = repo();
    fs.writeFileSync(path.join(dir, "tracked.txt"), "AGENT EDIT\n");
    fs.writeFileSync(path.join(dir, "staged-by-human.txt"), "hand-staged\n");
    git(dir, "add", "staged-by-human.txt");
    fs.writeFileSync(path.join(dir, "unstaged-by-human.txt"), "not staged\n");

    const before = {
      head: git(dir, "rev-parse", "HEAD"),
      branch: git(dir, "branch", "--show-current"),
      branches: git(dir, "branch", "--list"),
      status: git(dir, "status", "--porcelain"),
      tracked: fs.readFileSync(path.join(dir, "tracked.txt"), "utf8"),
    };

    await snapshotWorkingTree({ rootDir: dir, runId: "run-untouched" });

    expect(git(dir, "rev-parse", "HEAD")).toBe(before.head);
    expect(git(dir, "branch", "--show-current")).toBe(before.branch);
    expect(git(dir, "branch", "--list")).toBe(before.branches);
    // The human's staged/unstaged split survives verbatim — the real index was
    // never opened, only a throwaway one.
    expect(git(dir, "status", "--porcelain")).toBe(before.status);
    expect(fs.readFileSync(path.join(dir, "tracked.txt"), "utf8")).toBe(before.tracked);
  });

  it("does not create a branch, so nothing is pushed by a default `git push`", async () => {
    if (!gitAvailable) return;
    const dir = repo();
    fs.writeFileSync(path.join(dir, "tracked.txt"), "edit\n");
    await snapshotWorkingTree({ rootDir: dir, runId: "run-not-a-branch" });

    expect(git(dir, "for-each-ref", "--format=%(refname)", "refs/heads/")).toBe("refs/heads/main");
    expect(git(dir, "for-each-ref", "--format=%(refname)", `${WIP_SNAPSHOT_REF_PREFIX}**`)).toBe(
      `${WIP_SNAPSHOT_REF_PREFIX}run-not-a-branch`,
    );
  });

  it("honours .gitignore, so secrets and build output stay out of the snapshot", async () => {
    if (!gitAvailable) return;
    const dir = repo();
    fs.writeFileSync(path.join(dir, "secret.env"), "TOKEN=hunter2\n");
    fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "junk.js"), "// huge\n");
    fs.writeFileSync(path.join(dir, "real-work.txt"), "keep me\n");

    const snap = await snapshotWorkingTree({ rootDir: dir, runId: "run-ignore" });
    const files = git(dir, "ls-tree", "-r", "--name-only", snap.ref!).split("\n");
    expect(files).toContain("real-work.txt");
    expect(files).not.toContain("secret.env");
    expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
  });

  it("skips when the tree matches HEAD, including an edit the agent reverted", async () => {
    if (!gitAvailable) return;
    const dir = repo();
    expect((await snapshotWorkingTree({ rootDir: dir, runId: "clean" })).skipped).toBe("no-changes");

    fs.writeFileSync(path.join(dir, "tracked.txt"), "temporary\n");
    fs.writeFileSync(path.join(dir, "tracked.txt"), "original\n");
    expect((await snapshotWorkingTree({ rootDir: dir, runId: "reverted" })).skipped).toBe(
      "no-changes",
    );
  });

  it("snapshots a repo with no commits yet, where work is most exposed", async () => {
    if (!gitAvailable) return;
    const dir = repo(false);
    fs.writeFileSync(path.join(dir, "first.txt"), "before any commit\n");

    const snap = await snapshotWorkingTree({ rootDir: dir, runId: "run-fresh" });
    expect(snap.skipped).toBeNull();
    expect(git(dir, "show", `${snap.ref}:first.txt`)).toBe("before any commit");
    // Parentless, because there is no HEAD to parent it on.
    expect(git(dir, "rev-list", "--count", snap.ref!)).toBe("1");
  });

  it("leaves no temp index behind", async () => {
    if (!gitAvailable) return;
    const dir = repo();
    fs.writeFileSync(path.join(dir, "tracked.txt"), "edit\n");
    const { config } = await import("../config.js");
    await snapshotWorkingTree({ rootDir: dir, runId: "run-tmp" });
    const leftovers = fs.existsSync(config.tmpDir)
      ? fs.readdirSync(config.tmpDir).filter((f) => f.startsWith("wip-index-run-tmp"))
      : [];
    expect(leftovers).toEqual([]);
  });
});

describe("pruneSnapshots", () => {
  it("keeps the newest N and deletes the rest", async () => {
    if (!gitAvailable) return;
    const dir = repo();
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(dir, "tracked.txt"), `edit ${i}\n`);
      const snap = await snapshotWorkingTree({ rootDir: dir, runId: `run-${i}` });
      expect(snap.skipped).toBeNull();
    }
    expect((await listSnapshots(dir)).length).toBe(5);

    const deleted = await pruneSnapshots(dir, 2);
    expect(deleted).toBe(3);

    const left = await listSnapshots(dir);
    expect(left.length).toBe(2);
    // Newest survive. Snapshots inside one test share a commit timestamp, so
    // assert on the set rather than the order.
    expect(left.every((s) => s.ref.startsWith(WIP_SNAPSHOT_REF_PREFIX))).toBe(true);
    expect(left.every((s) => s.runId.startsWith("run-"))).toBe(true);
  });

  it("prunes automatically at the configured retention", async () => {
    if (!gitAvailable) return;
    store.set(SETTING_WIP_SNAPSHOT_KEEP, "3");
    const dir = repo();
    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(path.join(dir, "tracked.txt"), `edit ${i}\n`);
      await snapshotWorkingTree({ rootDir: dir, runId: `auto-${i}` });
    }
    expect((await listSnapshots(dir)).length).toBe(3);
  });
});

describe("listSnapshots", () => {
  it("returns an empty list rather than throwing for a bad path", async () => {
    expect(await listSnapshots(null)).toEqual([]);
    expect(await listSnapshots(path.join(os.tmpdir(), "definitely-not-here-xyz"))).toEqual([]);
  });

  it("reports the run id, commit and timestamp for each snapshot", async () => {
    if (!gitAvailable) return;
    const dir = repo();
    fs.writeFileSync(path.join(dir, "tracked.txt"), "edit\n");
    await snapshotWorkingTree({ rootDir: dir, runId: "run-listed" });

    const [entry] = await listSnapshots(dir);
    expect(entry?.runId).toBe("run-listed");
    expect(entry?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Number.isNaN(Date.parse(entry?.takenAt ?? ""))).toBe(false);
  });
});
