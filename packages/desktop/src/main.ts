import path from "node:path";
import { BrowserWindow, app, type Tray } from "electron";
import { ServiceManager, findRepoRoot } from "./service-manager";
import { createTray } from "./tray";

const DEV = process.env.SPARSTROW_DEV === "1";
const UI_URL = DEV
  ? (process.env.SPARSTROW_UI_URL ?? "http://127.0.0.1:5173")
  : (process.env.SPARSTROW_CORE_URL ?? "http://127.0.0.1:48750");

const repoRoot = findRepoRoot(__dirname);
const services = new ServiceManager(repoRoot);

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

    tray = createTray({ openWindow, quit: () => quitApp() });
    openWindow();

    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
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
