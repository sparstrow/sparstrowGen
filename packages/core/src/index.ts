import { config, ensureDirs } from "./config.js";
import { closeDb, openDb } from "./db/connection.js";
import { registerShutdownHandler } from "./lifecycle.js";
import { logger } from "./logger.js";
import { initEmbedder } from "./memory/embedder.js";
import { indexer } from "./memory/indexer.js";
import { initSearchStore } from "./memory/search-store.js";
import { ensureVaultDirs, scanVault } from "./memory/vault.js";
import { startVaultWatcher, stopVaultWatcher } from "./memory/watcher.js";
import { runManager } from "./orchestrator/run-manager.js";
import { buildServer } from "./api/server.js";
import { extraToolRegistrars } from "./mcp/http-mcp.js";
import { registerTaskboardTools } from "./taskboard/agent-tools.js";
import { registerCapabilities } from "./agents/capability-registry.js";
import { ensureSystemAgents } from "./agents/system-agents.js";
import { startScheduler, stopScheduler } from "./scheduler/service.js";
import { initDelegationWatcher, sweepWaitingParents } from "./taskboard/delegation.js";
import { killAllSessions } from "./terminal/manager.js";
import { shutdownGraphPool, sweepOrphanEngines } from "./graph/graph-client.js";
import { graphToolRegistrar } from "./graph/graph-tools.js";
import { reconcileInterruptedIndexes, startNightlyGraphRefresh } from "./graph/graph-lifecycle.js";
import { stopAllViz } from "./graph/viz-manager.js";

async function main(): Promise<void> {
  logger.info({ dataDir: config.dataDir, vault: config.vaultPath }, "sparstrow core starting");
  ensureDirs();
  openDb();
  ensureVaultDirs();
  initSearchStore();

  const scan = scanVault();
  logger.info(scan, "vault scanned");

  runManager.sweepOrphans();
  // P5: graph-engine children leaked by a crash / tsx-watch hard restart die
  // here (Windows delivers no SIGTERM; exe identity verified before killing).
  void sweepOrphanEngines().then((killed) => {
    if (killed > 0) logger.warn({ killed }, "graph-engine orphans reaped at startup");
  });
  // P5: statuses stuck at queued/indexing mean core died mid-index — mark failed.
  const staleIndexes = reconcileInterruptedIndexes();
  if (staleIndexes > 0) logger.warn({ staleIndexes }, "interrupted graph indexes reconciled");
  // P5 (locked P5-Q4): nightly refresh sweep, serialized by the index semaphore.
  const stopNightlyGraphRefresh = startNightlyGraphRefresh();
  // P4: seed the factory-managed system agents (Project Indexer/Reporter) that
  // auto-index + morning-briefing spawn through. Idempotent.
  ensureSystemAgents();
  // P3 delegation watcher: child-terminal events wake waiting leads; the startup
  // sweep reconciles parents whose children finished while the service was down.
  const stopDelegationWatcher = initDelegationWatcher();
  const woken = sweepWaitingParents();
  if (woken > 0) logger.info({ woken }, "waiting parents reconciled at startup");
  extraToolRegistrars.push(registerTaskboardTools);
  extraToolRegistrars.push(registerCapabilities);
  // P5: curated graph tools — registration reads the run's spawn-pinned snapshot.
  extraToolRegistrars.push(graphToolRegistrar);

  const app = await buildServer();
  await app.listen({ port: config.port, host: config.host });
  logger.info({ url: `http://${config.host}:${config.port}` }, "sparstrow core ready");
  startScheduler();

  // Warm the embedder and (re)index in the background; FTS works immediately.
  void initEmbedder().then(() => {
    const queued = indexer.indexPending(scan.dirtyNoteIds);
    if (queued > 0) logger.info({ queued }, "indexing memory notes");
  });
  startVaultWatcher();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    try {
      stopScheduler();
      stopDelegationWatcher();
      stopNightlyGraphRefresh();
      killAllSessions();
      await stopAllViz();
      await shutdownGraphPool();
      await stopVaultWatcher();
      await app.close();
    } finally {
      closeDb();
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  registerShutdownHandler(shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, "core failed to start");
  process.exit(1);
});
