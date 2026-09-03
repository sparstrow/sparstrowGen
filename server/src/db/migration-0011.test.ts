import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { agents, skillImports } from "./schema.js";

const ts = "2026-01-01T00:00:00Z";

const agentRow = (
  over: Partial<typeof agents.$inferInsert> = {},
): typeof agents.$inferInsert => ({
  id: "agt_1",
  name: "Imported Skill",
  slug: "imported-skill",
  provider: "claude-code",
  model: "sonnet",
  createdAt: ts,
  updatedAt: ts,
  ...over,
});

describe("migration 0011 — skill ingestion & quarantine", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0011 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0011_skill_ingestion");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const cols = (getSqlite().prepare("PRAGMA table_info(agents)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toEqual(
      expect.arrayContaining(["origin", "status", "specter_report", "import_id", "sandbox_project_id"]),
    );
  });

  it("existing agents backfill to origin=user, status=active, no specter report", () => {
    db.insert(agents).values(agentRow()).run();
    const a = db.select().from(agents).where(eq(agents.id, "agt_1")).get()!;
    expect(a.origin).toBe("user");
    expect(a.status).toBe("active");
    expect(a.specterReport).toBeNull();
    expect(a.importId).toBeNull();
    expect(a.sandboxProjectId).toBeNull();
  });

  it("a quarantined imported skill round-trips (disabled, linked, specter card)", () => {
    db.insert(agents)
      .values(
        agentRow({
          id: "agt_2",
          name: "Quarantined",
          slug: "quarantined",
          origin: "import",
          status: "quarantined",
          enabled: false,
          allowedTools: [],
          importId: "imp_1",
          sandboxProjectId: "prj_sbx",
          specterReport: {
            verdict: "flag",
            summary: "requests Bash",
            findings: [{ severity: "warn", category: "tool-request", detail: "asks for Bash" }],
            suggestedModifications: ["drop Bash"],
            staticFlags: ["bash-request"],
            llmReviewed: true,
            reviewedAt: ts,
          },
        }),
      )
      .run();
    const a = db.select().from(agents).where(eq(agents.id, "agt_2")).get()!;
    expect(a.origin).toBe("import");
    expect(a.status).toBe("quarantined");
    expect(a.enabled).toBe(false);
    expect(a.importId).toBe("imp_1");
    expect(a.specterReport?.verdict).toBe("flag");
    expect(a.specterReport?.staticFlags).toContain("bash-request");
  });

  it("skill_imports rows persist the ingestion lifecycle", () => {
    db.insert(skillImports)
      .values({
        id: "imp_1",
        sourceUrl: "https://example.com/agents.git",
        status: "cloning",
        foundSkillCount: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const imp = db.select().from(skillImports).where(eq(skillImports.id, "imp_1")).get()!;
    expect(imp.status).toBe("cloning");
    expect(imp.foundSkillCount).toBe(0);
    expect(imp.sandboxProjectId).toBeNull();
    expect(imp.extractorRunId).toBeNull();
  });
});
