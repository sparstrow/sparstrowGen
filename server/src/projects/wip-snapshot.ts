import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  SETTING_WIP_SNAPSHOT,
  SETTING_WIP_SNAPSHOT_KEEP,
  WIP_SNAPSHOT_REF_PREFIX,
  isWipSnapshotEnabled,
  resolveWipSnapshotKeep,
} from "@sparstrow/shared";
import { config } from "../config.js";
import { getDb, isDbOpen } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { logger } from "../logger.js";

/**
 * OQ-1 — protecting an agent's uncommitted work.
 *
 * When a run ends, the files it edited are sitting dirty in the project's
 * working tree. Nothing has committed them; a crash, a `git checkout .`, or the
 * next run overwriting the same files loses them silently. This module records
 * the tree as a real git commit under `refs/sparstrow/wip/<runId>` so it can
 * always be recovered.
 *
 * ## What it deliberately does NOT do
 *
 * It does not run `git commit`, `git add`, `git stash`, or create a branch, and
 * it never pushes. Those all mutate state the developer owns — the index, HEAD,
 * the branch list, the remote. Instead this drives plumbing against a THROWAWAY
 * index file:
 *
 *   GIT_INDEX_FILE=<tmp>  git read-tree HEAD    seed from the last commit
 *   GIT_INDEX_FILE=<tmp>  git add -A            stage the worktree (honours .gitignore)
 *   GIT_INDEX_FILE=<tmp>  git write-tree        → <tree>
 *                         git commit-tree       → <commit>, parented on HEAD
 *                         git update-ref refs/sparstrow/wip/<runId> <commit>
 *
 * `git status`, `git branch`, and HEAD read identically before and after. The
 * developer's own staged/unstaged split is untouched, because the real index is
 * never opened.
 *
 * ## No new worktree is created
 *
 * The agent edited files in `project.rootDir`. That path IS the worktree, and it
 * is already known — core passed it as the child's `cwd`. Creating a second
 * worktree would snapshot the wrong tree (a fresh checkout, without the agent's
 * edits) at the cost of a full copy on disk.
 *
 * Note that in a linked worktree (`git worktree add`), refs live in the shared
 * common dir, so snapshots taken from one worktree are visible from all of them.
 * That is what makes recovery work after the worktree itself is deleted.
 *
 * ## Recovery
 *
 *   git for-each-ref refs/sparstrow/wip/          list them
 *   git show --stat refs/sparstrow/wip/<runId>    inspect one
 *   git restore --source=refs/sparstrow/wip/<runId> -- <path>    take a file back
 */

const GIT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 4 * 1024 * 1024;

export interface WipSnapshot {
  /** The full ref, e.g. `refs/sparstrow/wip/abc123`. Null when nothing was written. */
  ref: string | null;
  commit: string | null;
  /** Why nothing was written — for the log, and for tests to assert on. */
  skipped:
    | "disabled"
    | "no-root-dir"
    | "not-a-repo"
    | "git-unavailable"
    | "no-changes"
    | "failed"
    | null;
}

const skip = (reason: NonNullable<WipSnapshot["skipped"]>): WipSnapshot => ({
  ref: null,
  commit: null,
  skipped: reason,
});

interface GitRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** null when git itself could not be spawned, as opposed to exiting non-zero. */
  code: number | null;
}

function runGit(rootDir: string, args: string[], env?: NodeJS.ProcessEnv): Promise<GitRun> {
  return new Promise((resolve) => {
    execFile(
      config.gitPath,
      ["-C", rootDir, ...args],
      {
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
        // An explicit env, not a spread of process.env: the snapshot must not
        // inherit a GIT_INDEX_FILE (or GIT_DIR) left over from whatever spawned
        // core, which would make it write into someone else's index.
        env: {
          PATH: process.env.PATH ?? "",
          ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
          ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
          ...(process.env.USERPROFILE ? { USERPROFILE: process.env.USERPROFILE } : {}),
          ...env,
        },
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? (err as { code: number }).code
            : err
              ? null
              : 0;
        resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "", code });
      },
    );
  });
}

/** Reads a settings row without assuming the DB is open (finalize can race shutdown). */
function readSetting(key: string): string | null {
  if (!isDbOpen()) return null;
  try {
    return getDb().select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
  } catch {
    return null;
  }
}

export function wipSnapshotEnabled(): boolean {
  return isWipSnapshotEnabled(readSetting(SETTING_WIP_SNAPSHOT));
}

export function wipSnapshotKeep(): number {
  return resolveWipSnapshotKeep(readSetting(SETTING_WIP_SNAPSHOT_KEEP));
}

export interface SnapshotInput {
  rootDir: string | null;
  runId: string;
  agentName?: string | null;
  status?: string | null;
}

/**
 * Records the working tree as `refs/sparstrow/wip/<runId>`. Never throws — a
 * backup that can break a run is worse than no backup, so every failure path
 * degrades to a logged skip.
 */
