import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { closeDb, openDb } from "../../db/connection.js";
import { tasks } from "../../db/schema.js";
import { taskRoutes } from "./tasks.js";
import { ensureSystemAgents } from "../../agents/system-agents.js";
import { ZodError } from "zod";
import { HttpError } from "../../orchestrator/run-manager.js";

const ts = "2026-01-01T00:00:00Z";

describe("task routes - teamId filtering", () => {
  let db: ReturnType<typeof openDb>["db"];
  let app: FastifyInstance;

  beforeEach(async () => {
    closeDb();
    db = openDb(":memory:").db;
    ensureSystemAgents();

    // Insert test data
    db.insert(tasks).values([
      { id: "tsk_global", title: "Global Task", status: "inbox", createdByType: "user", createdAt: ts, updatedAt: ts },
      { id: "tsk_teamA", title: "Team A Task", teamId: "teamA", status: "inbox", createdByType: "user", createdAt: ts, updatedAt: ts },
      { id: "tsk_teamB", title: "Team B Task", teamId: "teamB", status: "inbox", createdByType: "user", createdAt: ts, updatedAt: ts },
    ]).run();

    app = Fastify();
    app.setErrorHandler((error: unknown, _request, reply) => {
      if (error instanceof ZodError) return reply.code(400).send({ error: "validation failed" });
      if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
      return reply.code(500).send({ error: "internal" });
    });
    await app.register(taskRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it("list with no teamId -> returns all (global/unchanged behavior)", async () => {
    const res = await app.inject({ method: "GET", url: "/tasks" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(3);
    const ids = body.map((t: any) => t.id);
    expect(ids).toContain("tsk_global");
    expect(ids).toContain("tsk_teamA");
    expect(ids).toContain("tsk_teamB");
  });

  it("list with teamId -> only that team's rows, excludes NULL", async () => {
    const res = await app.inject({ method: "GET", url: "/tasks?teamId=teamA" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("tsk_teamA");
  });
});
