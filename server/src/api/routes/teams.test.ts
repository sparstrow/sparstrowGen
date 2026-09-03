import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fastify from "fastify";
import { eq } from "drizzle-orm";
import { closeDb, openDb } from "../../db/connection.js";
import { teams, teamMembers, teamProjects, agents, projects, settings } from "../../db/schema.js";
import { teamRoutes } from "./teams.js";
import { TEAM_MANAGER_SLUG } from "../../agents/system-agents.js";
import { completeOnce } from "../../orchestrator/one-shot.js";

vi.mock("../../orchestrator/one-shot.js", () => ({
  completeOnce: vi.fn().mockResolvedValue({ text: "This is the advisor reply.", sessionId: "123", isError: false })
}));

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

describe("Team Manager Advisor", () => {
  let db: ReturnType<typeof openDb>["db"];
  let app: ReturnType<typeof fastify>;

  beforeEach(() => {
    closeDb();
    const result = openDb(":memory:");
    db = result.db;
    
    app = fastify();
    app.setErrorHandler((error: any, request: any, reply: any) => {
      const err = error as any;
      if (err.name === "ZodError" || err.code === "FST_ERR_VALIDATION") {
        reply.status(400).send({ message: "Validation error" });
      } else {
        reply.status(err.statusCode || 500).send({ message: err.message });
      }
    });

    app.register(teamRoutes);
    
    // Seed system agent
    db.insert(agents).values({
      id: "agt_sys1",
      slug: TEAM_MANAGER_SLUG,
      name: "Team Manager",
      role: "Advisor",
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      allowedTools: [],
      disallowedTools: [],
      systemPrompt: "You are an advisor.",
      isSystem: true,
      provider: "claude-code",
      model: "sonnet",
      cwd: null,
      addDirs: [],
      permissionMode: "default",
      mcpServers: {},
      memoryReadScopes: [],
      memoryWriteScopes: [],
      extraArgs: [],
    }).run();

    // Create a team
    db.insert(teams).values({
      id: "team_1",
      name: "Test Team",
      slug: "test-team",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns 403 if team manager is disabled", async () => {
    db.insert(settings).values({ key: "team_manager_enabled", value: "false" }).run();

    const response = await app.inject({
      method: "POST",
      url: "/teams/team_1/manager/chat",
      payload: { message: "Hello" }
    });

    expect(response.statusCode).toBe(403);
  });

  it("returns 404 if team does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/teams/team_xyz/manager/chat",
      payload: { message: "Hello" }
    });

    expect(response.statusCode).toBe(404);
  });

  it("calls completeOnce and returns reply on success", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/teams/team_1/manager/chat",
      payload: { message: "Give me advice" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ reply: "This is the advisor reply." });

    // Check completeOnce was called
    expect(completeOnce).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(completeOnce).mock.calls[0];
    expect(callArgs).toBeDefined();
    const agentArg = callArgs![0];
    const promptArg = callArgs![1];
    expect(agentArg.slug).toBe("team-manager");
    expect(promptArg).toContain("Give me advice");
  });

  it("returns 400 for invalid body schema", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/teams/team_1/manager/chat",
      payload: { message: "" } // min(1) fails
    });

    expect(response.statusCode).toBe(400); 
  });

  it("handles draft mode successfully", async () => {
    vi.mocked(completeOnce).mockResolvedValueOnce({
      text: JSON.stringify({
        reply: "Drafting it now.",
        draft: { name: "Test Pipeline" }
      }),
      isError: false
    } as any);

    const response = await app.inject({
      method: "POST",
      url: "/teams/team_1/manager/chat",
      payload: { message: "Make a pipeline", mode: "draft", draft: {} }
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.reply).toBe("Drafting it now.");
    expect(json.draft.name).toBe("Test Pipeline");
    expect(json.source).toBe("ai");
  });
});
