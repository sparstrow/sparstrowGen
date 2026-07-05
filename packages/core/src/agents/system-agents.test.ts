import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, openDb } from "../db/connection.js";
import { agents } from "../db/schema.js";
import {
  ensureSystemAgents,
  getSystemAgentId,
  PROJECT_INDEXER_SLUG,
  PROJECT_REPORTER_SLUG,
} from "./system-agents.js";

describe("system agents (P4)", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });
  afterEach(() => closeDb());

  it("seeds the Project Indexer + Reporter as hidden, least-privilege agents", () => {
    ensureSystemAgents();
    const db = openDb(":memory:").db; // same in-memory db (already open)
    void db;
    const indexer = getDbAgent(PROJECT_INDEXER_SLUG);
    const reporter = getDbAgent(PROJECT_REPORTER_SLUG);
    expect(indexer.isSystem).toBe(true);
    expect(reporter.isSystem).toBe(true);
    // Least privilege: read tools only, no Bash/Write/Edit.
    expect(indexer.allowedTools).toEqual(expect.arrayContaining(["Read", "Glob", "Grep"]));
    expect(indexer.disallowedTools).toEqual(expect.arrayContaining(["Bash", "Write", "Edit"]));
    // Can write project memory (so it can persist the index).
    expect(indexer.memoryWriteScopes).toContain("project:*");
  });

  it("is idempotent (re-seeding does not duplicate)", () => {
    ensureSystemAgents();
    ensureSystemAgents();
    ensureSystemAgents();
    const all = openDb(":memory:").db.select().from(agents).all();
    expect(all.filter((a) => a.slug === PROJECT_INDEXER_SLUG)).toHaveLength(1);
    expect(all.filter((a) => a.slug === PROJECT_REPORTER_SLUG)).toHaveLength(1);
  });

  it("repairs is_system on a pre-existing plain row", () => {
    const db = openDb(":memory:").db;
    const ts = "2026-01-01T00:00:00Z";
    db.insert(agents)
      .values({ id: "agt_x", name: "Project Indexer", slug: PROJECT_INDEXER_SLUG, provider: "claude-code", model: "sonnet", isSystem: false, createdAt: ts, updatedAt: ts })
      .run();
    ensureSystemAgents();
    expect(db.select().from(agents).where(eq(agents.slug, PROJECT_INDEXER_SLUG)).get()!.isSystem).toBe(true);
  });

  it("getSystemAgentId returns null when unseeded, an id after seeding", () => {
    expect(getSystemAgentId(PROJECT_REPORTER_SLUG)).toBeNull();
    ensureSystemAgents();
    expect(getSystemAgentId(PROJECT_REPORTER_SLUG)).toMatch(/^agt_/);
  });
});

function getDbAgent(slug: string) {
  return openDb(":memory:").db.select().from(agents).where(eq(agents.slug, slug)).get()!;
}
