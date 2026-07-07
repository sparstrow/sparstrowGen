import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { Run, RunCreate } from "@sparstrow/shared";
import { closeDb, openDb } from "../../db/connection.js";
import { agents, runs } from "../../db/schema.js";
import { ensureSystemAgents } from "../../agents/system-agents.js";
import { HttpError, runManager } from "../../orchestrator/run-manager.js";
import { getGoal, handleGoalRunCompleted } from "../../goap/service.js";
import { goalRoutes } from "./goals.js";

const ts = "2026-01-01T00:00:00Z";

/**
 * Route tests (happy + error paths, rule 2). A minimal Fastify app mounts ONLY
 * goalRoutes with the production error handler semantics — auth and the other
 * route trees are out of scope here.
 */

let db: ReturnType<typeof openDb>["db"];
let app: FastifyInstance;

const PLAN = JSON.stringify({
  planSummary: "One step.",
  actions: [{ id: "work", label: "Do the work", description: "Do it.", agentHint: "coder" }],
});

function acceptPlan(goalId: string): void {
  const runId = getGoal(goalId)!.plannerRunId!;
  db.update(runs).set({ status: "succeeded", resultText: PLAN, finishedAt: ts }).where(eq(runs.id, runId)).run();
  handleGoalRunCompleted({ ...db.select().from(runs).where(eq(runs.id, runId)).get()! } as unknown as Run);
}

beforeEach(async () => {
  closeDb();
  db = openDb(":memory:").db;
  ensureSystemAgents();
  db.insert(agents)
    .values({ id: "agt_c", name: "Coder", slug: "coder", provider: "claude-code", model: "x", createdAt: ts, updatedAt: ts })
    .run();
  vi.spyOn(runManager, "createRun").mockImplementation((input: RunCreate): Run => {
    const id = `run_${nanoid(10)}`;
    db.insert(runs)
      .values({
        id,
        agentId: input.agentId,
        projectId: input.projectId ?? null,
        trigger: input.trigger ?? "manual",
        triggerRef: input.triggerRef ?? null,
        mode: "headless",
        prompt: input.prompt,
        status: "queued",
        createdAt: new Date().toISOString(),
      })
      .run();
    return { ...db.select().from(runs).where(eq(runs.id, id)).get()! } as unknown as Run;
  });

  app = Fastify();
  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "validation failed" });
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    return reply.code(500).send({ error: "internal" });
  });
  await app.register(goalRoutes);
  await app.ready();
});
afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
  closeDb();
});

describe("goal routes", () => {
  it("POST /goals creates a planning goal (201); GET lists and details it", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/goals",
      payload: { prompt: "Build the settings page" },
    });
    expect(created.statusCode).toBe(201);
    const goal = created.json();
    expect(goal.status).toBe("planning");

    const list = await app.inject({ method: "GET", url: "/goals" });
    expect(list.json()).toHaveLength(1);

    acceptPlan(goal.id);
    const detail = await app.inject({ method: "GET", url: `/goals/${goal.id}` });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.goal.status).toBe("running");
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0].status).toBe("running");
  });

  it("POST /goals with an empty prompt is a 400; unknown project is a 404", async () => {
    const bad = await app.inject({ method: "POST", url: "/goals", payload: { prompt: "" } });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: "/goals",
      payload: { prompt: "x", projectId: "prj_missing" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("pause/resume/cancel drive the lifecycle; replay of cancel is a 409", async () => {
    const created = await app.inject({ method: "POST", url: "/goals", payload: { prompt: "x" } });
    const id = created.json().id;
    acceptPlan(id);

    const paused = await app.inject({ method: "POST", url: `/goals/${id}/pause` });
    expect(paused.json().paused).toBe(true);
    const resumed = await app.inject({ method: "POST", url: `/goals/${id}/resume` });
    expect(resumed.json().paused).toBe(false);

    const cancelled = await app.inject({ method: "POST", url: `/goals/${id}/cancel` });
    expect(cancelled.json().status).toBe("cancelled");
    const again = await app.inject({ method: "POST", url: `/goals/${id}/cancel` });
    expect(again.statusCode).toBe(409);
  });

  it("node retry validates the node id; delete refuses a running goal then removes a cancelled one", async () => {
    const created = await app.inject({ method: "POST", url: "/goals", payload: { prompt: "x" } });
    const id = created.json().id;
    acceptPlan(id);

    const badRetry = await app.inject({ method: "POST", url: `/goals/${id}/nodes/pn_missing/retry` });
    expect(badRetry.statusCode).toBe(404);
    const badCancel = await app.inject({ method: "POST", url: `/goals/${id}/nodes/pn_missing/cancel` });
    expect(badCancel.statusCode).toBe(404);

    const earlyDelete = await app.inject({ method: "DELETE", url: `/goals/${id}` });
    expect(earlyDelete.statusCode).toBe(409);

    await app.inject({ method: "POST", url: `/goals/${id}/cancel` });
    const deleted = await app.inject({ method: "DELETE", url: `/goals/${id}` });
    expect(deleted.statusCode).toBe(204);
    const gone = await app.inject({ method: "GET", url: `/goals/${id}` });
    expect(gone.statusCode).toBe(404);
  });

  it("GET /goals/:id on an unknown goal is a 404; replan on a planning goal is a 409", async () => {
    const gone = await app.inject({ method: "GET", url: "/goals/gl_missing" });
    expect(gone.statusCode).toBe(404);

    const created = await app.inject({ method: "POST", url: "/goals", payload: { prompt: "x" } });
    const replan = await app.inject({ method: "POST", url: `/goals/${created.json().id}/replan`, payload: {} });
    expect(replan.statusCode).toBe(409);
  });
});
