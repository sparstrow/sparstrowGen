import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/connection.js";
import { agentInstances, memoryNotes } from "../db/schema.js";
import { logger } from "../logger.js";
import { indexer } from "../memory/indexer.js";
import { readNoteBody, writeNote } from "../memory/vault.js";
import type { MemoryNote, MemoryScopeKind } from "@sparstrow/shared";

/**
 * P3 agent instances (locked D5): (template, project) deployments created lazily
 * on the first run of a template inside a project. The instance is the identity
 * `agent:self` memory resolves to (vault dir agents/<template>/<project>/) and the
 * key busy-tracking uses (P3-Q5). Everything else stays template-keyed — see
 * docs/archive/fable-handoff/P3-SEAM-TABLE.md for the full seam audit.
 */

/**
 * Busy-set key (P3-Q5 LOCKED): one concurrent run per (template, project) — the
 * same template may run in two projects at once (the global cap still bounds
 * total). A run without a project keys on the template itself.
 */
export function busyKey(agentId: string, projectId: string | null | undefined): string {
  return `${agentId}::${projectId ?? ""}`;
}

export interface EnsureInstanceInput {
  agentId: string;
  agentSlug: string;
  projectId: string;
  projectSlug: string;
}

/**
 * Get-or-create the instance for (template, project). On FIRST create, copy the
 * template's own `agent:self` notes into the instance scope (P3-Q1 LOCKED) so
 * accumulated expertise carries over; divergence starts there — template notes
 * written later do NOT flow (isolation is the feature). Copy failures are logged
 * per-note and never block the run: the instance row is the identity, the notes
 * are seed content.
 */
export function ensureAgentInstance(input: EnsureInstanceInput): { id: string; created: boolean } {
  const db = getDb();
  const existing = db
    .select()
    .from(agentInstances)
    .where(and(eq(agentInstances.agentId, input.agentId), eq(agentInstances.projectId, input.projectId)))
    .get();
  if (existing) return { id: existing.id, created: false };

  const id = `ai_${nanoid(10)}`;
  try {
    db.insert(agentInstances)
      .values({ id, agentId: input.agentId, projectId: input.projectId, createdAt: new Date().toISOString() })
      .run();
  } catch {
    // Lost a create race (UNIQUE(agent_id, project_id)) — the winner's row is it.
    const winner = db
      .select()
      .from(agentInstances)
      .where(and(eq(agentInstances.agentId, input.agentId), eq(agentInstances.projectId, input.projectId)))
      .get();
    if (winner) return { id: winner.id, created: false };
    throw new Error(`agent instance create failed for ${input.agentSlug}/${input.projectSlug}`);
  }

  const copied = copyTemplateSelfNotes(input.agentSlug, input.projectSlug);
  logger.info(
    { agent: input.agentSlug, project: input.projectSlug, instanceId: id, copiedNotes: copied },
    "agent instance created",
  );
  return { id, created: true };
}

/** Copy template self-notes (scope=agent, no project) into the new instance scope. */
function copyTemplateSelfNotes(agentSlug: string, projectSlug: string): number {
  const db = getDb();
  const templateNotes = db
    .select()
    .from(memoryNotes)
    .where(
      and(
        eq(memoryNotes.scope, "agent"),
        eq(memoryNotes.agentSlug, agentSlug),
        isNull(memoryNotes.projectSlug),
      ),
    )
    .all();
  const dirtyIds: string[] = [];
  for (const row of templateNotes) {
    try {
      const body = readNoteBody({ ...row, scope: row.scope as MemoryScopeKind } as MemoryNote);
      const copy = writeNote({
        title: row.title,
        content: body,
        scope: "agent",
        projectSlug,
        agentSlug,
        tags: row.tags,
        source: row.source,
      });
      dirtyIds.push(copy.id);
    } catch (err) {
      logger.warn({ err, noteId: row.id, agent: agentSlug }, "instance note copy failed — skipped");
    }
  }
  if (dirtyIds.length > 0) indexer.enqueue(dirtyIds);
  return dirtyIds.length;
}
