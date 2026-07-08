import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { githubPatUpdateSchema, type ProviderHealth, type SystemHealth } from "@sparstrow/shared";
import { config } from "../../config.js";
import { getDb, getSqlite } from "../../db/connection.js";
import { settings } from "../../db/schema.js";
import { clearPrQueueCache } from "../../projects/pr-queue.js";
import { SECRET_GITHUB_PAT, deleteSecret, getSecretMeta, setSecret } from "../../secrets/secret-store.js";
import { getFactoryHealth } from "../../system/factory-health.js";
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

  /** Rule 23 — "is my factory armed?" self-check (graph engine, embedder, PAT, providers). */
  app.get("/system/factory-health", async () => getFactoryHealth());

  /**
   * P7 (EC2) — the GitHub PAT lives in the encrypted secret store, NEVER the
   * settings table, so it is deliberately absent from GET /system/settings. These
   * endpoints only ever expose presence + a masked hint; the raw token never
   * leaves core (used only by core-side git ops).
   */
  app.get("/system/secrets/github-pat", async () => getSecretMeta(SECRET_GITHUB_PAT));

  app.put("/system/secrets/github-pat", async (request) => {
    const { token } = githubPatUpdateSchema.parse(request.body);
    setSecret(SECRET_GITHUB_PAT, token.trim());
    clearPrQueueCache();
    return getSecretMeta(SECRET_GITHUB_PAT);
  });

  app.delete("/system/secrets/github-pat", async (_request, reply) => {
    deleteSecret(SECRET_GITHUB_PAT);
    clearPrQueueCache();
    reply.code(204);
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
