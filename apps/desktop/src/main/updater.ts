import { ipcMain, type BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { coreFetch } from "./core-client";
import { shouldSurfaceCheckError } from "./update-status";

/**
 * 0004 Phase 2 — notify-only self-update. Never downloads, never installs,
 * never restarts on its own:
 *   available  → user sees a banner (renderer) + can trigger Download
 *   downloaded → user can trigger Install & restart
 *   installing → core drains (no new runs, cron paused); when busy===0 →
 *                quitAndInstall. "Interrupt N & update now" cancels the
 *                blocking runs first. Cancel resumes the factory untouched.
 */

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DRAIN_POLL_MS = 2000;

interface BlockingRun {
  id: string;
  agentId: string;
  agentName: string | null;
  startedAt: string | null;
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "available"; version: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "waiting"; version: string; busy: number; runs: BlockingRun[] }
  | { state: "installing"; version: string }
  | { state: "error"; message: string };

let status: UpdateStatus = { state: "idle" };
let availableVersion = "";
let consecutiveFailures = 0;
let everReachedFeed = false;
let drainTimer: NodeJS.Timeout | null = null;
let getWindow: () => BrowserWindow | null = () => null;

function setStatus(next: UpdateStatus): void {
  status = next;
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("sparstrow:update-status", status);
  }
}

async function readiness(): Promise<{ busy: number; runs: BlockingRun[] } | null> {
  try {
    const res = await coreFetch("/system/update-readiness");
    if (!res.ok) return null;
    return (await res.json()) as { busy: number; runs: BlockingRun[] };
  } catch {
    return null;
  }
}

function stopDrainPoll(): void {
  if (drainTimer) clearInterval(drainTimer);
  drainTimer = null;
}

async function beginInstall(force: boolean): Promise<void> {
  try {
    const res = await coreFetch("/system/prepare-update", { method: "POST" });
    if (!res.ok) throw new Error(`prepare-update failed: ${res.status}`);
    const ready = (await res.json()) as { busy: number; runs: BlockingRun[] };

    if (force && ready.runs.length > 0) {
      // Explicit user override — cancel every in-flight run, then install.
      await Promise.allSettled(
        ready.runs.map((r) => coreFetch(`/runs/${r.id}/cancel`, { method: "POST" })),
      );
    }

    setStatus({ state: "waiting", version: availableVersion, busy: ready.busy, runs: ready.runs });
    stopDrainPoll();
    drainTimer = setInterval(() => {
      void (async () => {
        const r = await readiness();
        if (!r) return; // core unreachable — keep waiting, never install blind
        if (r.busy === 0) {
          stopDrainPoll();
          setStatus({ state: "installing", version: availableVersion });
          autoUpdater.quitAndInstall();
        } else {
          setStatus({ state: "waiting", version: availableVersion, busy: r.busy, runs: r.runs });
        }
      })();
    }, DRAIN_POLL_MS);
  } catch (err) {
    setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

async function cancelInstall(): Promise<void> {
  stopDrainPoll();
  try {
    await coreFetch("/system/resume-after-update", { method: "POST" });
  } catch {
    // core unreachable — nothing to resume
  }
  setStatus(
    availableVersion ? { state: "downloaded", version: availableVersion } : { state: "idle" },
  );
}

/**
 * @param updateChannel electron-updater's `channel` — which GitHub Release
 *   feed (`latest.yml`, `staging.yml`, …) this install checks. Comes from the
 *   baked `channel.json` (`channel.ts`); omitted/undefined leaves
 *   electron-updater's own default (`latest`), which is correct for an
 *   unchanneled or pre-two-channel build.
 */
export function setupUpdater(windowGetter: () => BrowserWindow | null, updateChannel?: string): void {
  getWindow = windowGetter;

  // Notify-only, always: no silent download, no install-on-quit.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  if (updateChannel) autoUpdater.channel = updateChannel;

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    consecutiveFailures = 0;
    everReachedFeed = true;
    availableVersion = info.version;
    setStatus({ state: "available", version: info.version });
  });
  // Reaching the feed and being told "nothing new" is the only other proof the
  // release pipeline works. Without it, a feed that 404s forever is
  // indistinguishable from one that has simply never had a new version.
  autoUpdater.on("update-not-available", () => {
    consecutiveFailures = 0;
    everReachedFeed = true;
  });
  autoUpdater.on("download-progress", (p) => {
    setStatus({ state: "downloading", version: availableVersion, percent: Math.round(p.percent) });
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    availableVersion = info.version;
    setStatus({ state: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (err) => {
    consecutiveFailures += 1;
    if (!shouldSurfaceCheckError({ state: status.state, consecutiveFailures, everReachedFeed })) {
      return;
    }
    setStatus({
      state: "error",
      message: everReachedFeed
        ? err.message
        : `Cannot reach the update feed (${consecutiveFailures} attempts). No release has been published, ` +
          `or the app cannot see it. Updates will not arrive until this is fixed. Last error: ${err.message}`,
    });
  });

  ipcMain.handle("sparstrow:update-status-get", () => status);
  ipcMain.handle("sparstrow:update-download", async () => {
    await autoUpdater.downloadUpdate().catch((err: Error) => {
      setStatus({ state: "error", message: err.message });
    });
  });
  ipcMain.handle("sparstrow:update-install", async (_e, opts: { force?: boolean } | undefined) => {
    await beginInstall(opts?.force ?? false);
  });
  ipcMain.handle("sparstrow:update-cancel", async () => cancelInstall());

  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}
