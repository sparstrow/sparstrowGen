import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/connection.js";
import { projects } from "../../db/schema.js";
import { logger } from "../../logger.js";
import { getEngineStatus, installEngine } from "../../graph/binary-manager.js";
import { getGraphPool } from "../../graph/graph-client.js";
import { enqueueGraphIndex } from "../../graph/graph-lifecycle.js";

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
