import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { agents, memoryContradictions, memoryLinks, memoryNotes, runs } from "./schema.js";

const ts = "2026-01-01T00:00:00Z";

describe("migration 0008 — smart memory", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0008 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0008_smart_memory");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const noteCols = (getSqlite().prepare("PRAGMA table_info(memory_notes)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(noteCols).toEqual(
      expect.arrayContaining(["type", "quarantined", "archived_at", "superseded_by"]),
    );
    const runCols = (getSqlite().prepare("PRAGMA table_info(runs)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(runCols).toEqual(expect.arrayContaining(["untrusted", "injected_memory"]));
    const agentCols = (getSqlite().prepare("PRAGMA table_info(agents)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(agentCols).toContain("signal_extraction");
    const linkCols = (getSqlite().prepare("PRAGMA table_info(memory_links)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(linkCols).toEqual(expect.arrayContaining(["from_note_id", "to_note_id", "unresolved_title"]));
    const mcCols = (
      getSqlite().prepare("PRAGMA table_info(memory_contradictions)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(mcCols).toEqual(
      expect.arrayContaining(["note_a", "note_b", "axis", "severity", "confidence", "resolved_at"]),
    );
  });

  it("memory_notes new columns default correctly (existing rows migrate to type=note)", () => {
    db.insert(memoryNotes)
      .values({ id: "mem_1", path: "global/a.md", scope: "global", createdAt: ts, updatedAt: ts })
      .run();
    const n = db.select().from(memoryNotes).where(eq(memoryNotes.id, "mem_1")).get()!;
    expect(n.type).toBe("note");
    expect(n.quarantined).toBe(false);
    expect(n.archivedAt).toBeNull();
    expect(n.supersededBy).toBeNull();
  });

  it("runs.untrusted defaults false and injected_memory defaults null", () => {
    db.insert(runs)
      .values({
        id: "run_1",
        agentId: "agt_1",
        trigger: "manual",
        mode: "headless",
        prompt: "x",
        status: "queued",
        createdAt: ts,
      })
      .run();
    const r = db.select().from(runs).where(eq(runs.id, "run_1")).get()!;
    expect(r.untrusted).toBe(false);
    expect(r.injectedMemory).toBeNull();
  });

  it("agents.signal_extraction defaults true", () => {
    db.insert(agents)
      .values({
        id: "agt_1",
        name: "Coder",
        slug: "coder",
        provider: "claude-code",
        model: "x",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    expect(db.select().from(agents).where(eq(agents.id, "agt_1")).get()!.signalExtraction).toBe(true);
  });

  it("memory_links: ON DELETE CASCADE from source note; dangling target allowed", () => {
    db.insert(memoryNotes)
      .values({ id: "mem_a", path: "global/a.md", scope: "global", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(memoryLinks)
      .values({ fromNoteId: "mem_a", toNoteId: null, unresolvedTitle: "Missing Note", createdAt: ts })
      .run();
    expect(db.select().from(memoryLinks).all()).toHaveLength(1);

    db.delete(memoryNotes).where(eq(memoryNotes.id, "mem_a")).run();
    expect(db.select().from(memoryLinks).all()).toHaveLength(0);
  });

  it("memory_contradictions: unique (note_a, note_b) pair rejects re-flagging", () => {
    const row = {
      id: "mc_1",
      noteA: "mem_a",
      noteB: "mem_b",
      axis: "auth approach",
      severity: "high",
      confidence: 0.9,
      detectedAt: ts,
    };
    db.insert(memoryContradictions).values(row).run();
    expect(() => db.insert(memoryContradictions).values({ ...row, id: "mc_2" }).run()).toThrow();
  });
});
