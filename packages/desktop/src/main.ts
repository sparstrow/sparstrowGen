import path from "node:path";
import { BrowserWindow, app, ipcMain, type Tray } from "electron";
import { ServiceManager, findRepoRoot } from "./service-manager";
import { pickDirectory } from "./dialogs";
import { applyPackagedEnv, ensureCoreNodeModules } from "./packaged-env";
import { configureCoreClient } from "./core-client";
import { setupUpdater } from "./updater";
import { createTray } from "./tray";
import { offlineScreenUrl } from "./offline";
import { resolveAppUrl } from "./urls";

/**
 * Where the window points. Resolution lives in `urls.ts` so it can be tested —
 * `main.ts` takes the single-instance lock at import time and cannot be loaded
 * from a test.
 *
 * `SPARSTROW_APP_URL` is kept distinct from the daemon's own
 * `SPARSTROW_CLOUD_URL` on purpose. The two name the same host once deployed,
 * but they mean different things — where this machine reports to, versus what
 * this window displays — and collapsing them would make pointing a window at
 * staging a code change. See doc/tasks/M7/README.md decision 6.
 */
const APP_URL = resolveAppUrl(process.env);

// 0004 Phase 0: in packaged mode, point every data path at persistent
// userData and every resource at the install dir BEFORE the supervisor spawns
// core — the dev repo is never touched by a packaged run.
const packagedPaths = applyPackagedEnv();
// Re-link the core's node_modules from the shipped `vendor` dir before anything
// tries to spawn it (electron-builder can't ship a dir named node_modules).
if (packagedPaths) ensureCoreNodeModules(packagedPaths);
const repoRoot = packagedPaths ? app.getPath("userData") : findRepoRoot(__dirname);
const services = new ServiceManager(repoRoot, packagedPaths);
// Token-authed shell→core client (tray, updater): the token file lives in
// the active data dir — userData in packaged mode, repo data/ in dev.
configureCoreClient(packagedPaths?.dataDir ?? path.join(repoRoot, "data"));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

// One instance only — a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openWindow());

  app.whenReady().then(async () => {
    try {
      await services.start();
    } catch (err) {
      console.error("[main] core failed to start:", err);
    }

    // 001 US1: the native folder picker for the New project dialog. Registered
    // once, alongside the update handlers, and always window-modal.
    ipcMain.handle("sparstrow:pick-directory", (_e, defaultPath?: string) =>
      pickDirectory(mainWindow, defaultPath),
    );

    tray = createTray({ openWindow, quit: () => quitApp() });
    openWindow();

    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
      // 0004 Phase 2: notify-only update checks (packaged only — dev has no
      // release feed to compare against).
      setupUpdater(() => mainWindow);
    }
  });

  // Closing the window minimizes to tray; cron jobs keep firing headless.
  app.on("window-all-closed", () => {
    if (quitting) app.quit();
  });

  app.on("before-quit", () => {
    quitting = true;
  });
}

function openWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    title: "Sparstrowgen",
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      // The renderer is our own served web app; no Node access needed.
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    // Truncated: the offline screen is an inline data: URL, and logging it whole
    // buries every other line in the file under a page of encoded HTML.
    const loaded = mainWindow?.webContents.getURL() ?? "";
    console.log(`[main] window loaded: ${loaded.startsWith("data:") ? "<offline screen>" : loaded}`);
  });

  // The failure half, which did not exist: `loadURL` against an unreachable host
  // rejects and leaves a blank window with one unhandled rejection. A white
  // rectangle is the worst possible answer to "is my machine still working?".
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // A failed sub-resource is not the window failing. Without this guard one
      // blocked font replaces a working page with an error screen.
      if (!isMainFrame) return;
      // ERR_ABORTED — a navigation superseded by the user or the app itself.
      // Routine, and not a failure to report.
      if (errorCode === -3) return;
      // The offline screen failing would mean showing the offline screen, which
      // would fail. It is inline HTML with no network and should never get here;
      // this is the guard that keeps "should never" from meaning a spin.
      if (validatedURL?.startsWith("data:")) {
        console.error(`[main] the offline screen itself failed to load: ${errorDescription}`);
        return;
      }
      // `validatedURL` rather than APP_URL: it is what actually failed, which
      // after an in-app navigation is not necessarily where the window started.
      const failed = validatedURL || APP_URL || "the app";
      console.warn(`[main] window failed to load ${failed}: ${errorDescription} (${errorCode})`);
      // Rebuilt per failure rather than cached, so the error named on screen is
      // the current one. Retry is a plain link back: it either succeeds, or
      // fails and lands right back here with a fresh message.
      void mainWindow?.loadURL(offlineScreenUrl({ intendedUrl: failed, errorDescription }));
    },
  );

  // One line, so a support question is a log lookup rather than a guess about
  // where this build was pointed.
  if (APP_URL === null) {
    console.warn("[main] SPARSTROW_APP_URL is not set — nothing to load");
    void mainWindow.loadURL(
      offlineScreenUrl({
        intendedUrl: "no app URL configured",
        errorDescription:
          "SPARSTROW_APP_URL is not set. Set it to the Sparstrowgen web app this machine should open.",
      }),
    );
    return;
  }
  console.log(`[main] loading window: ${APP_URL}`);
  void mainWindow.loadURL(APP_URL);
}

function quitApp(): void {
  quitting = true;
  void services.stop().finally(() => {
    tray?.destroy();
    app.quit();
  });
}
