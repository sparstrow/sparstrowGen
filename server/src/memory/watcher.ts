import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { indexer } from "./indexer.js";
import { scanVault } from "./vault.js";

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Watch the vault for external edits (Obsidian, Explorer drops, agents) and
 * reconcile via a debounced full scan — cheap at personal-vault scale and
 * immune to per-file event races. scanVault() skips unchanged files by hash.
 */
export function startVaultWatcher(): void {
  if (watcher) return;
  watcher = chokidar.watch(config.vaultPath, {
    ignored: (p) => path.basename(p).startsWith("."),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 750, pollInterval: 100 },
  });

  const trigger = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const result = scanVault();
        if (result.added + result.updated + result.removed > 0) {
          logger.info(
            { added: result.added, updated: result.updated, removed: result.removed },
            "vault change detected",
          );
        }
        if (result.dirtyNoteIds.length > 0) indexer.enqueue(result.dirtyNoteIds);
      } catch (err) {
        logger.error({ err }, "vault watcher scan failed");
      }
    }, 1000);
  };

  watcher.on("add", trigger).on("change", trigger).on("unlink", trigger);
  watcher.on("error", (err) => logger.warn({ err }, "vault watcher error"));
  logger.info({ vault: config.vaultPath }, "vault watcher started");
}

export async function stopVaultWatcher(): Promise<void> {
  if (debounceTimer) clearTimeout(debounceTimer);
  await watcher?.close();
  watcher = null;
}
