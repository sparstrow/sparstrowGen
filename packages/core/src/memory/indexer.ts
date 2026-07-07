import { eq } from "drizzle-orm";
import type { MemoryNote, MemoryScopeKind } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { memoryChunks, memoryNotes } from "../db/schema.js";
import { bus } from "../events/bus.js";
import { logger } from "../logger.js";
import { chunkMarkdown } from "./chunker.js";
import { embedPassages, initEmbedder, isEmbedderReady } from "./embedder.js";
import { onNoteRemoved, resolveDanglingLinks, syncNoteLinks } from "./links.js";
import {
  deleteChunkVectors,
  deleteFtsRows,
  insertFtsRow,
  upsertChunkVector,
} from "./search-store.js";
import { getNote, readNoteBody } from "./vault.js";

const nowIso = () => new Date().toISOString();

/**
 * Serial indexing queue: note -> chunks -> FTS rows (immediately searchable)
 * -> embeddings -> vec rows (semantic, once the model is ready).
 */
class MemoryIndexer {
  private queue: string[] = [];
  private queued = new Set<string>();
  private processing = false;

  enqueue(noteIds: string[]): void {
    for (const id of noteIds) {
      if (!this.queued.has(id)) {
        this.queued.add(id);
        this.queue.push(id);
      }
    }
    void this.drain();
  }

  /** Drop a removed note's chunks from all indexes. */
  removeNote(noteId: string): void {
    const db = getDb();
    const oldChunks = db
      .select({ id: memoryChunks.id })
      .from(memoryChunks)
      .where(eq(memoryChunks.noteId, noteId))
      .all();
    const ids = oldChunks.map((c) => c.id);
    deleteFtsRows(ids);
    deleteChunkVectors(ids);
    db.delete(memoryChunks).where(eq(memoryChunks.noteId, noteId)).run();
    // P5 wikilinks: outgoing links go; inbound links degrade to dangling.
    onNoteRemoved(noteId);
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()!;
        this.queued.delete(id);
        try {
          await this.indexNote(id);
        } catch (err) {
          logger.error({ err, noteId: id }, "failed to index note");
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async indexNote(noteId: string): Promise<void> {
    const db = getDb();
    const note = getNote(noteId);
    if (!note) {
      this.removeNote(noteId);
      return;
    }

    let body: string;
    try {
      body = readNoteBody(note);
    } catch (err) {
      logger.warn({ err, path: note.path }, "cannot read note for indexing");
      return;
    }

    this.removeNote(noteId);

    // P5 wikilinks: hard edges recomputed from the body on every index; then
    // any dangling links elsewhere that name THIS note's title resolve to it.
    try {
      syncNoteLinks(noteId, body);
      resolveDanglingLinks(noteId, note.title);
    } catch (err) {
      logger.warn({ err, noteId }, "wikilink sync failed — note still indexes");
    }

    const chunks = chunkMarkdown(body);
    const tagsText = note.tags.join(" ");
    const chunkIds: number[] = [];
    for (const chunk of chunks) {
      const inserted = db
        .insert(memoryChunks)
        .values({ noteId, chunkIndex: chunk.index, text: chunk.text, heading: chunk.heading })
        .returning({ id: memoryChunks.id })
        .get();
      chunkIds.push(inserted.id);
      insertFtsRow(inserted.id, chunk.text, note.title, tagsText);
    }

    // Vectors are best-effort: first call kicks off the model download.
    const embedderUp = isEmbedderReady() || (await initEmbedder());
    if (embedderUp && chunks.length > 0) {
      try {
        const vectors = await embedPassages(chunks.map((c) => `${note.title}\n${c.text}`));
        vectors.forEach((vec, i) => {
          const chunkId = chunkIds[i];
          if (chunkId != null) upsertChunkVector(chunkId, vec);
        });
      } catch (err) {
        logger.warn({ err, noteId }, "embedding failed for note — FTS rows remain");
      }
    }

    db.update(memoryNotes)
      .set({ indexedAt: nowIso() })
      .where(eq(memoryNotes.id, noteId))
      .run();
    bus.publish({
      type: "memory.note.indexed",
      note: { ...note, indexedAt: nowIso() } as MemoryNote & { scope: MemoryScopeKind },
    });
  }

  /** Re-chunk/re-embed everything (UI "reindex" action). */
  reindexAll(): number {
    const db = getDb();
    const all = db.select({ id: memoryNotes.id }).from(memoryNotes).all();
    this.enqueue(all.map((r) => r.id));
    return all.length;
  }

  /** Index notes that scanVault flagged dirty plus never-indexed rows. */
  indexPending(extraDirty: string[] = []): number {
    const db = getDb();
    const pending = db
      .select({ id: memoryNotes.id })
      .from(memoryNotes)
      .all()
      .filter((row) => {
        const note = getNote(row.id);
        return note?.indexedAt == null;
      })
      .map((r) => r.id);
    const ids = [...new Set([...pending, ...extraDirty])];
    this.enqueue(ids);
    return ids.length;
  }
}

export const indexer = new MemoryIndexer();
