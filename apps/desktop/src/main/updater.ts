import { Notification, ipcMain, type BrowserWindow } from "electron";
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
  /** Only ever set by an explicit "Check for updates" — see `manualCheck`. */
  | { state: "checking" }
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
/**
 * Versions already announced with an OS notification.
 *
 * The check runs every 30 minutes and reports the same available version each
 * time, so without this the app would interrupt the user twice an hour with
 * news they already have. Tracked per version rather than as a single boolean
 * so a *second* release published while the app is open still announces itself.
 */
const announced = new Set<string>();

/**
 * Tell the operating system an update is waiting.
 *
 * The in-app banner only works when the window is on screen; this app is
 * expected to sit in the tray for days, which is exactly when a new release is
 * most likely to appear. Silent by design — a notification that makes a sound
 * for a non-urgent, non-interactive fact is the kind of thing people disable
 * wholesale, taking the useful notifications with it.
 */
function announce(version: string): void {
  if (announced.has(version) || !Notification.isSupported()) return;
  announced.add(version);
  const note = new Notification({
    title: "Sparstrowgen update available",
    body: `Version ${version} is ready to download. Open Settings to install it.`,
    silent: true,
  });
  note.on("click", () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
    win.webContents.send("sparstrow:navigate", "settings");
  });
  note.show();
}

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
          void installNow();
        } else {
          setStatus({ state: "waiting", version: availableVersion, busy: r.busy, runs: r.runs });
        }
      })();
    }, DRAIN_POLL_MS);
  } catch (err) {
    setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Stop the runtime, then install.
 *
 * ## Why the runtime must be stopped, whatever the auto-stop preference says
 *
 * "Leave the runtime running when I close the window" is a deliberate feature —
 * agents keep working after someone tidies their taskbar. It is the wrong
 * behaviour for an **update**, and the difference is not a preference:
 *
 * An update replaces `resources/core`, so the still-running old runtime is
 * executing code that no longer exists on disk. It also keeps port 48750, and
 * the new app cannot take it back: it cannot bind (the port is held) and it
 * cannot adopt (the old process authenticates with a credential the new one
 * cannot reproduce — observed live after v0.3.1's update, where a runtime
 * started before the update rejected the very `.api-token` sitting in the data
 * directory). The result is an updated app with no runtime at all, and no way
 * to get one short of a reboot.
 *
 * ## Why `isSilent: true`
 *
 * `quitAndInstall()` defaults to `isSilent = false`, which runs the full NSIS
 * wizard — "Choose Installation Options", "Completing Setup", the lot. That is
 * why v0.3.1 "felt like a reinstall, not an update": it *was* a reinstall,
 * visually, because the default shows the installer. An update the user
 * approved in Settings should apply itself and reopen.
 */
async function installNow(): Promise<void> {
  try {
    await stopRuntimeForUpdate?.();
  } catch (err) {
    // Never block the update on this. A runtime that would not stop is a worse
    // outcome than an update that proceeds — and the installer's own
    // file-in-use handling is the backstop.
    console.error("[updater] could not stop the runtime before installing:", err);
  }
  // (isSilent, isForceRunAfter): apply without the wizard, then reopen.
  autoUpdater.quitAndInstall(true, true);
}

/**
 * How to stop the local runtime, injected by `main.ts`.
 *
 * A function rather than an import so this module keeps knowing nothing about
 * `ServiceManager` — the updater's job is to decide *when*, and the supervisor
 * already owns *how* (graceful shutdown, then kill).
 */
let stopRuntimeForUpdate: (() => Promise<void>) | null = null;
export function setRuntimeStopper(fn: () => Promise<void>): void {
  stopRuntimeForUpdate = fn;
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
 * A check the user asked for, which is a different thing from the background one.
 *
 * The 30-minute poll must stay silent about failure — being offline is routine,
 * and `shouldSurfaceCheckError` exists to keep it that way. But a person who has
 * just pressed a button is owed an answer either way, so this one moves through
 * a visible `checking` state, which that same predicate treats as
 * always-surface. Nothing is announced twice: `announced` still gates the OS
 * notification, so pressing the button on a version you already dismissed shows
 * it in Settings without interrupting you again.
 *
 * Deliberately does not clear a `downloaded`/`waiting` status — re-checking
 * while an install is staged must not throw the staged install away.
 */
async function manualCheck(): Promise<void> {
  if (status.state !== "idle" && status.state !== "error") return;
  setStatus({ state: "checking" });
  try {
    await autoUpdater.checkForUpdates();
    // `update-available` / `error` will have moved us on already; landing here
    // still in `checking` means the feed answered "nothing new".
    if (stillChecking()) setStatus({ state: "idle" });
  } catch (err) {
    if (stillChecking()) {
      setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }
}

/**
 * Read `status` through a function so the compiler stops narrowing it.
 *
 * `manualCheck`'s guard narrows `status` to `idle | error`, and TypeScript has
 * no way to know that awaiting `checkForUpdates()` runs event handlers that
 * reassign it — so an inline `status.state === "checking"` is a type error on a
 * comparison that is the entire point of the code. This is the boundary that
 * tells it to look again.
 */
function stillChecking(): boolean {
  return status.state === "checking";
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
    announce(info.version);
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
  ipcMain.handle("sparstrow:update-check", async () => manualCheck());
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
