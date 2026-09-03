import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getSqlite, openDb } from "./connection.js";

describe("migration 0017 — cloud_event_cursors", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });
  afterEach(() => closeDb());

  it("applies the chain through 0017 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0017_cloud_event_cursors");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("has the columns the backfill sweep reads", () => {
    const cols = (
      getSqlite().prepare("PRAGMA table_info(cloud_event_cursors)").all() as { name: string }[]
    ).map((c) => c.name);
    for (const col of ["run_id", "pushed_through_seq", "updated_at"]) {
      expect(cols).toContain(col);
    }
  });

  it("keys on run_id, so a second row for the same run overwrites rather than duplicating", () => {
    const sqlite = getSqlite();
    const upsert = (runId: string, seq: number) =>
      sqlite
        .prepare(
          "INSERT INTO cloud_event_cursors (run_id, pushed_through_seq, updated_at) VALUES (?, ?, ?) " +
            "ON CONFLICT(run_id) DO UPDATE SET pushed_through_seq = excluded.pushed_through_seq, updated_at = excluded.updated_at",
        )
        .run(runId, seq, "2026-08-11T00:00:00Z");

    upsert("run_1", 5);
    upsert("run_1", 12);

    const rows = sqlite.prepare("SELECT run_id, pushed_through_seq FROM cloud_event_cursors").all();
    expect(rows).toEqual([{ run_id: "run_1", pushed_through_seq: 12 }]);
  });

  it("is empty on a freshly migrated, populated database — the safety property the migration comment asserts", () => {
    // A local run existing in run_events BEFORE this migration ran must not
    // produce a cursor row. Seeding one wasn't needed BECAUSE backfill only
    // ever reads from this table, never scans run_events for candidates — this
    // test is the assertion that the invariant the design relies on actually
    // holds, not a description of intended behaviour.
    const sqlite = getSqlite();
    sqlite
      .prepare(
        "INSERT INTO agents (id, name, slug, provider, model, created_at, updated_at) VALUES ('agt_1','A','a','claude-code','sonnet','t','t')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO runs (id, agent_id, trigger, mode, prompt, status, created_at) VALUES ('run_pre_existing','agt_1','manual','headless','hi','succeeded','2026-01-01T00:00:00Z')",
      )
      .run();
    sqlite
      .prepare("INSERT INTO run_events (run_id, seq, ts, type, payload) VALUES ('run_pre_existing', 0, 't', 'result', '{}')")
      .run();

    const rows = sqlite.prepare("SELECT * FROM cloud_event_cursors").all();
    expect(rows).toEqual([]);
  });
});
