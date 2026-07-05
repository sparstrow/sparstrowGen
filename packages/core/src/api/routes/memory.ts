import type { FastifyInstance } from "fastify";
import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  memoryNoteCreateSchema,
  memorySearchRequestSchema,
  type MemoryNote,
  type MemoryScopeKind,
} from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { memoryNotes } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import { indexer } from "../../memory/indexer.js";
import { getSandboxProjectSlugs, isForeignSandboxNote, searchMemory } from "../../memory/search.js";
import {
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
    return getDb()
      .select()
      .from(memoryNotes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(memoryNotes.updatedAt))
      .limit(query.limit)
      .all()
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
   * title/tags LIKE scan when the hybrid index has no hits yet.
   */
  app.post("/memory/search", async (request) => {
    const body = memorySearchRequestSchema.parse(request.body);
    const hits = await searchMemory(body.query, null, body.k);
    if (hits.length > 0) return hits;

    const pattern = `%${body.query.replace(/[%_]/g, "")}%`;
    // EH7: the hybrid path drops foreign sandbox notes; this LIKE fallback bypasses
    // searchMemory, so re-apply the same exclusion (this is a null-caller/global
    // operator search — it must see no sandbox notes).
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
      .limit(body.k + sandboxSlugs.size) // headroom for the ones we may drop
      .all()
      .filter((row) => !isForeignSandboxNote(row, sandboxSlugs, null))
      .slice(0, body.k);
    return rows.map((row, i) => {
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
        scope: row.scope,
        projectSlug: row.projectSlug,
        agentSlug: row.agentSlug,
        excerpt,
        heading: null,
        score: 1 - i / Math.max(rows.length, 1),
        vecRank: null,
        ftsRank: null,
      };
    });
  });
}
