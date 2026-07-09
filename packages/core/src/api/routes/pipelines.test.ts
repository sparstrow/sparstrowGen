import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { closeDb, openDb } from "../../db/connection.js";
import { pipelines, agents, teams } from "../../db/schema.js";
import { pipelineRoutes } from "./pipelines.js";
import { ensureSystemAgents } from "../../agents/system-agents.js";
import { ZodError } from "zod";
import { HttpError } from "../../orchestrator/run-manager.js";

const ts = "2026-01-01T00:00:00Z";

describe("pipeline routes - teamId filtering", () => {
  let db: ReturnType<typeof openDb>["db"];
  let app: FastifyInstance;

  beforeEach(async () => {
    closeDb();
    db = openDb(":memory:").db;
    ensureSystemAgents();

    db.insert(agents).values([
      { id: "agent1", name: "Agent 1", slug: "agent-1", provider: "mock", model: "mock", createdAt: ts, updatedAt: ts },
      { id: "agent2", name: "Agent 2", slug: "agent-2", provider: "mock", model: "mock", createdAt: ts, updatedAt: ts }
    ]).run();

    db.insert(teams).values([
      { id: "teamA", name: "Team A", slug: "team-a", createdAt: ts, updatedAt: ts },
      { id: "teamB", name: "Team B", slug: "team-b", createdAt: ts, updatedAt: ts }
    ]).run();

    // Insert test data
    db.insert(pipelines).values([
      { id: "pipe_global", name: "Global Pipe", description: "", enabled: true, createdAt: ts, updatedAt: ts },
      { id: "pipe_teamA", name: "Team A Pipe", teamId: "teamA", description: "", enabled: true, createdAt: ts, updatedAt: ts },
      { id: "pipe_teamB", name: "Team B Pipe", teamId: "teamB", description: "", enabled: true, createdAt: ts, updatedAt: ts },
    ]).run();

    app = Fastify();
    app.setErrorHandler((error: unknown, _request, reply) => {
      if (error instanceof ZodError) return reply.code(400).send({ error: "validation failed" });
      if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
      return reply.code(500).send({ error: "internal" });
    });
    await app.register(pipelineRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it("list with no teamId -> returns all (global/unchanged behavior)", async () => {
    const res = await app.inject({ method: "GET", url: "/pipelines" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(3);
    const ids = body.map((p: any) => p.id);
    expect(ids).toContain("pipe_global");
    expect(ids).toContain("pipe_teamA");
    expect(ids).toContain("pipe_teamB");
  });

  it("list with teamId -> only that team's rows, excludes NULL", async () => {
    const res = await app.inject({ method: "GET", url: "/pipelines?teamId=teamA" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("pipe_teamA");
  });

  it("POST /pipelines with a valid teamId persists it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pipelines",
      payload: { name: "New Team Pipe", teamId: "teamA", steps: [] }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.teamId).toBe("teamA");
    expect(body.name).toBe("New Team Pipe");

    const getRes = await app.inject({ method: "GET", url: "/pipelines?teamId=teamA" });
    expect(getRes.json().some((p: any) => p.id === body.id)).toBe(true);
  });

  it("POST /pipelines with an unknown step.agentId -> 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pipelines",
      payload: {
        name: "Bad Agents Pipe",
        steps: [{ agentId: "nope", promptTemplate: "hi" }]
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("unknown agentIds");
  });

  it("POST /pipelines with an unknown teamId -> 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pipelines",
      payload: { name: "Bad Team Pipe", teamId: "teamNope" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("unknown teamId");
  });

  it("POST /pipelines with all-valid agents + no team -> 201 (global path still works)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pipelines",
      payload: {
        name: "Global Valid Pipe",
        steps: [{ agentId: "agent1", promptTemplate: "hi" }]
      }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().teamId).toBeNull();
  });

  it("PUT /pipelines/:id replacing steps with an unknown agent -> 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/pipelines/pipe_global",
      payload: {
        steps: [{ agentId: "nope2", promptTemplate: "hi" }]
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("unknown agentIds");
  });
});
