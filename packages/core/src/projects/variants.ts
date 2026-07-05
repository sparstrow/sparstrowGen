import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { slugify, type MemoryNote, type MemoryScopeKind, type Project, type Task } from "@sparstrow/shared";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { memoryNotes, projects } from "../db/schema.js";
import { logger } from "../logger.js";
import { indexer } from "../memory/indexer.js";
import { readNoteBody, writeNote } from "../memory/vault.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { createTask } from "../taskboard/service.js";

const nowIso = () => new Date().toISOString();
const rowToProject = (row: typeof projects.$inferSelect): Project => ({ ...row }) as unknown as Project;

const GIT_TIMEOUT_MS = 120_000;

function gitClone(fromDir: string, toDir: string): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      config.gitPath,
      ["clone", fromDir, toDir],
      { timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, _stdout, stderr) => resolve({ ok: !err, stderr: stderr ?? (err ? String(err) : "") }),
    );
  });
}

/**
 * P4-Q3: copy a base project's `project`-scoped memory notes into a new project
 * scope (physical copies). Client variants inherit the shared architecture memory
 * but then diverge in isolation — so custom rules for Clinic A never bleed into
 * the core product or Clinic B. Agent-scoped and global notes are NOT copied.
 */
export function copyProjectScopeNotes(fromSlug: string, toSlug: string): number {
  const db = getDb();
  const rows = db
    .select()
    .from(memoryNotes)
    .where(and(eq(memoryNotes.scope, "project"), eq(memoryNotes.projectSlug, fromSlug)))
    .all();
  const dirty: string[] = [];
  for (const row of rows) {
    try {
      const body = readNoteBody({ ...row, scope: row.scope as MemoryScopeKind } as MemoryNote);
      const copy = writeNote({
        title: row.title,
        content: body,
        scope: "project",
        projectSlug: toSlug,
        agentSlug: null,
        tags: row.tags,
        source: row.source,
      });
      dirty.push(copy.id);
    } catch (err) {
      logger.warn({ err, noteId: row.id, toSlug }, "variant note copy failed — skipped");
    }
  }
  if (dirty.length > 0) indexer.enqueue(dirty);
  return dirty.length;
}

export interface CreateVariantInput {
  name: string;
  /** Absolute path for the variant's cloned working dir (a sibling of the base). */
  rootDir: string;
}

/**
 * §7 "Create Client Variant": a true fork. Clones the base project's git repo into
 * a new sibling folder, copies the base's project-scope memory notes, and creates
 * a project row linked via parent_project_id. The variant keeps its own isolated
 * memory layer from there.
 */
export async function createClientVariant(baseProjectId: string, input: CreateVariantInput): Promise<Project> {
  const db = getDb();
  const base = db.select().from(projects).where(eq(projects.id, baseProjectId)).get();
  if (!base) throw new HttpError(404, `project not found: ${baseProjectId}`);
  if (!base.rootDir) throw new HttpError(400, "base project has no rootDir to fork from");

  const rootDir = input.rootDir.trim();
  if (!path.isAbsolute(rootDir)) throw new HttpError(400, "variant rootDir must be an absolute path");
  if (fs.existsSync(rootDir) && fs.readdirSync(rootDir).length > 0) {
    throw new HttpError(409, `variant target exists and is not empty: ${rootDir}`);
  }

  const slug = slugify(input.name);
  if (!slug) throw new HttpError(400, "variant name must contain at least one alphanumeric character");
  if (db.select().from(projects).where(eq(projects.slug, slug)).get()) {
    throw new HttpError(409, `a project named "${input.name}" already exists`);
  }

  // Local clone of the base repo (requires the base rootDir to be a git repo).
  fs.mkdirSync(path.dirname(rootDir), { recursive: true });
  const cloned = await gitClone(base.rootDir, rootDir);
  if (!cloned.ok) {
    throw new HttpError(
      502,
      `could not clone the base repo (is "${base.rootDir}" a git repository?): ${cloned.stderr.slice(0, 200)}`,
    );
  }

  const id = `prj_${nanoid(10)}`;
  const ts = nowIso();
  db.insert(projects)
    .values({
      id,
      name: input.name,
      slug,
      description: `Client variant of ${base.name}.`,
      rootDir,
      parentProjectId: base.id,
      // The variant tracks the base's upstream remote (P7 wires authed sync later).
      gitRemote: base.gitRemote,
      isSandbox: false,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  const copied = copyProjectScopeNotes(base.slug, slug);
  logger.info({ base: base.slug, variant: slug, copiedNotes: copied }, "created client variant");
  return rowToProject(db.select().from(projects).where(eq(projects.id, id)).get()!);
}

/**
 * §7 "Sync from Base": task-based downstream flow. Never auto-merges — it spawns a
 * review task so an agent reviews the base's upstream changes and applies them
 * deliberately, preserving the variant's custom business logic. Unassigned by
 * default (lands in the inbox for routing); optionally handed to an agent.
 */
export function syncFromBase(variantId: string, opts: { assignedAgentId?: string | null } = {}): Task {
  const db = getDb();
  const variant = db.select().from(projects).where(eq(projects.id, variantId)).get();
  if (!variant) throw new HttpError(404, `project not found: ${variantId}`);
  if (!variant.parentProjectId) {
    throw new HttpError(400, "this project is not a client variant (no base to sync from)");
  }
  const base = db.select().from(projects).where(eq(projects.id, variant.parentProjectId)).get();
  const baseName = base?.name ?? variant.parentProjectId;

  return createTask({
    title: `Sync "${variant.name}" from base "${baseName}"`,
    description: [
      `Review the upstream changes in the base project "${baseName}" and apply them to this client variant DELIBERATELY.`,
      "",
      "Do NOT blind-merge — this variant carries custom, client-specific business logic that must be preserved.",
      "1. Compare the base repo against this variant to find upstream changes.",
      "2. Decide which changes are safe/relevant to apply here.",
      "3. Apply them carefully, keeping the variant's customizations intact.",
      "4. Run typecheck/tests.",
      "5. Report what you merged and what you intentionally skipped and why.",
    ].join("\n"),
    projectId: variantId,
    assignedAgentId: opts.assignedAgentId ?? null,
    createdByType: "user",
  });
}
