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
import { register } from "./cloud/registration.js";
import { declareDraining, startHeartbeat } from "./cloud/heartbeat.js";
import { startCommandLoop, stopCommandLoop } from "./cloud/commands.js";
import { startRunReporter, stopRunReporter } from "./cloud/run-reporter.js";
import { startTranscriptPusher, stopTranscriptPusher } from "./cloud/transcripts.js";
import { startMemorySync, stopMemorySync } from "./cloud/memory-sync.js";
import { startBindingReporter, stopBindingReporter } from "./cloud/bindings.js";
import { initDelegationWatcher, sweepWaitingParents } from "./taskboard/delegation.js";
import { sweepOrphanedPipelineRuns } from "./orchestrator/pipeline-executor.js";
import { initGoalWatcher, reconcileGoals } from "./goap/service.js";
import { reconcileInterruptedImports } from "./agents/ingestion.js";
import { killAllSessions } from "./terminal/manager.js";
import { shutdownGraphPool, sweepOrphanEngines } from "./graph/graph-client.js";
import { graphToolRegistrar } from "./graph/graph-tools.js";
import { reconcileInterruptedIndexes, startNightlyGraphRefresh } from "./graph/graph-lifecycle.js";
import { stopAllViz } from "./graph/viz-manager.js";

/**
 * Startup watchdog: a core that wedges BEFORE app.listen (seen in the wild:
 * SQLite WAL-recovery file-lock wait on Windows against a stale session's db
 * handle) previously hung SILENTLY — the terminal showed only the vite proxy's
 * ECONNREFUSED spam with zero core output. If listen isn't reached in time,
 * die loudly naming the last phase so the operator sees the real failure.
 */
const STARTUP_WATCHDOG_MS = 45_000;
let startupPhase = "init";
function armStartupWatchdog(): NodeJS.Timeout {
  const timer = setTimeout(() => {
    logger.fatal(
      { phase: startupPhase, timeoutMs: STARTUP_WATCHDOG_MS },
      "core failed to reach listen — startup is wedged (likely a stale session holding the db or port); kill leftover node processes and retry",
    );
    process.exit(1);
  }, STARTUP_WATCHDOG_MS);
  timer.unref();
  return timer;
}

async function main(): Promise<void> {
  const watchdog = armStartupWatchdog();
  logger.info({ dataDir: config.dataDir, vault: config.vaultPath }, "sparstrow core starting");
  ensureDirs();
  startupPhase = "open-db";
  openDb();
  startupPhase = "vault";
  ensureVaultDirs();
  initSearchStore();

  const scan = scanVault();
  logger.info(scan, "vault scanned");

  runManager.sweepOrphans();
  // P6: a restart mid-pipeline used to leave pipeline_runs 'running' forever —
  // the same EC1 discipline the run sweep applies.
  sweepOrphanedPipelineRuns();
  // P9: an import interrupted mid-pipeline (clone/extract/review) by a restart
  // stays non-terminal forever and the detail UI polls it every 2s — fail it.
  const staleImports = reconcileInterruptedImports();
  if (staleImports > 0) logger.warn({ staleImports }, "interrupted skill imports reconciled");
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
  // P6 goal engine: bus-driven advance + the EH2 startup reconciliation pass
  // (planner/reviewer runs swept above still transition their goals here).
  const stopGoalWatcher = initGoalWatcher();
  const goalsTouched = reconcileGoals();
  if (goalsTouched > 0) logger.info({ goalsTouched }, "goals reconciled at startup");
  extraToolRegistrars.push(registerTaskboardTools);
  extraToolRegistrars.push(registerCapabilities);
  // P5: curated graph tools — registration reads the run's spawn-pinned snapshot.
  extraToolRegistrars.push(graphToolRegistrar);

  startupPhase = "build-server";
  const app = await buildServer();
  startupPhase = "listen";
  await app.listen({ port: config.port, host: config.host });
  clearTimeout(watchdog);
  logger.info({ url: `http://${config.host}:${config.port}` }, "sparstrow core ready");
  startScheduler();

  // Warm the embedder and (re)index in the background; FTS works immediately.
  void initEmbedder().then(() => {
    const queued = indexer.indexPending(scan.dirtyNoteIds);
    if (queued > 0) logger.info({ queued }, "indexing memory notes");
  });
  startVaultWatcher();

  // M3: announce this machine to the cloud and keep it visibly alive. Both are
  // no-ops on an unpaired machine and neither can reject — core runs agents
  // locally whether or not a control plane exists, so the cloud is a
  // capability this daemon gained, not a dependency it acquired.
  void register();
  startHeartbeat();

  // M4/M5: accept dispatched work, and report on it — the run row and its
  // transcript. Same contract as the two above — no-ops while unpaired, and
  // none of the three can reject into startup.
  //
  // Both subscribers start before the loop polls, so a command claimed on the
  // very first tick already has somewhere to report its status and its events.
  startRunReporter();
  startTranscriptPusher();
  // M6: memory notes both ways. Started BEFORE the command loop, because the
  // loop can dispatch a `memory.sync` on its very first tick and that handler
  // calls straight into this module — and because starting it is what registers
  // the vault's write hook, so a note saved seconds after boot is not missed.
  startMemorySync();
  startCommandLoop();
  // Until this lands, `runtime_projects` is empty and every project looks
  // unavailable to the enqueue-time check — a failure that reads like a
  // dispatch bug rather than a missing report.
  startBindingReporter();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    try {
      // Before anything else, including the draining declaration: a command
      // claimed after this process decided to exit is a lease held by something
      // that is about to be gone, and the run looks stuck until it expires.
      stopCommandLoop();
      stopRunReporter();
      stopTranscriptPusher();
      stopMemorySync();
      stopBindingReporter();
      // Then, so the UI says "shutting down" instead of waiting out the
      // staleness window. Best-effort with a 2s timeout — it must not delay
      // the rest of shutdown, and a missed declaration just means the machine
      // goes stale the ordinary way.
      await declareDraining();
      stopScheduler();
      stopDelegationWatcher();
      stopGoalWatcher();
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
