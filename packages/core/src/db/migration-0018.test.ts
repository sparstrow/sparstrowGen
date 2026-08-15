import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getSqlite, openDb } from "./connection.js";

describe("migration 0018 — memory sync state", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });
  afterEach(() => closeDb());

  it("applies the chain through 0018 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0018_memory_sync_state");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("adds both columns as nullable, with no default", () => {
    const cols = (
      getSqlite().prepare("PRAGMA table_info(memory_notes)").all() as {
        name: string;
        notnull: number;
        dflt_value: string | null;
      }[]
    ).filter((c) => c.name === "synced_hash" || c.name === "synced_at");

    expect(cols.map((c) => c.name).sort()).toEqual(["synced_at", "synced_hash"]);
    for (const col of cols) {
      expect(col.notnull, `${col.name} must be nullable`).toBe(0);
      // Not `NOT NULL DEFAULT ''`: an empty string is not a hash, and it reads
      // as "synced to nothing" next to a schema where NULL already means
      // "hasn't happened" (indexedAt, archivedAt).
      expect(col.dflt_value, `${col.name} must have no default`).toBeNull();
    }
  });

  it("leaves an EXISTING note reading as never-synced, not as already-synced", () => {
    // The safety property the migration comment asserts, tested against a
    // POPULATED table rather than a fresh one. A note that existed before M6
    // must come out of this migration dirty, so the first reconciliation sweep
    // pushes it. Backfilling synced_hash from content_hash would make this row
    // invisible to sync forever.
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO memory_notes (id, path, scope, title, tags, source, type, content_hash, created_at, updated_at)
         VALUES ('mem_pre_existing', 'global/old-note.md', 'global', 'Old', '[]', 'user', 'note', 'hash-a', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
      )
      .run();

    const row = sqlite
      .prepare("SELECT content_hash, synced_hash, synced_at FROM memory_notes WHERE id = 'mem_pre_existing'")
      .get() as { content_hash: string; synced_hash: string | null; synced_at: string | null };

    expect(row.synced_hash).toBeNull();
    expect(row.synced_at).toBeNull();
    expect(row.content_hash).toBe("hash-a");
  });

  it("finds a never-synced note with the sweep's own predicate", () => {
    const sqlite = getSqlite();
    const insert = (id: string, contentHash: string, syncedHash: string | null) =>
      sqlite
        .prepare(
          `INSERT INTO memory_notes (id, path, scope, title, tags, source, type, content_hash, synced_hash, created_at, updated_at)
           VALUES (?, ?, 'global', 'T', '[]', 'user', 'note', ?, ?, 't', 't')`,
        )
        .run(id, `global/${id}.md`, contentHash, syncedHash);

    insert("mem_never", "hash-a", null); // predates M6
    insert("mem_stale", "hash-b", "hash-a"); // edited since its last push
    insert("mem_clean", "hash-c", "hash-c"); // already synced

    const dirty = (
      sqlite
        .prepare(
          "SELECT id FROM memory_notes WHERE synced_hash IS NULL OR synced_hash != content_hash ORDER BY id",
        )
        .all() as { id: string }[]
    ).map((r) => r.id);

    // `synced_hash != content_hash` alone would miss the NULL row entirely —
    // SQL comparison with NULL is NULL, not true. The IS NULL leg is what makes
    // every pre-M6 note a sweep candidate.
    expect(dirty).toEqual(["mem_never", "mem_stale"]);
  });

  it("does not add sync columns to the derived tables — they are never synced", () => {
    // Chunks, FTS and vec are rebuilt from the note body on every index pass,
    // on each machine independently. A sync-state column on them would be dead
    // weight that a later reader would reasonably assume meant something.
    for (const table of ["memory_chunks", "memory_links"]) {
      const cols = (
        getSqlite().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      ).map((c) => c.name);
      expect(cols).not.toContain("synced_hash");
      expect(cols).not.toContain("synced_at");
    }
  });
});
