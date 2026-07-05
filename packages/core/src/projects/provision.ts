import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { slugify, type Project, type ProjectProvision, type Run } from "@sparstrow/shared";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { projects, runs } from "../db/schema.js";
import { logger } from "../logger.js";
import { HttpError, runManager } from "../orchestrator/run-manager.js";
import { getSystemAgentId, PROJECT_INDEXER_SLUG } from "../agents/system-agents.js";

const nowIso = () => new Date().toISOString();
const rowToProject = (row: typeof projects.$inferSelect): Project => ({ ...row }) as unknown as Project;

const GIT_TIMEOUT_MS = 120_000; // clone can take a while
/** Only public, network git URLs — never file:// or ssh (SSRF / local-file read). */
const ALLOWED_CLONE_SCHEMES = new Set(["http:", "https:", "git:"]);

function runGit(args: string[], cwd?: string): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      config.gitPath,
      args,
      { timeout: GIT_TIMEOUT_MS, windowsHide: true, cwd, maxBuffer: 4 * 1024 * 1024 },
      (err, _stdout, stderr) => resolve({ ok: !err, stderr: stderr ?? (err ? String(err) : "") }),
    );
  });
}

/**
 * P4 §4 project provisioning — the three creation modes. Each performs its
 * filesystem action FIRST (validated, so a failed clone/mkdir never leaves an
 * orphan project row), then inserts the project, then kicks off a best-effort
 * background auto-index.
 */
export async function provisionProject(input: ProjectProvision): Promise<Project> {
  const rootDir = input.rootDir.trim();
  if (!path.isAbsolute(rootDir)) {
    throw new HttpError(400, "rootDir must be an absolute path");
  }
  let gitRemote: string | null = null;

  if (input.mode === "scratch") {
    if (fs.existsSync(rootDir) && fs.readdirSync(rootDir).length > 0) {
      throw new HttpError(409, `folder already exists and is not empty: ${rootDir}`);
    }
    fs.mkdirSync(rootDir, { recursive: true });
    if (input.gitInit) {
      const res = await runGit(["init"], rootDir);
      if (!res.ok) throw new HttpError(500, `git init failed: ${res.stderr.slice(0, 300)}`);
    }
  } else if (input.mode === "bind") {
    if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
      throw new HttpError(400, `folder does not exist: ${rootDir}`);
    }
  } else {
    // clone
    if (!input.gitUrl) throw new HttpError(400, "clone mode requires a gitUrl");
    let scheme: string;
    try {
      scheme = new URL(input.gitUrl).protocol;
    } catch {
      throw new HttpError(400, "gitUrl is not a valid URL");
    }
    if (!ALLOWED_CLONE_SCHEMES.has(scheme)) {
      throw new HttpError(400, `clone URL scheme not allowed: ${scheme} (use http(s)/git)`);
    }
    if (fs.existsSync(rootDir) && fs.readdirSync(rootDir).length > 0) {
      throw new HttpError(409, `clone target exists and is not empty: ${rootDir}`);
    }
    fs.mkdirSync(path.dirname(rootDir), { recursive: true });
    const res = await runGit(["clone", "--depth", "50", input.gitUrl, rootDir]);
    if (!res.ok) throw new HttpError(502, `git clone failed: ${res.stderr.slice(0, 300)}`);
    gitRemote = input.gitUrl;
  }

  const db = getDb();
  const id = `prj_${nanoid(10)}`;
  const ts = nowIso();
  const slug = slugify(input.name);
  if (!slug) throw new HttpError(400, "project name must contain at least one alphanumeric character");
  if (db.select().from(projects).where(eq(projects.slug, slug)).get()) {
    throw new HttpError(409, `a project named "${input.name}" already exists`);
  }
  db.insert(projects)
    .values({
      id,
      name: input.name,
      slug,
      description: input.description,
      rootDir,
      // §6: a sandbox import (bind/clone) isolates memory; scratch is never sandbox.
      isSandbox: input.mode !== "scratch" ? input.isSandbox : false,
      gitRemote,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  const project = rowToProject(db.select().from(projects).where(eq(projects.id, id)).get()!);

  // Best-effort auto-index (§2). Never blocks creation.
  try {
    runProjectIndex(project.id);
  } catch (err) {
    logger.warn({ err, projectId: project.id }, "auto-index kickoff failed (non-fatal)");
  }
  return project;
}

/**
 * §2 auto-index: spawn the Project Indexer over the project's rootDir to write
 * project-scoped summary notes. Background lane. Debounced — if an index run is
 * already queued/running for this project, do nothing (avoids the unthrottled
 * system-run risk the review flagged). Returns null when there's nothing to do.
 */
export function runProjectIndex(projectId: string): Run | null {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project?.rootDir) return null; // nothing to index without a bound directory
  const indexerId = getSystemAgentId(PROJECT_INDEXER_SLUG);
  if (!indexerId) {
    logger.warn("Project Indexer system agent not seeded — skipping auto-index");
    return null;
  }
  // Debounce: one in-flight index per project.
  const inflight = db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.agentId, indexerId),
        eq(runs.projectId, projectId),
        inArray(runs.status, ["queued", "running"]),
      ),
    )
    .get();
  if (inflight) return null;

  const prompt = [
    "Index this project's codebase into project memory.",
    "",
    "Your working directory is the project's root. Explore it with Glob/Grep/Read:",
    "- Read the README and manifest (package.json / pyproject.toml / go.mod / Cargo.toml) if present.",
    "- Identify the entry points, the top-level source layout, and how the project is built/run.",
    "- Note the language(s), framework(s), and key conventions.",
    "",
    "Write your findings as concise memory notes using the memory_save tool with scope \"project\" —",
    "one topic per note (e.g. \"Architecture overview\", \"How to run\", \"Key modules\"). Be factual and terse.",
    "Do NOT modify any files. Stop when the codebase is summarized.",
  ].join("\n");

  return runManager.createRun({
    agentId: indexerId,
    projectId,
    prompt,
    trigger: "system",
    triggerRef: "auto-index",
    lane: "background",
  });
}
