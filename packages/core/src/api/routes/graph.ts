import type { FastifyInstance } from "fastify";
import { and, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { projects, runEvents, runs } from "../../db/schema.js";
import { logger } from "../../logger.js";
import { getEngineStatus, installEngine } from "../../graph/binary-manager.js";
import { getGraphPool } from "../../graph/graph-client.js";
import { enqueueGraphIndex } from "../../graph/graph-lifecycle.js";
import { GRAPH_TOOL_NAMES } from "../../graph/graph-tools.js";
import { launchViz, stopViz, vizStatus } from "../../graph/viz-manager.js";

/**
 * P5 engine-level routes (per-project index state lives on /projects/:id/graph).
 * Settings shows ONE engine row (design F4 split); every install transition is
 * also pushed as a graph.engine.status ws event by the binary manager.
 */
export async function graphRoutes(app: FastifyInstance): Promise<void> {
  app.get("/graph/engine", async () => getEngineStatus());

  /**
   * T-a (owner gate): install is an EXPLICIT owner action from Settings — a
   * predictable Defender moment, never a silent background fetch. Kicks off in
   * the background (36 MB download); progress arrives over ws.
   */
  app.post("/graph/engine/install", async (request, reply) => {
    const { variant } = (request.body ?? {}) as { variant?: "std" | "ui" };
    void installEngine({ variant: variant ?? "std" }).then((res) => {
      if (!res.ok) logger.warn({ error: res.error }, "graph engine install failed");
    });
    reply.code(202);
    return { started: true, status: getEngineStatus() };
  });

  /** Settings → Retry: clears crash-loop breaker latches (audit #40). */
  app.post("/graph/engine/retry", async () => {
    getGraphPool().resetBreaker();
    return { ok: true, pool: getGraphPool().getStatus() };
  });

  /**
   * T10 (DX F7): post-install "Index all projects now" — kills the per-project
   * Reindex click tax. Serialized by the global index semaphore; sandboxes are
   * excluded by the auto rule (#41).
   */
  /**
   * T9/DX F8: the phase success criterion needs a denominator — "graph tools
   * used in N of M runs" per project. Tool calls live as tool_use blocks inside
   * assistant run-event payloads; a LIKE scan over the tool-name markers is
   * accurate enough for a local diagnostic (no new tables, no event parser).
   */
  app.get("/projects/:id/graph/usage", async (request) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const total = db
      .select({ n: sql<number>`count(*)` })
      .from(runs)
      .where(eq(runs.projectId, id))
      .get();
    const nameMarks = GRAPH_TOOL_NAMES.map((n) => like(runEvents.payload, `%"name":"${n}"%`));
    const used = db
      .select({ n: sql<number>`count(distinct ${runEvents.runId})` })
      .from(runEvents)
      .innerJoin(runs, eq(runs.id, runEvents.runId))
      .where(and(eq(runs.projectId, id), eq(runEvents.type, "assistant"), or(...nameMarks)))
      .get();
    return { runsWithGraph: used?.n ?? 0, totalRuns: total?.n ?? 0 };
  });

  // ── T11 (UC2): 3D visualization — new tab, on-demand, idle auto-stop ──
  app.get("/projects/:id/graph/viz", async (request) => {
    const { id } = request.params as { id: string };
    return vizStatus(id);
  });
  app.post("/projects/:id/graph/viz", async (request, reply) => {
    const { id } = request.params as { id: string };
    const res = await launchViz(id);
    if (!res.ok) reply.code(res.reason === "ui-not-installed" ? 409 : 502);
    return res;
  });
  app.delete("/projects/:id/graph/viz", async (request, reply) => {
    const { id } = request.params as { id: string };
    await stopViz(id);
    reply.code(204);
  });

  app.post("/graph/index-all", async (_request, reply) => {
    let queued = 0;
    let skipped = 0;
    for (const row of getDb().select().from(projects).all()) {
      const res = enqueueGraphIndex(row.id, { reason: "auto" });
      if (res.queued) queued += 1;
      else skipped += 1;
    }
    reply.code(202);
    return { queued, skipped };
  });
}
