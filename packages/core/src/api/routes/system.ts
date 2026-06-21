import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type ProviderHealth, type SystemHealth } from "@sparstrow/shared";
import { config } from "../../config.js";
import { getDb, getSqlite } from "../../db/connection.js";
import { settings } from "../../db/schema.js";
import {
  isSchedulerEnabled,
  requestShutdown,
  setSchedulerEnabled,
} from "../../lifecycle.js";
import { logger } from "../../logger.js";
import { embedderStatus } from "../../memory/embedder.js";
import { isVecAvailable } from "../../memory/search-store.js";
import { listProviders } from "../../providers/index.js";
import { startScheduler, stopScheduler } from "../../scheduler/service.js";

const startedAt = Date.now();

let providerHealthCache: { at: number; value: ProviderHealth[] } | null = null;
const PROVIDER_HEALTH_TTL_MS = 60_000;

async function getProviderHealth(): Promise<ProviderHealth[]> {
  if (providerHealthCache && Date.now() - providerHealthCache.at < PROVIDER_HEALTH_TTL_MS) {
    return providerHealthCache.value;
  }
  const value = await Promise.all(listProviders().map((p) => p.healthCheck()));
  providerHealthCache = { at: Date.now(), value };
  return value;
}

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/system/health", async (): Promise<SystemHealth> => {
    let dbOk = true;
    try {
      getSqlite().prepare("SELECT 1").get();
    } catch {
      dbOk = false;
    }
    const vaultOk = fs.existsSync(config.vaultPath);
    const providers = await getProviderHealth();
    return {
      ok: dbOk && vaultOk,
      version: "0.1.0",
      uptimeMs: Date.now() - startedAt,
      db: { ok: dbOk, path: config.dbPath },
      vault: { ok: vaultOk, path: config.vaultPath },
      providers,
      embedder: { ok: true, ...embedderStatus() },
      search: { vec: isVecAvailable() && embedderStatus().ready, fts: true },
    };
  });

  app.get("/system/settings", async () => {
    const rows = getDb().select().from(settings).all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put("/system/settings", async (request) => {
    const body = z.record(z.string()).parse(request.body);
    const db = getDb();
    for (const [key, value] of Object.entries(body)) {
      db.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run();
    }
    const rows = db.select().from(settings).all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.get("/system/scheduler", async () => ({ enabled: isSchedulerEnabled() }));

  /** Pause/resume all cron jobs without touching their definitions (tray toggle). */
  app.post("/system/scheduler", async (request) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    if (enabled !== isSchedulerEnabled()) {
      if (enabled) startScheduler();
      else stopScheduler();
      setSchedulerEnabled(enabled);
    }
    return { enabled: isSchedulerEnabled() };
  });

  /** Graceful shutdown, used by the desktop shell on quit. */
  app.post("/system/shutdown", async (_request, reply) => {
    reply.code(202).send({ ok: true });
    setTimeout(() => {
      void requestShutdown("api").catch((err) =>
        logger.error({ err }, "shutdown request failed"),
      );
    }, 50);
  });
}
