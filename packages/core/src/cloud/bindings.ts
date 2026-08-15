import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ProjectBinding, ProjectClonePayload } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { projects } from "../db/schema.js";
import { logger } from "../logger.js";
import { CloudAuthError, cloudFetch, isPaired } from "./client.js";
import type { ResolutionFailure } from "./resolve.js";

const run = promisify(execFile);

/**
 * M4 — "here is what I actually have on disk", and "fetch me a copy".
 *
 * This is what makes enqueue-time project checking possible. Until a machine
 * reports, `runtime_projects` is empty, every project looks unavailable
 * everywhere, and `start_run` refuses every run that names one — a failure that
 * looks like a dispatch bug rather than a missing report.
 */

/**
 * Re-report on a slow timer, so a binding heals itself.
 *
 * Found in M4 verification: the daemon marks a binding `missing` when preflight
 * fails, and the cloud then stops choosing this machine for that project —
 * correctly. But if the developer simply puts the directory back, nothing
 * re-reports, so it stays `missing` until core restarts. "I moved the folder
 * back and it still says the machine doesn't have it" is a bad place to leave
 * someone, and the fix that existed (relink from the UI, or restart) requires
 * knowing that either is necessary.
 *
 * Ten minutes, not the 30-second heartbeat: this reads the filesystem for every
 * project and nothing about it is urgent. A machine that regains a directory
 * becomes usable for it within one interval, which is far better than never.
 */
const BINDING_REPORT_INTERVAL_MS = 10 * 60_000;
let bindingTimer: NodeJS.Timeout | null = null;

export function startBindingReporter(): void {
  if (bindingTimer) return;
  void reportBindings().catch(() => undefined);
  bindingTimer = setInterval(() => {
    void reportBindings().catch(() => undefined);
  }, BINDING_REPORT_INTERVAL_MS);
  // Same rule as the heartbeat: a timer that keeps Node alive turns a clean
  // exit into a hang.
  bindingTimer.unref();
}

export function stopBindingReporter(): void {
  if (!bindingTimer) return;
  clearInterval(bindingTimer);
  bindingTimer = null;
}

/** Report every local project that has a directory. Best-effort, never fatal. */
export async function reportBindings(): Promise<void> {
  if (!isPaired()) return;

  const rows = getDb().select().from(projects).all();

  const bindings: ProjectBinding[] = rows
    // A project with no rootDir is a board entry with no bytes here. Reporting
    // it as `bound` would make the cloud pick this machine and then fail
    // preflight — exactly the round trip the enqueue-side check exists to avoid.
    .filter((p) => !!p.rootDir)
    .map((p) => ({
      projectSlug: p.slug,
      localPath: p.rootDir!,
      state: fs.existsSync(p.rootDir!) ? "bound" : "missing",
      detail: fs.existsSync(p.rootDir!) ? null : "the directory is not there",
    }));

  try {
    const result = await cloudFetch<{ recorded: number; unknownSlugs: string[] }>(
      "/projects/bindings",
      { body: { bindings }, retries: 1 },
    );
    if (result.unknownSlugs?.length) {
      // Logged once per report rather than swallowed: a slug the workspace does
      // not have is usually a project created locally that nobody added to the
      // board, and the fix is a human one.
      logger.info(
        { slugs: result.unknownSlugs },
        "some local projects are not in this workspace — they cannot be targeted from the browser",
      );
    }
  } catch (err) {
    if (err instanceof CloudAuthError) throw err;
    // A machine that cannot reach the control plane still runs local work.
    logger.debug({ err }, "could not report project bindings — will retry on the next report");
  }
}

/**
 * `project.clone` — fetch a project this machine does not have.
 *
 * Kept deliberately small: `git clone`, a local project row, a binding report.
 * No progress streaming — progress is a transcript problem and transcripts are
 * M5 — and no shallow/branch options, because the four recovery actions this
 * serves are about getting the bytes here at all.
 */
export async function cloneProject(
  payload: ProjectClonePayload,
): Promise<{ ok: true } | { ok: false; failure: ResolutionFailure }> {
  const { gitRemote, localPath, projectSlug } = payload;

  if (!gitRemote) {
    return {
      ok: false,
      failure: { reason: "clone_failed", error: "That project has no git remote to clone from." },
    };
  }
  if (!localPath || !path.isAbsolute(localPath)) {
    return {
      ok: false,
      failure: { reason: "clone_failed", error: "A clone needs an absolute path on this machine." },
    };
  }

  // Refuse a non-empty directory rather than cloning into it. A remote-triggered
  // write to an arbitrary local path is the security consequence the plan
  // accepted knowingly; bounding it where it is cheap to bound is the least
  // this can do. `git clone` would refuse too, but with a worse message and
  // after the network round trip.
  if (fs.existsSync(localPath) && fs.readdirSync(localPath).length > 0) {
    return {
      ok: false,
      failure: {
        reason: "clone_failed",
        error: `${localPath} already exists and is not empty. Choose an empty directory, or relink instead of cloning.`,
      },
    };
  }

  try {
    await report(projectSlug, localPath, "cloning");
    fs.mkdirSync(localPath, { recursive: true });
    // execFile, not a shell: the remote and the path are values, and a shell
    // would make both injectable by whoever can enqueue a command.
    await run("git", ["clone", gitRemote, localPath], { timeout: 15 * 60_000 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await report(projectSlug, localPath, "error", message);
    return { ok: false, failure: { reason: "clone_failed", error: message } };
  }

  upsertLocalProject(projectSlug, localPath, gitRemote);
  await reportBindings();
  return { ok: true };
}

/** A cloned project needs a local row, or nothing can resolve it afterwards. */
function upsertLocalProject(slug: string, rootDir: string, gitRemote: string): void {
  const db = getDb();
  const existing = db.select().from(projects).where(eq(projects.slug, slug)).get();
  const now = new Date().toISOString();

  if (existing) {
    db.update(projects).set({ rootDir, gitRemote, updatedAt: now }).where(eq(projects.id, existing.id)).run();
    return;
  }

  db.insert(projects)
    .values({
      id: `prj_${nanoid(10)}`,
      // `name` is UNIQUE locally; the slug is the only thing guaranteed unique
      // on both sides, so it seeds the name and the owner can rename later.
      name: slug,
      slug,
      rootDir,
      gitRemote,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

async function report(
  projectSlug: string,
  localPath: string,
  state: ProjectBinding["state"],
  detail?: string,
): Promise<void> {
  try {
    await cloudFetch("/projects/bindings", {
      body: { bindings: [{ projectSlug, localPath, state, detail: detail ?? null }] },
      retries: 0,
    });
  } catch {
    // A progress report is not worth failing the clone over.
  }
}
