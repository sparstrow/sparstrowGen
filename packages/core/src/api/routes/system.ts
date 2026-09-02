import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  githubPatUpdateSchema,
  type ProviderHealth,
  type SystemHealth,
  type UpdateReadiness,
} from "@sparstrow/shared";
import { config } from "../../config.js";
import { getDb, getSqlite } from "../../db/connection.js";
import { settings } from "../../db/schema.js";
import { clearPrQueueCache } from "../../projects/pr-queue.js";
import { SECRET_GITHUB_PAT, deleteSecret, getSecretMeta, setSecret } from "../../secrets/secret-store.js";
import { getFactoryHealth } from "../../system/factory-health.js";
import {
  isDraining,
  isSchedulerEnabled,
  requestShutdown,
  setDraining,
  setSchedulerEnabled,
} from "../../lifecycle.js";
import { runManager } from "../../orchestrator/run-manager.js";
import { logger } from "../../logger.js";
import { embedderStatus } from "../../memory/embedder.js";
import { isVecAvailable } from "../../memory/search-store.js";
import { listProviders } from "../../providers/index.js";
import { startScheduler, stopScheduler } from "../../scheduler/service.js";
import {
  clearConnection,
  getMachineId,
  getOrCreateMachineId,
  getRuntimes,
  isPaired,
  saveConnection,
} from "../../cloud/client.js";
import { claimMachine } from "../../cloud/claim.js";
import { register } from "../../cloud/registration.js";
import { startHeartbeat } from "../../cloud/heartbeat.js";

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

  /**
   * 0004 Phase 2 — drain-aware update flow (desktop updater). prepare-update
   * pauses cron + stops admitting runs; readiness is polled until busy===0;
   * resume-after-update undoes both if the user cancels the install.
   */
  app.post("/system/prepare-update", async (): Promise<UpdateReadiness> => {
    if (isSchedulerEnabled()) {
      stopScheduler();
      setSchedulerEnabled(false);
    }
    setDraining(true);
    logger.info({ busy: runManager.busyCount() }, "update drain started");
    return {
      draining: true,
      busy: runManager.busyCount(),
      runs: runManager.listBlockingRuns(),
    };
  });

  app.get("/system/update-readiness", async (): Promise<UpdateReadiness> => ({
    draining: isDraining(),
    busy: runManager.busyCount(),
    runs: runManager.listBlockingRuns(),
  }));

  app.post("/system/resume-after-update", async (): Promise<UpdateReadiness> => {
    setDraining(false);
    if (!isSchedulerEnabled()) {
      startScheduler();
      setSchedulerEnabled(true);
    }
    runManager.kick();
    logger.info("update drain cancelled — scheduler + admissions resumed");
    return {
      draining: false,
      busy: runManager.busyCount(),
      runs: runManager.listBlockingRuns(),
    };
  });

  /** Graceful shutdown, used by the desktop shell on quit. */
  /**
   * US1 — the desktop app handing this core the credential it just minted.
   *
   * This is what makes connecting a computer take zero steps: the app's
   * renderer is already signed in, so it mints a person-scoped token through
   * an ordinary Server Action and passes it here over Electron IPC. Nothing is
   * typed, and no browser round trip happens at all.
   *
   * Behind `requireAuth` like every other route in this group, so the caller
   * must already hold the per-install API token — i.e. must be something
   * running on this machine with read access to the data dir. A web page
   * cannot reach it: core sets `origin: false` on CORS, so a cross-origin
   * request never gets a response it can read, and the desktop shell talks to
   * it from the main process rather than the renderer.
   *
   * Claiming synchronously rather than firing and forgetting is deliberate.
   * The caller is a UI that is about to tell somebody their computer is
   * connected, and it should only say so once that is true.
   */
  app.post("/system/cloud-token", async (request, reply) => {
    const body = z
      .object({ token: z.string().min(16), name: z.string().trim().min(1).max(80).optional() })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "a token is required" });
    }

    saveConnection({
      token: body.data.token,
      machineId: getOrCreateMachineId(),
      runtimes: [],
    });

    try {
      const result = await claimMachine(body.data.name);
      // Registration is what publishes this machine's capabilities into each
      // workspace it now serves. Without it the machine appears but looks like
      // it can run nothing, which reads as a broken connection rather than a
      // pending one.
      void register();
      // Both loops are no-ops while unconnected and are already running by the
      // time anyone can call this; restarting them is what makes the new
      // credential take effect without waiting for the next poll.
      startHeartbeat();
      return {
        ok: true,
        machineId: result?.machineId ?? getOrCreateMachineId(),
        workspaces: result?.runtimes.length ?? 0,
      };
    } catch (err) {
      // The credential is cleared on failure so a rejected token does not sit
      // on disk looking connected. The caller shows the real reason.
      clearConnection();
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message }, "could not claim this computer with the supplied token");
      return reply.code(502).send({ error: message });
    }
  });

  /**
   * What the Settings -> Daemon card's diagnostics block reads.
   *
   * Deliberately never includes the token, at any level, including when
   * something here fails — this is a support-facing endpoint and its whole
   * output is expected to end up pasted into a bug report.
   */
  app.get("/system/cloud-status", async () => ({
    connected: isPaired(),
    machineId: getMachineId(),
    workspaces: getRuntimes().length,
    cloudUrl: config.cloudUrl,
    pid: process.pid,
    uptimeMs: Date.now() - startedAt,
  }));

  app.post("/system/shutdown", async (_request, reply) => {
    reply.code(202).send({ ok: true });
    setTimeout(() => {
      void requestShutdown("api").catch((err) =>
        logger.error({ err }, "shutdown request failed"),
      );
    }, 50);
  });
}
