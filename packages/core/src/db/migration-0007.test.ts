import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { agents, projectDirectives, projects } from "./schema.js";

const ts = "2026-01-01T00:00:00Z";

describe("migration 0007 — projects workspace", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0007 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0007_projects_workspace");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const projCols = (getSqlite().prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(projCols).toEqual(expect.arrayContaining(["parent_project_id", "is_sandbox", "git_remote"]));
    const agentCols = (getSqlite().prepare("PRAGMA table_info(agents)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(agentCols).toContain("is_system");
    const dirCols = (getSqlite().prepare("PRAGMA table_info(project_directives)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(dirCols).toEqual(expect.arrayContaining(["project_id", "body", "sort", "enabled"]));
  });

  it("project columns default correctly (existing rows unaffected)", () => {
    db.insert(projects).values({ id: "prj_1", name: "Base", slug: "base", createdAt: ts, updatedAt: ts }).run();
    const p = db.select().from(projects).where(eq(projects.id, "prj_1")).get()!;
    expect(p.parentProjectId).toBeNull();
    expect(p.isSandbox).toBe(false);
    expect(p.gitRemote).toBeNull();
  });

  it("agents.is_system defaults false", () => {
    db.insert(agents)
      .values({ id: "agt_1", name: "Coder", slug: "coder", provider: "claude-code", model: "x", createdAt: ts, updatedAt: ts })
      .run();
    expect(db.select().from(agents).where(eq(agents.id, "agt_1")).get()!.isSystem).toBe(false);
  });

  it("project_directives: defaults + ON DELETE CASCADE from the project", () => {
    db.insert(projects).values({ id: "prj_1", name: "Base", slug: "base", createdAt: ts, updatedAt: ts }).run();
    db.insert(projectDirectives)
      .values({ id: "pd_1", projectId: "prj_1", body: "Always use Tailwind.", createdAt: ts, updatedAt: ts })
      .run();
    const d = db.select().from(projectDirectives).where(eq(projectDirectives.id, "pd_1")).get()!;
    expect(d.sort).toBe(0);
    expect(d.enabled).toBe(true);

    db.delete(projects).where(eq(projects.id, "prj_1")).run();
    expect(db.select().from(projectDirectives).all()).toHaveLength(0);
  });
});
