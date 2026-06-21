import { inArray } from "drizzle-orm";
import type { MemorySearchHit, MemoryScopeKind } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { memoryChunks, memoryNotes } from "../db/schema.js";
import { logger } from "../logger.js";
import { embedQuery, isEmbedderReady } from "./embedder.js";
import { ftsSearch, isVecAvailable, toFtsMatch, vecSearch } from "./search-store.js";
import { noteMatchesFilters, type ScopeFilter } from "./scopes.js";

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
export async function searchMemory(
  query: string,
  filters: ScopeFilter[] | null,
  k: number,
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
    });
    if (hits.length >= k) break;
  }
  return hits;
}
