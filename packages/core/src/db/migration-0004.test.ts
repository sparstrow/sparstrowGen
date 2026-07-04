import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { taskQuestions, tasks } from "./schema.js";

describe("migration 0004 — task lifecycle & escalation", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the full 0001..0004 chain and records it", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0004_task_lifecycle");
    // New columns/table exist and are queryable.
    const cols = (getSqlite().prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toContain("wake_payload");
    expect(cols).toContain("user_id");
    const runCols = (getSqlite().prepare("PRAGMA table_info(runs)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(runCols).toContain("lane");
    expect(runCols).toContain("effective_tools");
  });

  it("passes PRAGMA foreign_key_check after the chain (FKs intact)", () => {
    const violations = getSqlite().prepare("PRAGMA foreign_key_check").all();
    expect(violations).toEqual([]);
  });

  it("cascades task deletion to its questions", () => {
    const ts = "2026-01-01T00:00:00Z";
    db.insert(tasks)
      .values({ id: "tsk_1", title: "Do a thing", status: "blocked", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(taskQuestions)
      .values([
        { id: "tq_1", taskId: "tsk_1", question: "Which DB?", askedAt: ts },
        { id: "tq_2", taskId: "tsk_1", question: "Which port?", askedAt: ts },
      ])
      .run();
    expect(db.select().from(taskQuestions).all()).toHaveLength(2);

    db.delete(tasks).where(eq(tasks.id, "tsk_1")).run();
    expect(db.select().from(taskQuestions).all()).toHaveLength(0);
  });

  it("stores structured question fields incl. options JSON round-trip", () => {
    const ts = "2026-01-01T00:00:00Z";
    db.insert(tasks)
      .values({ id: "tsk_2", title: "Pick", status: "blocked", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(taskQuestions)
      .values({
        id: "tq_3",
        taskId: "tsk_2",
        question: "REST or GraphQL?",
        whyBlocked: "not specified in the spec",
        options: ["REST", "GraphQL"],
        recommendation: "REST",
        askedAt: ts,
      })
      .run();
    const row = db.select().from(taskQuestions).where(eq(taskQuestions.id, "tq_3")).get()!;
    expect(row.options).toEqual(["REST", "GraphQL"]);
    expect(row.recommendation).toBe("REST");
    expect(row.answer).toBeNull();
  });
});
