import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { agentInstances, agents, projects, runs, tasks, teams } from "./schema.js";

const ts = "2026-01-01T00:00:00Z";

describe("migration 0006 — delegation, ephemeral teams, agent instances", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0006 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0006_delegation");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const taskCols = (getSqlite().prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(taskCols).toContain("parent_task_id");
    expect(taskCols).toContain("parent_effective_tools");
    const teamCols = (getSqlite().prepare("PRAGMA table_info(teams)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(teamCols).toEqual(expect.arrayContaining(["is_ephemeral", "linked_task_id", "archived_at"]));
    const runCols = (getSqlite().prepare("PRAGMA table_info(runs)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(runCols).toContain("agent_instance_id");
  });

  it("delegation columns round-trip: parentage + the S1-a effective-tools bound", () => {
    db.insert(tasks)
      .values({ id: "tsk_parent", title: "Lead", status: "waiting_children", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(tasks)
      .values({
        id: "tsk_child",
        title: "Child",
        status: "todo",
        parentTaskId: "tsk_parent",
        parentEffectiveTools: { allowed: ["Read"], disallowed: ["Bash"] },
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const child = db.select().from(tasks).where(eq(tasks.id, "tsk_child")).get()!;
    expect(child.parentTaskId).toBe("tsk_parent");
    expect(child.parentEffectiveTools).toEqual({ allowed: ["Read"], disallowed: ["Bash"] });
    // Existing tasks keep null (no clamp, no parent).
    const parent = db.select().from(tasks).where(eq(tasks.id, "tsk_parent")).get()!;
    expect(parent.parentTaskId).toBeNull();
    expect(parent.parentEffectiveTools).toBeNull();
  });

  it("teams default to non-ephemeral, unarchived (existing rows unaffected)", () => {
    db.insert(teams).values({ id: "team_1", name: "Core", slug: "core", createdAt: ts, updatedAt: ts }).run();
    const team = db.select().from(teams).where(eq(teams.id, "team_1")).get()!;
    expect(team.isEphemeral).toBe(false);
    expect(team.linkedTaskId).toBeNull();
    expect(team.archivedAt).toBeNull();
  });

  it("agent_instances enforces one instance per (agent, project) and cascades on delete", () => {
    db.insert(agents)
      .values({ id: "agt_1", name: "Coder", slug: "coder", provider: "claude-code", model: "x", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(projects).values({ id: "proj_1", name: "P", slug: "p", createdAt: ts, updatedAt: ts }).run();
    db.insert(agentInstances)
      .values({ id: "ai_1", agentId: "agt_1", projectId: "proj_1", createdAt: ts })
      .run();

    // UNIQUE(agent_id, project_id): a second instance for the same pair is rejected.
    expect(() =>
      db.insert(agentInstances).values({ id: "ai_2", agentId: "agt_1", projectId: "proj_1", createdAt: ts }).run(),
    ).toThrow(/UNIQUE/i);

    // runs.agent_instance_id round-trips.
    db.insert(runs)
      .values({
        id: "run_1",
        agentId: "agt_1",
        projectId: "proj_1",
        agentInstanceId: "ai_1",
        trigger: "manual",
        mode: "headless",
        prompt: "p",
        status: "queued",
        createdAt: ts,
      })
      .run();
    expect(db.select().from(runs).where(eq(runs.id, "run_1")).get()!.agentInstanceId).toBe("ai_1");

    // ON DELETE CASCADE from the project side.
    db.delete(projects).where(eq(projects.id, "proj_1")).run();
    expect(db.select().from(agentInstances).all()).toHaveLength(0);
  });
});
