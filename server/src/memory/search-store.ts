import { createRequire } from "node:module";
import { EMBEDDING_DIM } from "@sparstrow/shared";
import { getSqlite } from "../db/connection.js";
import { logger } from "../logger.js";

const require = createRequire(import.meta.url);

/**
 * Low-level FTS5 + sqlite-vec row operations. The vec0 virtual table is
 * feature-detected at boot: if the extension can't load we run FTS-only.
 */

let vecLoaded = false;

export function initSearchStore(): { vec: boolean } {
  const sqlite = getSqlite();
  try {
    // sqlite-vec ships a prebuilt vec0 loadable extension for windows-x64.
    // Dynamic require keeps boot alive when the package/prebuild is missing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require("sqlite-vec") as { load(db: unknown): void };
    sqliteVec.load(sqlite);
    sqlite.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[${EMBEDDING_DIM}])`,
    );
    vecLoaded = true;
    logger.info("sqlite-vec loaded — semantic search available");
  } catch (err) {
    vecLoaded = false;
    logger.warn({ err }, "sqlite-vec unavailable — hybrid search degrades to FTS-only");
  }
  return { vec: vecLoaded };
}

export function isVecAvailable(): boolean {
  return vecLoaded;
}

export function insertFtsRow(rowid: number, text: string, title: string, tags: string): void {
  getSqlite()
    .prepare("INSERT INTO memory_fts(rowid, text, title, tags) VALUES (?, ?, ?, ?)")
    .run(rowid, text, title, tags);
}

export function deleteFtsRows(rowids: number[]): void {
  if (rowids.length === 0) return;
  const placeholders = rowids.map(() => "?").join(",");
  getSqlite()
    .prepare(`DELETE FROM memory_fts WHERE rowid IN (${placeholders})`)
    .run(...rowids);
}

export interface FtsHit {
  rowid: number;
  rank: number;
}

/** BM25-ranked FTS query. `match` must already be FTS-escaped. */
export function ftsSearch(match: string, limit: number): FtsHit[] {
  try {
    return getSqlite()
      .prepare(
        "SELECT rowid, rank FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT ?",
      )
      .all(match, limit) as FtsHit[];
  } catch (err) {
    logger.warn({ err, match }, "fts query failed");
    return [];
  }
}

/** Turn a free-text query into an OR-of-quoted-terms FTS5 match expression. */
export function toFtsMatch(query: string): string {
  const terms = query
    .split(/\s+/)
    .map((t) => t.replace(/["'*^]/g, "").trim())
    .filter((t) => t.length > 1)
    .slice(0, 24);
  return terms.map((t) => `"${t}"`).join(" OR ");
}

export function upsertChunkVector(chunkId: number, embedding: Float32Array): void {
  if (!vecLoaded) return;
  const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  // BigInt forces an INTEGER binding — vec0 rejects REAL-bound primary keys.
  getSqlite()
    .prepare("INSERT OR REPLACE INTO memory_vec(chunk_id, embedding) VALUES (?, ?)")
    .run(BigInt(chunkId), buf);
}

export function deleteChunkVectors(chunkIds: number[]): void {
  if (!vecLoaded || chunkIds.length === 0) return;
  const placeholders = chunkIds.map(() => "?").join(",");
  getSqlite()
    .prepare(`DELETE FROM memory_vec WHERE chunk_id IN (${placeholders})`)
    .run(...chunkIds);
}

/**
 * P5 dream cycle: read one chunk's stored embedding back (vec0 supports
 * projecting the column). BGE embeddings are L2-normalized, so a plain dot
 * product between two of these IS cosine similarity.
 */
export function getChunkVector(chunkId: number): Float32Array | null {
  if (!vecLoaded) return null;
  try {
    const row = getSqlite()
      .prepare("SELECT embedding FROM memory_vec WHERE chunk_id = ?")
      .get(BigInt(chunkId)) as { embedding?: Buffer } | undefined;
    if (!row?.embedding) return null;
    const buf = row.embedding;
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  } catch (err) {
    logger.warn({ err, chunkId }, "vector read failed");
    return null;
  }
}

export interface VecHit {
  chunkId: number;
  distance: number;
}

export function vecSearch(embedding: Float32Array, limit: number): VecHit[] {
  if (!vecLoaded) return [];
  const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  try {
    return (
      getSqlite()
        .prepare(
          "SELECT chunk_id as chunkId, distance FROM memory_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance",
        )
        .all(buf, limit) as VecHit[]
    );
  } catch (err) {
    logger.warn({ err }, "vec query failed");
    return [];
  }
}
