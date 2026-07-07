import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { goals, planEdges, planNodes } from "./schema.js";

const ts = "2026-01-01T00:00:00Z";

const goalRow = (over: Partial<typeof goals.$inferInsert> = {}): typeof goals.$inferInsert => ({
  id: "gl_1",
  prompt: "Build the memory settings page",
  createdAt: ts,
  updatedAt: ts,
  ...over,
});

const nodeRow = (over: Partial<typeof planNodes.$inferInsert> = {}): typeof planNodes.$inferInsert => ({
  id: "pn_1",
  goalId: "gl_1",
  planVersion: 1,
  actionId: "write_schema",
  label: "Write the schema",
  createdAt: ts,
  ...over,
});

describe("migration 0009 — goal engine", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0009 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0009_goal_engine");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const goalCols = (getSqlite().prepare("PRAGMA table_info(goals)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(goalCols).toEqual(
      expect.arrayContaining([
        "prompt",
        "status",
        "plan_version",
        "replan_count",
        "consensus",
        "paused",
        "pending_replan_reason",
        "blocked_reason",
        "planner_run_id",
        "world_state",
        "version_log",
        "user_id",
      ]),
    );
    // EM4: node status is DERIVED — the column must NOT exist.
    const nodeCols = (getSqlite().prepare("PRAGMA table_info(plan_nodes)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(nodeCols).not.toContain("status");
    expect(nodeCols).toEqual(
      expect.arrayContaining(["action_id", "agent_hint", "agent_id", "kind", "task_id", "user_id"]),
    );
  });

  it("defaults: fresh goal is planning/v0/unpaused with empty JSON trails", () => {
    db.insert(goals).values(goalRow()).run();
    const g = db.select().from(goals).where(eq(goals.id, "gl_1")).get()!;
    expect(g.status).toBe("planning");
    expect(g.planVersion).toBe(0);
    expect(g.replanCount).toBe(0);
    expect(g.consensus).toBe("auto");
    expect(g.paused).toBe(false);
    expect(g.worldState).toEqual([]);
    expect(g.versionLog).toEqual([]);
  });

  it("deleting a goal cascades to its nodes and edges (whole graph goes)", () => {
    db.insert(goals).values(goalRow()).run();
    db.insert(planNodes).values(nodeRow()).run();
    db.insert(planNodes).values(nodeRow({ id: "pn_2", actionId: "write_api" })).run();
    db.insert(planEdges)
      .values({ goalId: "gl_1", planVersion: 1, fromNodeId: "pn_1", toNodeId: "pn_2" })
      .run();

    db.delete(goals).where(eq(goals.id, "gl_1")).run();
    expect(db.select().from(planNodes).all()).toHaveLength(0);
    expect(db.select().from(planEdges).all()).toHaveLength(0);
  });

  it("deleting a node cascades its edges (replan rewrites never leave dangling refs)", () => {
    db.insert(goals).values(goalRow()).run();
    db.insert(planNodes).values(nodeRow()).run();
    db.insert(planNodes).values(nodeRow({ id: "pn_2", actionId: "write_api" })).run();
    db.insert(planEdges)
      .values({ goalId: "gl_1", planVersion: 1, fromNodeId: "pn_1", toNodeId: "pn_2" })
      .run();

    db.delete(planNodes).where(eq(planNodes.id, "pn_1")).run();
    expect(db.select().from(planEdges).all()).toHaveLength(0);
    expect(db.select().from(planNodes).all()).toHaveLength(1);
  });

  it("rejects a node without its goal (FK) and a duplicate action within one version", () => {
    expect(() => db.insert(planNodes).values(nodeRow({ goalId: "gl_missing" })).run()).toThrow();

    db.insert(goals).values(goalRow()).run();
    db.insert(planNodes).values(nodeRow()).run();
    // same (goal, version, action) → unique violation
    expect(() => db.insert(planNodes).values(nodeRow({ id: "pn_dup" })).run()).toThrow();
    // same action in the NEXT version is fine (carry-forward identity)
    db.insert(planNodes).values(nodeRow({ id: "pn_v2", planVersion: 2 })).run();
    expect(db.select().from(planNodes).all()).toHaveLength(2);
  });

  it("goals.project_id has NO FK — a goal survives without its project row (code-enforced)", () => {
    db.insert(goals).values(goalRow({ projectId: "prj_missing" })).run();
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
