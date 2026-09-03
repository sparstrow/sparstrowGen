import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { closeDb, openDb } from "../../db/connection.js";
import { cronJobs } from "../../db/schema.js";
import { cronRoutes } from "./cron.js";
import { ensureSystemAgents } from "../../agents/system-agents.js";
import { ZodError } from "zod";
import { HttpError } from "../../orchestrator/run-manager.js";

const ts = "2026-01-01T00:00:00Z";

describe("cron routes - teamId filtering", () => {
  let db: ReturnType<typeof openDb>["db"];
  let app: FastifyInstance;

  beforeEach(async () => {
    closeDb();
    db = openDb(":memory:").db;
    ensureSystemAgents();

    // Insert test data
    db.insert(cronJobs).values([
      { id: "cj_global", name: "Global Cron", cronExpr: "* * * * *", targetType: "agent", targetId: "x", prompt: "x", enabled: true, createdAt: ts, updatedAt: ts },
      { id: "cj_teamA", name: "Team A Cron", teamId: "teamA", cronExpr: "* * * * *", targetType: "agent", targetId: "x", prompt: "x", enabled: true, createdAt: ts, updatedAt: ts },
      { id: "cj_teamB", name: "Team B Cron", teamId: "teamB", cronExpr: "* * * * *", targetType: "agent", targetId: "x", prompt: "x", enabled: true, createdAt: ts, updatedAt: ts },
    ]).run();

    app = Fastify();
    app.setErrorHandler((error: unknown, _request, reply) => {
      if (error instanceof ZodError) return reply.code(400).send({ error: "validation failed" });
      if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
      return reply.code(500).send({ error: "internal" });
    });
    await app.register(cronRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it("list with no teamId -> returns all (global/unchanged behavior)", async () => {
    const res = await app.inject({ method: "GET", url: "/cron-jobs" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(3);
    const ids = body.map((c: any) => c.id);
    expect(ids).toContain("cj_global");
    expect(ids).toContain("cj_teamA");
    expect(ids).toContain("cj_teamB");
  });

  it("list with teamId -> only that team's rows, excludes NULL", async () => {
    const res = await app.inject({ method: "GET", url: "/cron-jobs?teamId=teamA" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("cj_teamA");
  });
});
