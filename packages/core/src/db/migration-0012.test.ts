import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { tasks, pipelines, cronJobs } from "./schema.js";

const ts = "2026-01-01T00:00:00Z";

describe("migration 0012 — team workspace", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0012 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0012_team_workspace");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const taskCols = (getSqlite().prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map((c) => c.name);
    expect(taskCols).toContain("team_id");

    const pipelineCols = (getSqlite().prepare("PRAGMA table_info(pipelines)").all() as { name: string }[]).map((c) => c.name);
    expect(pipelineCols).toContain("team_id");

    const cronCols = (getSqlite().prepare("PRAGMA table_info(cron_jobs)").all() as { name: string }[]).map((c) => c.name);
    expect(cronCols).toContain("team_id");

    const taskIndexes = (getSqlite().prepare("PRAGMA index_list(tasks)").all() as { name: string }[]).map((i) => i.name);
    expect(taskIndexes).toContain("idx_tasks_team");

    const pipelineIndexes = (getSqlite().prepare("PRAGMA index_list(pipelines)").all() as { name: string }[]).map((i) => i.name);
    expect(pipelineIndexes).toContain("idx_pipelines_team");

    const cronIndexes = (getSqlite().prepare("PRAGMA index_list(cron_jobs)").all() as { name: string }[]).map((i) => i.name);
    expect(cronIndexes).toContain("idx_cron_jobs_team");
  });

  it("existing rows backfill team_id to NULL", () => {
    db.insert(tasks).values({
      id: "tsk_1",
      title: "Global Task",
      status: "inbox",
      createdAt: ts,
      updatedAt: ts,
    }).run();

    db.insert(pipelines).values({
      id: "pipe_1",
      name: "Global Pipeline",
      createdAt: ts,
      updatedAt: ts,
    }).run();

    db.insert(cronJobs).values({
      id: "cj_1",
      name: "Global Cron",
      cronExpr: "* * * * *",
      targetType: "pipeline",
      targetId: "pipe_1",
      prompt: "run",
      createdAt: ts,
      updatedAt: ts,
    }).run();

    const task = db.select().from(tasks).where(eq(tasks.id, "tsk_1")).get()!;
    expect(task.teamId).toBeNull();

    const pipeline = db.select().from(pipelines).where(eq(pipelines.id, "pipe_1")).get()!;
    expect(pipeline.teamId).toBeNull();

    const cronJob = db.select().from(cronJobs).where(eq(cronJobs.id, "cj_1")).get()!;
    expect(cronJob.teamId).toBeNull();
  });
});
