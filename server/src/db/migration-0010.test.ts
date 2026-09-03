import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { projects } from "./schema.js";

const ts = "2026-01-01T00:00:00Z";

const projectRow = (over: Partial<typeof projects.$inferInsert> = {}): typeof projects.$inferInsert => ({
  id: "prj_1",
  name: "Factory",
  slug: "factory",
  createdAt: ts,
  updatedAt: ts,
  ...over,
});

describe("migration 0010 — git automation & execution profiles", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0010 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0010_git_automation");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const cols = (getSqlite().prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toEqual(expect.arrayContaining(["execution_profile", "staging_branch"]));
  });

  it("the PAT is NOT a projects column (EC2 — it lives in the encrypted secret store)", () => {
    const cols = (getSqlite().prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols.some((c) => /pat|token|secret/i.test(c))).toBe(false);
  });

  it("existing projects default to the factory profile with no staging branch (P7-Q3)", () => {
    db.insert(projects).values(projectRow()).run();
    const p = db.select().from(projects).where(eq(projects.id, "prj_1")).get()!;
    expect(p.executionProfile).toBe("factory");
    expect(p.stagingBranch).toBeNull();
  });

  it("a project can be flipped to production_app with a staging branch", () => {
    db.insert(projects)
      .values(projectRow({ id: "prj_2", name: "Client", slug: "client", executionProfile: "production_app", stagingBranch: "staging" }))
      .run();
    const p = db.select().from(projects).where(eq(projects.id, "prj_2")).get()!;
    expect(p.executionProfile).toBe("production_app");
    expect(p.stagingBranch).toBe("staging");
  });
});
