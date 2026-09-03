import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExecutionProfile, PullRequestSummary } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { SECRET_GITHUB_PAT, getSecret } from "../secrets/secret-store.js";

/**
 * P7 git automation — the core-enforced blast-radius control. Agents produce
 * commits inside a project's rootDir with their per-agent identity; ALL of the
 * dangerous, outward-facing steps (branch discipline, push, PR) go through this
 * service, which is CORE-side and never a prompt instruction an agent could
 * argue its way past. The two invariants:
 *   1. Agents can only ever produce branches + PRs — a push to a protected ref
 *      (main, and staging for a production_app project) is refused here, not asked
 *      not to happen.
 *   2. The PAT never enters an agent's context — it is read from the encrypted
 *      secret store (outside dataDir) only inside these core functions, handed to
 *      git via GIT_ASKPASS (child env, never argv) and to GitHub via an
 *      Authorization header. Slice-1's allowlist already strips it from agent env.
 *
 * The service is deliberately shaped so the execution-spec Phase-2 swap
 * (orchestrator-mediated push where the agent has no network at all) is a config
 * flip: callers ask git-ops to push/PR; they never shell git-push themselves.
 */

// ── Pure guard rails (the security spine — unit-tested exhaustively) ──

export class GitOpsError extends Error {
  constructor(
    message: string,
    readonly code:
      | "protected_ref"
      | "no_remote"
      | "bad_remote"
      | "no_pat"
      | "git_failed"
      | "github_failed"
      | "no_root",
  ) {
    super(message);
    this.name = "GitOpsError";
  }
}

export interface ProfileContext {
  profile: ExecutionProfile;
  stagingBranch: string | null;
}

const DEFAULT_STAGING = "staging";
/** Refs that are protected regardless of profile (a repo's default trunk). */
const ALWAYS_PROTECTED = ["main", "master"];

/** normalize a ref for comparison: drop refs/heads/, origin/, surrounding slashes, lowercase. */
function normalizeRef(ref: string): string {
  return ref
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^[^/]+\/(?=.)/, (m) => (/^(origin|upstream)\/$/.test(m) ? "" : m))
    .trim()
    .toLowerCase();
}

/** The full set of push-protected branches for a project's profile. */
export function protectedRefsForProfile(ctx: ProfileContext): string[] {
  const refs = [...ALWAYS_PROTECTED];
  if (ctx.profile === "production_app") {
    refs.push(normalizeRef(ctx.stagingBranch ?? DEFAULT_STAGING));
  }
  return [...new Set(refs.map(normalizeRef))];
}

export function isProtectedRef(branch: string, ctx: ProfileContext): boolean {
  return protectedRefsForProfile(ctx).includes(normalizeRef(branch));
}

/** Throws GitOpsError('protected_ref') if a push to `branch` is not allowed. */
export function assertPushAllowed(branch: string, ctx: ProfileContext): void {
  if (isProtectedRef(branch, ctx)) {
    throw new GitOpsError(
      `refusing to push to protected ref "${branch}" (${ctx.profile}); agents may only push agent/* branches and open PRs`,
      "protected_ref",
    );
  }
}

/** The PR base branch for a profile: factory → main; production_app → staging. */
export function prTargetForProfile(ctx: ProfileContext): string {
  return ctx.profile === "production_app" ? (ctx.stagingBranch ?? DEFAULT_STAGING) : "main";
}

/**
 * Deterministic, safe branch name for a task: `agent/<slug>`. Lowercases,
 * collapses non-alphanumerics to single hyphens, trims, caps length, and always
 * carries the `agent/` prefix — so guard rails and CI author-checks can key off
 * it and a hostile task title can never craft `main` or inject shell/ref syntax.
 */
