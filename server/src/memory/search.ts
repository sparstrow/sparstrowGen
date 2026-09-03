import { eq, inArray } from "drizzle-orm";
import type { MemoryNoteType, MemorySearchHit, MemoryScopeKind } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { memoryChunks, memoryNotes, projects } from "../db/schema.js";
import { logger } from "../logger.js";
import { embedQuery, isEmbedderReady } from "./embedder.js";
import { ftsSearch, isVecAvailable, toFtsMatch, vecSearch } from "./search-store.js";
import { noteMatchesFilters, type ScopeFilter } from "./scopes.js";

/**
 * EH7 (P4 §6): the slugs of sandbox projects. Their `project:`-scoped notes are
 * non-global-searchable — visible ONLY to a caller whose own project IS that
 * sandbox. Used to drop foreign sandbox notes from every read path.
 */
export function getSandboxProjectSlugs(): Set<string> {
  const rows = getDb()
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.isSandbox, true))
    .all();
  return new Set(rows.map((r) => r.slug));
}

/** Is this note a foreign sandbox note the caller must not see? */
export function isForeignSandboxNote(
  note: { scope: string; projectSlug: string | null },
  sandboxSlugs: Set<string>,
  callerProjectSlug: string | null,
): boolean {
  if (note.scope !== "project" || !note.projectSlug) return false;
  return sandboxSlugs.has(note.projectSlug) && note.projectSlug !== callerProjectSlug;
}

const RRF_K = 60;
const CANDIDATES = 40;
const MAX_CHUNKS_PER_NOTE = 2;

interface Scored {
  score: number;
  vecRank: number | null;
  ftsRank: number | null;
}

/**
 * Hybrid retrieval: BM25 (FTS5) + KNN (sqlite-vec) fused with Reciprocal Rank
 * Fusion, then scope-filtered. Degrades to FTS-only when the embedder or vec
 * extension is unavailable.
 */
export interface SearchOptions {
  /**
   * EH7: the caller's own project slug. Sandbox project notes are dropped unless
   * the caller IS that sandbox. Null (user/global search) sees no sandbox notes.
   */
  callerProjectSlug?: string | null;
  /** P5 typed memory: restrict hits to one note type. */
  type?: MemoryNoteType;
  /**
   * EH6: quarantined notes are excluded from EVERY retrieval path by default —
   * they are a stored second-order injection channel until the owner approves.
   * Only the operator review surface sets this.
   */
  includeQuarantined?: boolean;
  /** P5 soft-archive: archived notes are excluded from retrieval by default. */
  includeArchived?: boolean;
}

/**
 * The single P5 row gate shared by all three read paths (searchMemory, the
 * injector's recencyFallback, the route's LIKE fallback) so type filtering and
 * the EH6/archive exclusions cannot drift between them.
 */
export function noteRowExcluded(
  note: { type: string; quarantined: boolean; archivedAt: string | null },
  opts: SearchOptions,
): boolean {
  if (opts.type && note.type !== opts.type) return true;
  if (note.quarantined && !opts.includeQuarantined) return true;
  if (note.archivedAt != null && !opts.includeArchived) return true;
  return false;
}

export async function searchMemory(
  query: string,
  filters: ScopeFilter[] | null,
  k: number,
  opts: SearchOptions = {},
): Promise<MemorySearchHit[]> {
  const scores = new Map<number, Scored>();

  const match = toFtsMatch(query);
  if (match.length > 0) {
    ftsSearch(match, CANDIDATES).forEach((hit, rank) => {
      const entry = scores.get(hit.rowid) ?? { score: 0, vecRank: null, ftsRank: null };
      entry.score += 1 / (RRF_K + rank + 1);
      entry.ftsRank = rank;
      scores.set(hit.rowid, entry);
    });
  }

  if (isVecAvailable() && isEmbedderReady()) {
    try {
      const queryVec = await embedQuery(query.slice(0, 1000));
      vecSearch(queryVec, CANDIDATES).forEach((hit, rank) => {
        const entry = scores.get(hit.chunkId) ?? { score: 0, vecRank: null, ftsRank: null };
        entry.score += 1 / (RRF_K + rank + 1);
        entry.vecRank = rank;
        scores.set(hit.chunkId, entry);
      });
    } catch (err) {
      logger.warn({ err }, "semantic side of hybrid search failed");
    }
  }

  if (scores.size === 0) return [];

  const db = getDb();
  const chunkRows = db
    .select()
    .from(memoryChunks)
    .where(inArray(memoryChunks.id, [...scores.keys()]))
    .all();
  const noteIds = [...new Set(chunkRows.map((c) => c.noteId))];
  const noteRows = db.select().from(memoryNotes).where(inArray(memoryNotes.id, noteIds)).all();
  const notesById = new Map(noteRows.map((n) => [n.id, n]));

  const perNoteCount = new Map<string, number>();
  const hits: MemorySearchHit[] = [];
  const sandboxSlugs = getSandboxProjectSlugs();

  const ranked = chunkRows
    .map((chunk) => ({ chunk, scored: scores.get(chunk.id)! }))
    .sort((a, b) => b.scored.score - a.scored.score);

  for (const { chunk, scored } of ranked) {
    const note = notesById.get(chunk.noteId);
    if (!note) continue;
    const noteForFilter = {
      scope: note.scope as MemoryScopeKind,
      projectSlug: note.projectSlug,
      agentSlug: note.agentSlug,
    };
    if (filters && !noteMatchesFilters(noteForFilter, filters)) continue;
    // EH7: a sandbox project's notes are invisible outside that sandbox.
    if (sandboxSlugs.size > 0 && isForeignSandboxNote(noteForFilter, sandboxSlugs, opts.callerProjectSlug ?? null))
      continue;
    // P5: type filter + EH6 quarantine + soft-archive exclusion (shared gate).
    if (noteRowExcluded(note, opts)) continue;
    const count = perNoteCount.get(note.id) ?? 0;
    if (count >= MAX_CHUNKS_PER_NOTE) continue;
    perNoteCount.set(note.id, count + 1);
    hits.push({
      noteId: note.id,
      path: note.path,
      title: note.title,
      scope: note.scope as MemoryScopeKind,
      projectSlug: note.projectSlug,
      agentSlug: note.agentSlug,
      excerpt: chunk.text.length > 500 ? `${chunk.text.slice(0, 500)}…` : chunk.text,
      heading: chunk.heading,
      score: scored.score,
      vecRank: scored.vecRank,
      ftsRank: scored.ftsRank,
      type: note.type as MemoryNoteType,
    });
    if (hits.length >= k) break;
  }
  return hits;
}