export async function snapshotWorkingTree(input: SnapshotInput): Promise<WipSnapshot> {
  const { rootDir, runId } = input;
  if (!wipSnapshotEnabled()) return skip("disabled");
  if (!rootDir) return skip("no-root-dir");
  if (!path.isAbsolute(rootDir) || !fs.existsSync(rootDir)) return skip("no-root-dir");

  const inside = await runGit(rootDir, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok) return skip(inside.code === null ? "git-unavailable" : "not-a-repo");

  // A repo with no commits yet has no HEAD; the snapshot is then parentless
  // rather than skipped, because a fresh repo is exactly where uncommitted work
  // is most exposed.
  const headR = await runGit(rootDir, ["rev-parse", "--verify", "HEAD"]);
  const head = headR.ok ? headR.stdout.trim() : null;

  const indexFile = path.join(
    config.tmpDir,
    `wip-index-${runId}-${crypto.randomBytes(4).toString("hex")}`,
  );
  fs.mkdirSync(config.tmpDir, { recursive: true });
  const withIndex = { GIT_INDEX_FILE: indexFile };

  try {
    if (head) {
      const read = await runGit(rootDir, ["read-tree", head], withIndex);
      if (!read.ok) return failed(runId, "read-tree", read);
    }
    // `add -A` honours .gitignore, so node_modules/.env/build output stay out.
    // Seeding from HEAD first is what keeps a tracked-but-since-ignored file in
    // the snapshot: ignore rules do not apply to paths already in the index.
    const add = await runGit(rootDir, ["add", "-A"], withIndex);
    if (!add.ok) return failed(runId, "add", add);

    const write = await runGit(rootDir, ["write-tree"], withIndex);
    if (!write.ok) return failed(runId, "write-tree", write);
    const tree = write.stdout.trim();

    // Compare trees rather than parsing `git status`: this is exact, and it is
    // the only check that correctly says "no changes" when the agent edited a
    // file and then reverted it.
    if (head) {
      const headTree = await runGit(rootDir, ["rev-parse", `${head}^{tree}`]);
      if (headTree.ok && headTree.stdout.trim() === tree) return skip("no-changes");
    }

    const message = [
      `sparstrow: wip snapshot for run ${runId}`,
      "",
      `agent: ${input.agentName ?? "unknown"}`,
      `run status: ${input.status ?? "unknown"}`,
      `taken: ${new Date().toISOString()}`,
      "",
      "Automatic backup of uncommitted work. Not a branch, never pushed.",
      `Recover with: git restore --source=${WIP_SNAPSHOT_REF_PREFIX}${runId} -- <path>`,
    ].join("\n");

    // commit-tree fails outright without an identity, and a developer machine
    // with no global user.email is common. Supply one rather than skip.
    const identity = {
      ...withIndex,
      GIT_AUTHOR_NAME: "Sparstrow Snapshot",
      GIT_AUTHOR_EMAIL: config.agentEmail,
      GIT_COMMITTER_NAME: "Sparstrow Snapshot",
      GIT_COMMITTER_EMAIL: config.agentEmail,
    };
    const commitArgs = ["commit-tree", tree, ...(head ? ["-p", head] : []), "-m", message];
    const commitR = await runGit(rootDir, commitArgs, identity);
    if (!commitR.ok) return failed(runId, "commit-tree", commitR);
    const commit = commitR.stdout.trim();

    const ref = `${WIP_SNAPSHOT_REF_PREFIX}${runId}`;
    const update = await runGit(rootDir, ["update-ref", ref, commit]);
    if (!update.ok) return failed(runId, "update-ref", update);

    logger.info(
      { runId, ref, commit: commit.slice(0, 10), rootDir },
      "wip snapshot written — recover with `git restore --source=<ref> -- <path>`",
    );
    await pruneSnapshots(rootDir, wipSnapshotKeep());
    return { ref, commit, skipped: null };
  } finally {
    fs.rmSync(indexFile, { force: true });
    // read-tree/add can leave a lock beside the index if git was killed mid-write.
    fs.rmSync(`${indexFile}.lock`, { force: true });
  }
}

function failed(runId: string, step: string, run: GitRun): WipSnapshot {
  logger.warn(
    { runId, step, code: run.code, stderr: run.stderr.trim().slice(0, 400) },
    "wip snapshot failed — the run is unaffected",
  );
  return skip("failed");
}

/**
 * Keeps the newest `keep` snapshots and deletes the rest. Without this, one ref
 * per run accumulates forever and every one of them pins its objects, so `git
 * gc` can never reclaim the space.
 */
export async function pruneSnapshots(rootDir: string, keep: number): Promise<number> {
  const listed = await runGit(rootDir, [
    "for-each-ref",
    "--format=%(refname)",
    "--sort=-creatordate",
    `${WIP_SNAPSHOT_REF_PREFIX}**`,
  ]);
  if (!listed.ok) return 0;
  const refs = listed.stdout
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r.startsWith(WIP_SNAPSHOT_REF_PREFIX));
  const doomed = refs.slice(keep);
  let deleted = 0;
  for (const ref of doomed) {
    const del = await runGit(rootDir, ["update-ref", "-d", ref]);
    if (del.ok) deleted++;
  }
  if (deleted > 0) logger.debug({ rootDir, deleted, keep }, "pruned old wip snapshots");
  return deleted;
}

export interface WipSnapshotEntry {
  ref: string;
  runId: string;
  commit: string;
  takenAt: string;
}

/** Lists a project's snapshots, newest first — the recovery surface. */
export async function listSnapshots(rootDir: string | null): Promise<WipSnapshotEntry[]> {
  if (!rootDir || !path.isAbsolute(rootDir) || !fs.existsSync(rootDir)) return [];
  const FS_SEP = "\x1f";
  const listed = await runGit(rootDir, [
    "for-each-ref",
    `--format=%(refname)${FS_SEP}%(objectname)${FS_SEP}%(creatordate:iso-strict)`,
    "--sort=-creatordate",
    `${WIP_SNAPSHOT_REF_PREFIX}**`,
  ]);
  if (!listed.ok) return [];
  return listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(WIP_SNAPSHOT_REF_PREFIX))
    .map((line) => {
      const [ref, commit, takenAt] = line.split(FS_SEP);
      return {
        ref: ref ?? "",
        runId: (ref ?? "").slice(WIP_SNAPSHOT_REF_PREFIX.length),
        commit: commit ?? "",
        takenAt: takenAt ?? "",
      };
    });
}
