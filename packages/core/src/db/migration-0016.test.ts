import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getSqlite, openDb } from "./connection.js";

describe("migration 0016 — cloud_links", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });
  afterEach(() => closeDb());

  it("applies the chain through 0016 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0016_cloud_links");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("has the columns resolution reads", () => {
    const cols = (
      getSqlite().prepare("PRAGMA table_info(cloud_links)").all() as { name: string }[]
    ).map((c) => c.name);
    for (const col of ["kind", "cloud_id", "local_id", "linked_at"]) {
      expect(cols).toContain(col);
    }
  });

  it("keys on (kind, cloud_id), so the same id in two kinds does not collide", () => {
    const sqlite = getSqlite();
    const insert = (kind: string, cloudId: string, localId: string) =>
      sqlite
        .prepare("INSERT INTO cloud_links (kind, cloud_id, local_id, linked_at) VALUES (?, ?, ?, ?)")
        .run(kind, cloudId, localId, "2026-01-01T00:00:00Z");

    insert("agent", "shared-id", "agt_1");
    expect(() => insert("project", "shared-id", "prj_1")).not.toThrow();
    expect(() => insert("agent", "shared-id", "agt_2")).toThrow();
  });

  it("refuses to map one local row to two cloud rows", () => {
    // Without the unique index, two cloud agents whose slugs both resolved to
    // the same local agent would each look correctly linked while dispatch
    // silently ran the wrong one.
    const sqlite = getSqlite();
    const insert = (cloudId: string, localId: string) =>
      sqlite
        .prepare("INSERT INTO cloud_links (kind, cloud_id, local_id, linked_at) VALUES (?, ?, ?, ?)")
        .run("agent", cloudId, localId, "2026-01-01T00:00:00Z");

    insert("cloud-a", "agt_1");
    expect(() => insert("cloud-b", "agt_1")).toThrow();
  });
});