export function branchNameForTask(taskTitleOrSlug: string, suffix?: string): string {
  const base = taskTitleOrSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  const slug = base.length > 0 ? base : "task";
  const tail = suffix ? `-${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "";
  return `agent/${slug}${tail}`;
}

/**
 * Parse a GitHub remote (ssh or https, with or without a trailing .git) into
 * `{ owner, repo }`. Returns null for a non-GitHub or unparseable remote — the
 * caller degrades (no PR queue) rather than throwing.
 */
export function parseGitHubRemote(remote: string | null | undefined): { owner: string; repo: string } | null {
  if (!remote) return null;
  const trimmed = remote.trim();
  // git@github.com:owner/repo(.git)  |  ssh://git@github.com/owner/repo(.git)
  const ssh = trimmed.match(/^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
  // https://github.com/owner/repo(.git)  |  https://user@github.com/owner/repo
  const https = trimmed.match(/^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (https) return { owner: https[1]!, repo: https[2]! };
  return null;
}

/** Build the authenticated https clone/push URL for a GitHub repo (token via userinfo). */
export function authedRemoteUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

// ── IO: git process wrappers (core-side, shell:false) ──

const GIT_TIMEOUT_MS = 60_000;

interface GitRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

function runGit(
  rootDir: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<GitRun> {
  return new Promise((resolve) => {
    execFile(
      config.gitPath,
      ["-C", rootDir, ...args],
      {
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        // Core-side git identity; the PAT (if any) is added per-call via askpass env.
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...extraEnv },
      },
      (err, stdout, stderr) => {
        if (err) {
          const code = typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : null;
          resolve({ ok: false, stdout: stdout ?? "", stderr: stderr ?? "", code });
          return;
        }
        resolve({ ok: true, stdout: stdout ?? "", stderr: stderr ?? "", code: 0 });
      },
    );
  });
}

function requireRoot(rootDir: string | null): string {
  if (!rootDir || !path.isAbsolute(rootDir) || !fs.existsSync(rootDir)) {
    throw new GitOpsError(`project has no valid rootDir: ${rootDir ?? "(none)"}`, "no_root");
  }
  return rootDir;
}

/**
 * Create (or reset to) an `agent/*` branch off the current HEAD. Refuses a name
 * that normalizes onto a protected ref, so even a caller passing a raw branch
 * can't accidentally target trunk.
 */
export async function createAgentBranch(
  rootDir: string | null,
  branch: string,
  ctx: ProfileContext,
): Promise<{ branch: string }> {
  // Guard rails FIRST (fail fast, and testable without a repo on disk).
  if (!branch.startsWith("agent/")) {
    throw new GitOpsError(`agent branches must be namespaced agent/* (got "${branch}")`, "protected_ref");
  }
  assertPushAllowed(branch, ctx);
  const root = requireRoot(rootDir);
  const res = await runGit(root, ["checkout", "-B", branch]);
  if (!res.ok) throw new GitOpsError(`git checkout -B failed: ${res.stderr.trim()}`, "git_failed");
  return { branch };
}

/** Stage everything and commit. No-op-safe: returns committed=false when the tree is clean. */
export async function commitAll(
  rootDir: string | null,
  message: string,
): Promise<{ committed: boolean }> {
  const root = requireRoot(rootDir);
  await runGit(root, ["add", "-A"]);
  const status = await runGit(root, ["status", "--porcelain"]);
  if (status.ok && status.stdout.trim().length === 0) return { committed: false };
  const res = await runGit(root, ["commit", "-m", message]);
  if (!res.ok) throw new GitOpsError(`git commit failed: ${res.stderr.trim()}`, "git_failed");
  return { committed: true };
}

/**
 * Write a short-lived GIT_ASKPASS helper that echoes the PAT from the child's
 * env — so the token reaches git via the child ENV, never via argv (which any
 * local `ps` could read). Returns the script path + the env to pass; caller
 * removes the script after. Cross-platform (.cmd on Windows, .sh elsewhere).
 */
function makeAskpass(token: string): { scriptPath: string; env: Record<string, string>; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-git-"));
  const isWin = process.platform === "win32";
  const scriptPath = path.join(dir, isWin ? "askpass.cmd" : "askpass.sh");
  // Prompts are "Username for ..." then "Password for ...". Username = the token
  // (GitHub accepts the PAT as the username with any/empty password), Password =
  // empty. Echoing the token for both is simplest and works for token auth.
  if (isWin) {
    fs.writeFileSync(scriptPath, "@echo %SPARSTROW_GIT_TOKEN%\r\n");
  } else {
    fs.writeFileSync(scriptPath, '#!/bin/sh\necho "$SPARSTROW_GIT_TOKEN"\n', { mode: 0o700 });
  }
  return {
    scriptPath,
    env: { GIT_ASKPASS: scriptPath, SPARSTROW_GIT_TOKEN: token },
    cleanup: () => fs.rm(dir, { recursive: true, force: true }, () => {}),
  };
}

/**
 * Push an `agent/*` branch to the project's GitHub remote. Guard rails first
 * (never a protected ref); PAT sourced from the secret store and passed to git
 * via askpass env. When no PAT is set, falls back to the ambient remote auth
 * (ssh/credential-manager) — a factory repo pushing over its existing ssh remote
 * still works without a stored token.
 */
export async function pushAgentBranch(
  rootDir: string | null,
  branch: string,
  ctx: ProfileContext,
  opts: { remote?: string } = {},
): Promise<{ pushed: boolean; branch: string }> {
  assertPushAllowed(branch, ctx); // guard first
  const root = requireRoot(rootDir);
  const remote = opts.remote ?? "origin";
  const token = getSecret(SECRET_GITHUB_PAT);
  const askpass = token ? makeAskpass(token) : null;
  try {
    const res = await runGit(root, ["push", "-u", remote, `HEAD:${branch}`], askpass?.env ?? {});
    if (!res.ok) throw new GitOpsError(`git push failed: ${res.stderr.trim() || res.stdout.trim()}`, "git_failed");
    return { pushed: true, branch };
  } finally {
    askpass?.cleanup();
  }
}

// ── IO: GitHub REST API (core-side fetch with the PAT header) ──

function githubApiBase(): string {
  return (process.env.SPARSTROW_GITHUB_API ?? "https://api.github.com").replace(/\/+$/, "");
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Sparstrowgen",
  };
}

