import path from "node:path";
import { BrowserWindow, app, ipcMain, type Tray } from "electron";
import { ServiceManager, findRepoRoot } from "./service-manager";
import { pickDirectory } from "./dialogs";
import { applyPackagedEnv, ensureCoreNodeModules } from "./packaged-env";
import { configureCoreClient } from "./core-client";
import { setupUpdater } from "./updater";
import { createTray } from "./tray";

const DEV = process.env.SPARSTROW_DEV === "1";
const UI_URL = DEV
  ? (process.env.SPARSTROW_UI_URL ?? "http://127.0.0.1:5173")
  : (process.env.SPARSTROW_CORE_URL ?? "http://127.0.0.1:48750");

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
    console.log(`[main] window loaded: ${mainWindow?.webContents.getURL()}`);
  });
  void mainWindow.loadURL(UI_URL);
}

function quitApp(): void {
  quitting = true;
  void services.stop().finally(() => {
    tray?.destroy();
    app.quit();
  });
}
