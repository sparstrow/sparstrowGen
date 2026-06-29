import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, openDb } from "../../db/connection.js";
import { teams, teamMembers, teamProjects, agents, projects } from "../../db/schema.js";

describe("Teams DB schema", () => {
  let db: ReturnType<typeof openDb>["db"];
  let sqlite: ReturnType<typeof openDb>["sqlite"];

  beforeEach(() => {
    closeDb();
    const result = openDb(":memory:");
    db = result.db;
    sqlite = result.sqlite;
  });

  afterEach(() => {
    closeDb();
  });

  it("enforces UNIQUE constraint on team name", () => {
    db.insert(teams).values({
      id: "team_1",
      name: "Alpha",
      slug: "alpha",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    }).run();

    expect(() => {
      db.insert(teams).values({
        id: "team_2",
        name: "Alpha",
        slug: "beta",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      }).run();
    }).toThrow(/UNIQUE constraint failed: teams\.name/);
  });

  it("cascades team deletion to members and projects", () => {
    // Setup references
    db.insert(agents).values({
      id: "agt_1", name: "Agent 1", slug: "agent-1",
      provider: "test", model: "test",
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    }).run();
    db.insert(projects).values({
      id: "proj_1", name: "Proj 1", slug: "proj-1",
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    }).run();

    // Create team
    db.insert(teams).values({
      id: "team_1", name: "Team", slug: "team",
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    }).run();

    // Add member and project
    db.insert(teamMembers).values({ id: "tmb_1", teamId: "team_1", agentId: "agt_1" }).run();
    db.insert(teamProjects).values({ teamId: "team_1", projectId: "proj_1" }).run();

    expect(db.select().from(teamMembers).all().length).toBe(1);
    expect(db.select().from(teamProjects).all().length).toBe(1);

    // Delete team
    db.delete(teams).where(eq(teams.id, "team_1")).run();

    // Verify cascade
    expect(db.select().from(teamMembers).all().length).toBe(0);
    expect(db.select().from(teamProjects).all().length).toBe(0);
  });

  it("cascades agent deletion to its memberships", () => {
    db.insert(teams).values({
      id: "team_1", name: "Team", slug: "team",
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    }).run();
    db.insert(agents).values({
      id: "agt_1", name: "Agent 1", slug: "agent-1",
      provider: "test", model: "test",
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    }).run();

    db.insert(teamMembers).values({ id: "tmb_1", teamId: "team_1", agentId: "agt_1" }).run();

    // Delete agent
    db.delete(agents).where(eq(agents.id, "agt_1")).run();

    // Verify cascade
    expect(db.select().from(teamMembers).all().length).toBe(0);
  });

  it("rejects duplicate project assignments via composite PK", () => {
    db.insert(teams).values({
      id: "team_1", name: "Team", slug: "team",
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    }).run();
    db.insert(projects).values({
      id: "proj_1", name: "Proj 1", slug: "proj-1",
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    }).run();

    db.insert(teamProjects).values({ teamId: "team_1", projectId: "proj_1" }).run();

    expect(() => {
      db.insert(teamProjects).values({ teamId: "team_1", projectId: "proj_1" }).run();
    }).toThrow(/UNIQUE constraint failed/);
  });
});