export interface OpenPrInput {
  remote: string | null;
  head: string; // the agent/* branch
  base: string; // PR target (from prTargetForProfile)
  title: string;
  body: string;
}

/** Open a PR via the GitHub API (graduates FACTORY-LOOP's manual compare-URL step). */
export async function openPullRequest(input: OpenPrInput): Promise<PullRequestSummary> {
  const repo = parseGitHubRemote(input.remote);
  if (!repo) throw new GitOpsError(`not a GitHub remote: ${input.remote ?? "(none)"}`, "bad_remote");
  const token = getSecret(SECRET_GITHUB_PAT);
  if (!token) throw new GitOpsError("no GitHub PAT configured (Settings → Git)", "no_pat");

  const res = await fetch(`${githubApiBase()}/repos/${repo.owner}/${repo.repo}/pulls`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ title: input.title, head: input.head, base: input.base, body: input.body }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GitOpsError(`GitHub PR creation failed (${res.status}): ${detail.slice(0, 300)}`, "github_failed");
  }
  return toPrSummary((await res.json()) as GhPr);
}

interface GhPr {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  created_at: string;
  head?: { ref?: string };
  base?: { ref?: string };
  user?: { login?: string };
}

function toPrSummary(pr: GhPr): PullRequestSummary {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state: pr.state,
    head: pr.head?.ref ?? "",
    base: pr.base?.ref ?? "",
    draft: pr.draft ?? false,
    createdAt: pr.created_at,
    author: pr.user?.login ?? null,
  };
}

/** List open PRs for a GitHub remote. Degrades to [] (never throws) so the queue is best-effort. */
export async function listOpenPullRequests(remote: string | null): Promise<PullRequestSummary[]> {
  const repo = parseGitHubRemote(remote);
  if (!repo) return [];
  const token = getSecret(SECRET_GITHUB_PAT);
  if (!token) return [];
  try {
    const res = await fetch(
      `${githubApiBase()}/repos/${repo.owner}/${repo.repo}/pulls?state=open&per_page=50`,
      { headers: githubHeaders(token) },
    );
    if (!res.ok) {
      logger.warn({ status: res.status, owner: repo.owner, repo: repo.repo }, "GitHub PR list failed");
      return [];
    }
    return ((await res.json()) as GhPr[]).map(toPrSummary);
  } catch (err) {
    logger.warn({ err }, "GitHub PR list threw");
    return [];
  }
}
