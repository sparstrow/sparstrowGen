import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { MemoryLink } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { memoryLinks, memoryNotes } from "../db/schema.js";

/**
 * P5 wikilinks (plan item 3): `[[Note Title]]` parsed at index time into
 * memory_links rows — hard edges, no LLM cost. `unresolved_title` always
 * stores the raw link text, so:
 *   - a dangling link re-resolves when a note with that title is indexed;
 *   - a resolved link whose target is deleted degrades back to dangling
 *     instead of vanishing.
 * Titles resolve case-insensitively; `[[Title|alias]]` uses the part before
 * the pipe; self-links are dropped.
 */

const WIKILINK_RE = /\[\[([^\][\n]+)\]\]/g;

/** Extract unique, trimmed wikilink titles from a note body. */
export function extractWikilinks(body: string): string[] {
  const titles = new Set<string>();
  for (const match of body.matchAll(WIKILINK_RE)) {
    const raw = (match[1] ?? "").split("|")[0]?.trim() ?? "";
    if (raw.length > 0 && raw.length <= 200) titles.add(raw);
  }
  return [...titles];
}

const nowIso = () => new Date().toISOString();

function resolveTitle(title: string, excludeNoteId: string): string | null {
  const row = getDb()
    .select({ id: memoryNotes.id })
    .from(memoryNotes)
    .where(
      and(
        sql`lower(${memoryNotes.title}) = lower(${title})`,
        ne(memoryNotes.id, excludeNoteId),
      ),
    )
    .get();
  return row?.id ?? null;
}

/**
 * Recompute a note's outgoing links from its body. Called by the indexer on
 * every (re)index, so links stay consistent with content by construction.
 */
export function syncNoteLinks(noteId: string, body: string): void {
  const db = getDb();
  db.delete(memoryLinks).where(eq(memoryLinks.fromNoteId, noteId)).run();
  const titles = extractWikilinks(body);
  if (titles.length === 0) return;
  const ts = nowIso();
  for (const title of titles) {
    db.insert(memoryLinks)
      .values({
        fromNoteId: noteId,
        toNoteId: resolveTitle(title, noteId),
        unresolvedTitle: title,
        createdAt: ts,
      })
      .run();
  }
}

/**
 * A note was (re)indexed under `title`: dangling links whose text matches it
 * now resolve to this note. (Self-links stay dangling.)
 */
export function resolveDanglingLinks(noteId: string, title: string): void {
  if (!title) return;
  getDb()
    .update(memoryLinks)
    .set({ toNoteId: noteId })
    .where(
      and(
        isNull(memoryLinks.toNoteId),
        sql`lower(${memoryLinks.unresolvedTitle}) = lower(${title})`,
        ne(memoryLinks.fromNoteId, noteId),
      ),
    )
    .run();
}

/**
 * A note is being removed: its outgoing links cascade via FK; links that
 * POINTED at it degrade to dangling (the raw title is still there, so they
 * re-resolve if the note comes back).
 */
export function onNoteRemoved(noteId: string): void {
  const db = getDb();
  db.delete(memoryLinks).where(eq(memoryLinks.fromNoteId, noteId)).run();
  db.update(memoryLinks).set({ toNoteId: null }).where(eq(memoryLinks.toNoteId, noteId)).run();
}

export interface NoteLinks {
  outgoing: Array<MemoryLink & { toTitle: string | null; toPath: string | null }>;
  backlinks: Array<{ fromNoteId: string; fromTitle: string; fromPath: string }>;
}

/** Links for the Memory UI: outgoing (resolved + dangling) and backlinks. */
export function getNoteLinks(noteId: string): NoteLinks {
  const db = getDb();
  const outgoingRows = db.select().from(memoryLinks).where(eq(memoryLinks.fromNoteId, noteId)).all();
  const outgoing = outgoingRows.map((row) => {
    const target = row.toNoteId
      ? db
          .select({ title: memoryNotes.title, path: memoryNotes.path })
          .from(memoryNotes)
          .where(eq(memoryNotes.id, row.toNoteId))
          .get()
      : null;
    return { ...row, toTitle: target?.title ?? null, toPath: target?.path ?? null };
  });
  const backlinks = db
    .select({
      fromNoteId: memoryLinks.fromNoteId,
      fromTitle: memoryNotes.title,
      fromPath: memoryNotes.path,
    })
    .from(memoryLinks)
    .innerJoin(memoryNotes, eq(memoryLinks.fromNoteId, memoryNotes.id))
    .where(eq(memoryLinks.toNoteId, noteId))
    .all();
  return { outgoing, backlinks };
}
