import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ProjectGitState } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * P4 §1 git awareness — READ-ONLY. Surfaces branch/dirty/ahead-behind/recent
 * commits for a project's rootDir so the UI always shows the state of the code
 * agents are touching. Writes are P7. Every command runs via execFile('git',
 * ['-C', rootDir, ...]) with shell:false, so an untrusted rootDir path can never
 * inject a shell command; failures degrade to a state object, never a throw/500.
 */

const GIT_TIMEOUT_MS = 10_000;
const RECENT_COMMITS = 5;
/** ASCII unit/record separators keep commit fields/rows unambiguous. */
const FS = "\x1f";
const RS = "\x1e";

interface GitRun {
  ok: boolean;
  stdout: string;
  code: number | null;
}

function runGit(rootDir: string, args: string[]): Promise<GitRun> {
  return new Promise((resolve) => {
    execFile(
      config.gitPath,
      ["-C", rootDir, ...args],
      { timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          const code = typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : null;
          resolve({ ok: false, stdout: stdout ?? "", code });
          return;
        }
        resolve({ ok: true, stdout: stdout ?? "", code: 0 });
      },
    );
  });
}

function emptyState(over: Partial<ProjectGitState>): ProjectGitState {
  return {
    available: true,
    isRepo: false,
    branch: null,
    dirty: false,
    ahead: 0,
    behind: 0,
    changedFiles: 0,
    recentCommits: [],
    error: null,
    ...over,
  };
}

export async function getProjectGitState(rootDir: string | null): Promise<ProjectGitState> {
  if (!rootDir) return emptyState({ error: "project has no rootDir" });
  if (!path.isAbsolute(rootDir) || !fs.existsSync(rootDir)) {
    return emptyState({ error: `rootDir does not exist: ${rootDir}` });
  }

  // Is git installed + is this a work tree? A single call answers both.
  const inside = await runGit(rootDir, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok) {
    // Distinguish "git missing" (spawn error, code null) from "not a repo".
    if (inside.code === null) {
      logger.debug({ rootDir }, "git not available for project git-state");
      return emptyState({ available: false, error: "git is not available on this host" });
    }
    return emptyState({ error: "not a git repository" });
  }

  const [branchR, statusR, commitsR] = await Promise.all([
    runGit(rootDir, ["branch", "--show-current"]),
    runGit(rootDir, ["status", "--porcelain"]),
    runGit(rootDir, [
      "log",
      `-n`,
      String(RECENT_COMMITS),
      `--format=%H${FS}%s${FS}%an${FS}%aI${RS}`,
    ]),
  ]);

  const branch = branchR.ok ? branchR.stdout.trim() || null : null;
  const changedFiles = statusR.ok
    ? statusR.stdout.split("\n").filter((l) => l.trim().length > 0).length
    : 0;

  // ahead/behind vs upstream — absent when no tracking branch (fresh repo/branch).
  let ahead = 0;
  let behind = 0;
  const counts = await runGit(rootDir, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]);
  if (counts.ok) {
    const [b, a] = counts.stdout.trim().split(/\s+/);
    behind = Number.parseInt(b ?? "0", 10) || 0;
    ahead = Number.parseInt(a ?? "0", 10) || 0;
  }

  const recentCommits = commitsR.ok
    ? commitsR.stdout
        .split(RS)
        .map((row) => row.trim())
        .filter((row) => row.length > 0)
        .map((row) => {
          const [hash, subject, author, date] = row.split(FS);
          return {
            hash: (hash ?? "").slice(0, 10),
            subject: subject ?? "",
            author: author ?? "",
            date: date ?? "",
          };
        })
    : [];

  return {
    available: true,
    isRepo: true,
    branch,
    dirty: changedFiles > 0,
    ahead,
    behind,
    changedFiles,
    recentCommits,
    error: null,
  };
}
