import type { FastifyInstance } from "fastify";
import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  memoryNoteCreateSchema,
  memoryNoteTypeSchema,
  memorySearchRequestSchema,
  type MemoryNote,
  type MemoryScopeKind,
} from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { memoryContradictions, memoryNotes } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import { indexer } from "../../memory/indexer.js";
import { getNoteLinks } from "../../memory/links.js";
import { readNoteRefs } from "../../memory/lessons.js";
import {
  getSandboxProjectSlugs,
  isForeignSandboxNote,
  noteRowExcluded,
  searchMemory,
} from "../../memory/search.js";
import { synthesizeSearch } from "../../memory/synthesis.js";
import {
  approveNote,
  archiveNote,
  deleteNote,
  getNote,
  readNoteBody,
  readNoteRaw,
  scanVault,
  writeNote,
  writeNoteRaw,
} from "../../memory/vault.js";

const listQuerySchema = z.object({
  scope: z.enum(["global", "project", "agent"]).optional(),
  projectSlug: z.string().optional(),
  agentSlug: z.string().optional(),
  type: memoryNoteTypeSchema.optional(),
  source: z.string().optional(),
  quarantined: z.coerce.boolean().optional(),
  /** Archived notes are hidden by default; pass true to include them. */
  includeArchived: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

function rowToNote(row: typeof memoryNotes.$inferSelect): MemoryNote {
  return { ...row, scope: row.scope as MemoryScopeKind } as MemoryNote;
}

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/memory/notes", async (request) => {
    const query = listQuerySchema.parse(request.query);
    const conditions: SQL[] = [];
    if (query.scope) conditions.push(eq(memoryNotes.scope, query.scope));
    if (query.projectSlug) conditions.push(eq(memoryNotes.projectSlug, query.projectSlug));
    if (query.agentSlug) conditions.push(eq(memoryNotes.agentSlug, query.agentSlug));
    if (query.type) conditions.push(eq(memoryNotes.type, query.type));
    if (query.source) conditions.push(eq(memoryNotes.source, query.source));
    if (query.quarantined !== undefined)
      conditions.push(eq(memoryNotes.quarantined, query.quarantined));
    return getDb()
      .select()
      .from(memoryNotes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(memoryNotes.updatedAt))
      .limit(query.limit)
      .all()
      .filter((row) => query.includeArchived || row.archivedAt == null)
      .map(rowToNote);
  });

  app.post("/memory/notes", async (request, reply) => {
    const body = memoryNoteCreateSchema.parse(request.body);
    const note = writeNote(body);
    indexer.enqueue([note.id]);
    reply.code(201);
    return note;
  });

  app.get("/memory/notes/:id", async (request) => {
    const { id } = request.params as { id: string };
    const note = getNote(id);
    if (!note) throw new HttpError(404, `note not found: ${id}`);
    return note;
  });

  app.get("/memory/notes/:id/raw", async (request) => {
    const { id } = request.params as { id: string };
    const note = getNote(id);
    if (!note) throw new HttpError(404, `note not found: ${id}`);
    return { id, path: note.path, content: readNoteRaw(note) };
  });

  /** P5 wikilinks: outgoing links + backlinks for the Memory UI. */
  app.get("/memory/notes/:id/links", async (request) => {
    const { id } = request.params as { id: string };
    const note = getNote(id);
    if (!note) throw new HttpError(404, `note not found: ${id}`);
    return getNoteLinks(id);
  });

  /** P5 LESSONS: a lesson note's portable (filePath, symbolName) refs. */
  app.get("/memory/notes/:id/refs", async (request) => {
    const { id } = request.params as { id: string };
    const note = getNote(id);
    if (!note) throw new HttpError(404, `note not found: ${id}`);
    return { id, refs: readNoteRefs(note) };
  });

  /** EH6: owner approves a quarantined signal note — it becomes injectable. */
  app.post("/memory/notes/:id/approve", async (request) => {
    const { id } = request.params as { id: string };
    const note = approveNote(id);
    if (!note) throw new HttpError(404, `note not found: ${id}`);
    return note;
  });

  /** P5 soft-archive (owner action; dream cycle uses the same path). */
  app.post("/memory/notes/:id/archive", async (request) => {
    const { id } = request.params as { id: string };
    const note = archiveNote(id, null);
    if (!note) throw new HttpError(404, `note not found: ${id}`);
    indexer.enqueue([id]);
    return note;
  });

  app.put("/memory/notes/:id/raw", async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ content: z.string() }).parse(request.body);
    const note = writeNoteRaw(id, body.content);
    indexer.enqueue([id]);
    return note;
  });

  app.delete("/memory/notes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    deleteNote(id);
    indexer.removeNote(id);
    reply.code(204);
  });

  /**
   * P5 signal-noise mitigation (plan risk list): bulk-delete reviewable
   * machine-written notes by exact source, optionally narrowed. Refuses
   * user-authored sources — this is a broom for extractor output, not rm -rf.
   */
  app.post("/memory/notes/bulk-delete", async (request) => {
    const body = z
      .object({
        source: z.string().min(1),
        projectSlug: z.string().optional(),
        quarantinedOnly: z.boolean().default(false),
      })
      .parse(request.body);
    const machineSource =
      body.source === "signal" || body.source === "dream" || body.source.startsWith("agent:");
    if (!machineSource) {
      throw new HttpError(400, "bulk-delete only accepts machine sources: 'signal', 'dream', or 'agent:<slug>'");
    }
    const conditions: SQL[] = [eq(memoryNotes.source, body.source)];
    if (body.projectSlug) conditions.push(eq(memoryNotes.projectSlug, body.projectSlug));
    if (body.quarantinedOnly) conditions.push(eq(memoryNotes.quarantined, true));
    const rows = getDb()
      .select({ id: memoryNotes.id })
      .from(memoryNotes)
      .where(and(...conditions))
      .all();
    for (const { id } of rows) {
      deleteNote(id);
      indexer.removeNote(id);
    }
    return { deleted: rows.length };
  });

  /** P5 contradictions (flag-only): open flags + resolve. */
  app.get("/memory/contradictions", async (request) => {
    const query = z.object({ open: z.coerce.boolean().default(true) }).parse(request.query);
    const rows = getDb().select().from(memoryContradictions).orderBy(desc(memoryContradictions.detectedAt)).all();
    const filtered = query.open ? rows.filter((r) => r.resolvedAt == null) : rows;
    return filtered.map((row) => {
      const a = getNote(row.noteA);
      const b = getNote(row.noteB);
      return {
        ...row,
        noteATitle: a?.title ?? "(deleted)",
        noteAPath: a?.path ?? null,
        noteBTitle: b?.title ?? "(deleted)",
        noteBPath: b?.path ?? null,
      };
    });
  });

  app.post("/memory/contradictions/:id/resolve", async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ resolution: z.string().default("dismissed") }).parse(request.body);
    const db = getDb();
    const row = db.select().from(memoryContradictions).where(eq(memoryContradictions.id, id)).get();
    if (!row) throw new HttpError(404, `contradiction not found: ${id}`);
    db.update(memoryContradictions)
      .set({ resolvedAt: new Date().toISOString(), resolution: body.resolution })
      .where(eq(memoryContradictions.id, id))
      .run();
    return db.select().from(memoryContradictions).where(eq(memoryContradictions.id, id)).get();
  });

  app.post("/memory/rescan", async () => {
    const { dirtyNoteIds, ...result } = scanVault();
    indexer.enqueue(dirtyNoteIds);
    return { ...result, dirty: dirtyNoteIds.length };
  });

  app.post("/memory/reindex", async () => {
    const queued = indexer.reindexAll();
    return { queued };
  });

  /**
   * Hybrid search (FTS5 BM25 + sqlite-vec KNN, RRF-fused). Falls back to a
   * title/tags LIKE scan when the hybrid index has no hits yet. With
   * synthesize=true also returns a cited synthesis of the hits (or null when
   * the utility model is unavailable — the search itself never fails).
   */
  app.post("/memory/search", async (request) => {
    const body = memorySearchRequestSchema.parse(request.body);
    let hits = await searchMemory(body.query, null, body.k, { type: body.type });
    if (hits.length === 0) {
      const pattern = `%${body.query.replace(/[%_]/g, "")}%`;
      // EH7: the hybrid path drops foreign sandbox notes; this LIKE fallback
      // bypasses searchMemory, so re-apply the same exclusion (null-caller/
      // global operator search — it must see no sandbox notes). P5: the shared
      // noteRowExcluded gate applies here too (type/quarantine/archive).
      const sandboxSlugs = getSandboxProjectSlugs();
      const rows = getDb()
        .select()
        .from(memoryNotes)
        .where(
          or(
            like(memoryNotes.title, pattern),
            like(memoryNotes.tags, pattern),
            like(memoryNotes.path, pattern),
          ),
        )
        .orderBy(desc(memoryNotes.updatedAt))
        .limit(body.k * 2 + sandboxSlugs.size) // headroom for the ones we may drop
        .all()
        .filter((row) => !isForeignSandboxNote(row, sandboxSlugs, null))
        .filter((row) => !noteRowExcluded(row, { type: body.type }))
        .slice(0, body.k);
      hits = rows.map((row, i) => {
        let excerpt = "";
        try {
          excerpt = readNoteBody(rowToNote(row)).slice(0, 400);
        } catch {
          // file unreadable — return hit without excerpt
        }
        return {
          noteId: row.id,
          path: row.path,
          title: row.title,
          scope: row.scope as MemoryScopeKind,
          projectSlug: row.projectSlug,
          agentSlug: row.agentSlug,
          excerpt,
          heading: null,
          score: 1 - i / Math.max(rows.length, 1),
          vecRank: null,
          ftsRank: null,
          type: row.type as MemoryNote["type"],
        };
      });
    }
    if (!body.synthesize) return { hits, synthesis: null };
    return { hits, synthesis: await synthesizeSearch(body.query, hits) };
  });
}
