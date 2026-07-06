import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ProjectDirective, ProjectDirectiveCreate, ProjectDirectiveUpdate } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { projectDirectives } from "../db/schema.js";

const nowIso = () => new Date().toISOString();
const rowToDirective = (row: typeof projectDirectives.$inferSelect): ProjectDirective =>
  ({ ...row }) as unknown as ProjectDirective;

/** All directives for a project, ascending by sort (display + injection order). */
export function listDirectives(projectId: string): ProjectDirective[] {
  return getDb()
    .select()
    .from(projectDirectives)
    .where(eq(projectDirectives.projectId, projectId))
    .orderBy(asc(projectDirectives.sort), asc(projectDirectives.createdAt))
    .all()
    .map(rowToDirective);
}

export function createDirective(projectId: string, input: ProjectDirectiveCreate): ProjectDirective {
  const db = getDb();
  const id = `pd_${nanoid(10)}`;
  const ts = nowIso();
  // Default sort = append to the end (max+1) so new directives don't jump order.
  let sort = input.sort;
  if (sort == null) {
    const rows = db
      .select({ sort: projectDirectives.sort })
      .from(projectDirectives)
      .where(eq(projectDirectives.projectId, projectId))
      .all();
    sort = rows.reduce((m, r) => Math.max(m, r.sort), -1) + 1;
  }
  db.insert(projectDirectives)
    .values({
      id,
      projectId,
      body: input.body,
      sort,
      enabled: input.enabled ?? true,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return rowToDirective(db.select().from(projectDirectives).where(eq(projectDirectives.id, id)).get()!);
}

export function updateDirective(
  projectId: string,
  id: string,
  patch: ProjectDirectiveUpdate,
): ProjectDirective | null {
  const db = getDb();
  const existing = db
    .select()
    .from(projectDirectives)
    .where(and(eq(projectDirectives.id, id), eq(projectDirectives.projectId, projectId)))
    .get();
  if (!existing) return null;
  db.update(projectDirectives)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(projectDirectives.id, id))
    .run();
  return rowToDirective(db.select().from(projectDirectives).where(eq(projectDirectives.id, id)).get()!);
}

export function deleteDirective(projectId: string, id: string): boolean {
  const res = getDb()
    .delete(projectDirectives)
    .where(and(eq(projectDirectives.id, id), eq(projectDirectives.projectId, projectId)))
    .run();
  return res.changes > 0;
}

/**
 * P4 §2 guaranteed-injection block. Enabled directives, in sort order, rendered as
 * operator standing rules. Assembled into the run prompt in run-manager BEFORE the
 * token-budgeted <memory> block and AFTER the preamble — so directives are never
 * trimmed and read as trusted operator instructions, not as DATA-labeled memory.
 * Returns "" when a project has no enabled directives (the prompt join drops it).
 */
export function buildDirectivesBlock(projectId: string | null): string {
  if (!projectId) return "";
  const enabled = listEnabledDirectives(projectId);
  if (enabled.length === 0) return "";
  const lines = [
    "## Project directives",
    "Standing rules for this project set by your operator. Follow them for the entire task; they take precedence over your general habits.",
    "",
    ...enabled.map((d, i) => `${i + 1}. ${d.body.trim()}`),
  ];
  return lines.join("\n");
}

/**
 * E1 (P5): the directives that buildDirectivesBlock injects, as structured
 * rows for the run's injected_memory provenance manifest. Same filter + order
 * as the block so the manifest can never disagree with the prompt.
 */
export function listEnabledDirectives(projectId: string): ProjectDirective[] {
  return listDirectives(projectId).filter((d) => d.enabled && d.body.trim().length > 0);
}
