import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { projects, tasks } from "./schema.js";

describe("migration 0005 — tool permissions", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0005 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0005_tool_permissions");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    for (const table of ["projects", "tasks"]) {
      const cols = (getSqlite().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
        (c) => c.name,
      );
      expect(cols).toContain("allowed_tools");
      expect(cols).toContain("disallowed_tools");
    }
  });

  it("tool columns default to [] and round-trip JSON arrays", () => {
    const ts = "2026-01-01T00:00:00Z";
    db.insert(projects)
      .values({ id: "proj_1", name: "P", slug: "p", createdAt: ts, updatedAt: ts })
      .run();
    const proj = db.select().from(projects).where(eq(projects.id, "proj_1")).get()!;
    expect(proj.allowedTools).toEqual([]);
    expect(proj.disallowedTools).toEqual([]);

    db.insert(tasks)
      .values({
        id: "tsk_1",
        title: "T",
        status: "todo",
        allowedTools: ["Read"],
        disallowedTools: ["Bash"],
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const task = db.select().from(tasks).where(eq(tasks.id, "tsk_1")).get()!;
    expect(task.allowedTools).toEqual(["Read"]);
    expect(task.disallowedTools).toEqual(["Bash"]);
  });
});
