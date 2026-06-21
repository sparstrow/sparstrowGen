import { desc, inArray } from "drizzle-orm";
import type { Agent, MemoryNote, MemoryScopeKind, MemorySearchHit } from "@sparstrow/shared";
import { MEMORY_INJECTION_MAX_CHARS, MEMORY_INJECTION_TOP_K } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { memoryNotes } from "../db/schema.js";
import { logger } from "../logger.js";
import { searchMemory } from "./search.js";
import { expandReadScopes, noteMatchesFilters } from "./scopes.js";
import { readNoteBody } from "./vault.js";

export { expandReadScopes, expandWriteScopes, noteMatchesFilters } from "./scopes.js";
export type { ScopeFilter } from "./scopes.js";

/** Cap on injected notes authored by the agent itself (self-injection loop guard). */
const MAX_SELF_NOTES = 3;

/**
 * Build the <memory> block for a run: hybrid retrieval with the prompt as the
 * query, scope-filtered to what the agent may read; recency fallback when
 * retrieval returns nothing (fresh vault, embedder still warming).
 */
export async function buildMemoryBlock(
  agent: Agent,
  currentProjectSlug: string | null,
  prompt: string,
): Promise<string> {
  const filters = expandReadScopes(agent, currentProjectSlug);
  if (filters.length === 0) return "";

  let hits: MemorySearchHit[] = [];
  try {
    hits = await searchMemory(prompt.slice(0, 800), filters, MEMORY_INJECTION_TOP_K);
  } catch (err) {
    logger.warn({ err }, "memory retrieval failed — falling back to recency");
  }

  // Anti-loop: limit notes the agent authored itself.
  const db = getDb();
  if (hits.length > 0) {
    const sources = new Map(
      db
        .select({ id: memoryNotes.id, source: memoryNotes.source })
        .from(memoryNotes)
        .where(inArray(memoryNotes.id, [...new Set(hits.map((h) => h.noteId))]))
        .all()
        .map((r) => [r.id, r.source]),
    );
    let selfCount = 0;
    hits = hits.filter((hit) => {
      if (sources.get(hit.noteId) === `agent:${agent.slug}`) {
        selfCount++;
        return selfCount <= MAX_SELF_NOTES;
      }
      return true;
    });
  }

  if (hits.length === 0) {
    hits = recencyFallback(agent, currentProjectSlug, 4);
  }
  if (hits.length === 0) return "";

  const parts: string[] = [];
  let budget = MEMORY_INJECTION_MAX_CHARS;
  for (const hit of hits) {
    const scopeLabel = `${hit.scope}${hit.projectSlug ? `/${hit.projectSlug}` : ""}${hit.agentSlug ? `/${hit.agentSlug}` : ""}`;
    const entry = `### ${hit.title}${hit.heading ? ` › ${hit.heading}` : ""}\n(path: ${hit.path} | scope: ${scopeLabel})\n${hit.excerpt}`;
    if (entry.length > budget) break;
    parts.push(entry);
    budget -= entry.length;
  }
  if (parts.length === 0) return "";
  return `<memory>\nThe following notes from your long-term memory may be relevant. Do not re-save them.\n\n${parts.join("\n\n---\n\n")}\n</memory>`;
}

function recencyFallback(
  agent: Agent,
  currentProjectSlug: string | null,
  limit: number,
): MemorySearchHit[] {
  const filters = expandReadScopes(agent, currentProjectSlug);
  const db = getDb();
  const scopes = [...new Set(filters.map((f) => f.scope))];
  if (scopes.length === 0) return [];
  const candidates = db
    .select()
    .from(memoryNotes)
    .where(inArray(memoryNotes.scope, scopes))
    .orderBy(desc(memoryNotes.updatedAt))
    .limit(50)
    .all();
  const hits: MemorySearchHit[] = [];
  for (const row of candidates) {
    const note = {
      scope: row.scope as MemoryScopeKind,
      projectSlug: row.projectSlug,
      agentSlug: row.agentSlug,
    };
    if (!noteMatchesFilters(note, filters)) continue;
    let body = "";
    try {
      body = readNoteBody({ ...row, scope: row.scope as MemoryScopeKind } as MemoryNote);
    } catch {
      continue;
    }
    hits.push({
      noteId: row.id,
      path: row.path,
      title: row.title,
      scope: row.scope as MemoryScopeKind,
      projectSlug: row.projectSlug,
      agentSlug: row.agentSlug,
      excerpt: body.length > 500 ? `${body.slice(0, 500)}…` : body,
      heading: null,
      score: 0,
      vecRank: null,
      ftsRank: null,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
