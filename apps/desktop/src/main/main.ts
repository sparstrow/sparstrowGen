import path from "node:path";
import { BrowserWindow, app, ipcMain, type Tray } from "electron";
import { ServiceManager, findRepoRoot } from "./service-manager";
import { pickDirectory } from "./dialogs";
import { applyPackagedEnv, ensureCoreNodeModules } from "./packaged-env";
import { configureCoreClient, coreFetch } from "./core-client";
import { setupUpdater } from "./updater";
import { createTray } from "./tray";
import { offlineScreenUrl } from "./offline";
import { resolveAppUrl } from "./urls";
import { readDaemonPrefs, writeDaemonPrefs, type DaemonPrefs } from "./daemon-prefs";

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
 *
 * **The renderer is now a static SPA this app owns**, so in production there is
 * no URL and no server at all — `loadFile` reads `out/renderer/index.html` off
 * disk. In development `electron-vite` runs a Vite dev server and passes its
 * URL in `ELECTRON_RENDERER_URL`, which is what gives HMR.
 *
 * This replaces a `services.webPort` lookup that pointed the window at a
 * bundled Next.js server this app used to spawn. `SPARSTROW_APP_URL` survives
 * as an override, because pointing a build at a deployed web app is a genuine
 * thing to want — it is just no longer the only path to a UI.
 */
function rendererDevUrl(): string | null {
  return process.env.ELECTRON_RENDERER_URL?.trim() || null;
}

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
    // US2: `autoStartOnLaunch` is honoured here rather than inside
    // ServiceManager, so the supervisor stays a supervisor and the policy
    // stays one readable decision. Note it does NOT prevent adopting a core
    // that is already listening — `services.start()` is what detects that, and
    // someone who turned auto-start off still wants the window to talk to a
    // runtime they started themselves.
    const prefs = readDaemonPrefs(app.getPath("userData"));
    if (prefs.autoStartOnLaunch) {
      try {
        await services.start();
      } catch (err) {
        console.error("[main] core failed to start:", err);
      }
    } else {
      console.log("[main] auto-start is off — not starting core");
    }

    // 001 US1: the native folder picker for the New project dialog. Registered
    // once, alongside the update handlers, and always window-modal.
    ipcMain.handle("sparstrow:pick-directory", (_e, defaultPath?: string) =>
      pickDirectory(mainWindow, defaultPath),
    );

    // US1: the renderer is signed in and this process is not, so the token it
    // mints has to cross the bridge. It goes straight to core over the local
    // authed API and is never written to disk here, never logged, and never
    // returned to the renderer.
    //
    // Invoke-only and one-way by shape: the renderer can hand a credential in
    // and learn whether the claim worked, and can learn nothing else.
    ipcMain.handle(
      "sparstrow:claim-machine",
      async (_e, payload: { token?: unknown; name?: unknown }) => {
        // Logged because this is the one step of connecting a computer that
        // happens outside both the renderer's console and core's log, so a
        // failure here is otherwise invisible from every side.
        console.log("[main] claim-machine requested");
        const token = typeof payload?.token === "string" ? payload.token : "";
        if (!token) return { ok: false, error: "No token supplied." };
        const name = typeof payload?.name === "string" ? payload.name : undefined;
        try {
          const res = await coreFetch("/system/cloud-token", {
            method: "POST",
            body: { token, name },
            // Claiming reaches the control plane and back, so it needs more
            // than coreFetch's 5s default for the tray's local pings.
            timeoutMs: 30_000,
          });
          if (!res.ok) {
            const detail = (await res.json().catch(() => null)) as { error?: string } | null;
            const error = detail?.error ?? `Core returned ${res.status}.`;
            console.error("[main] claim-machine failed:", error);
            return { ok: false, error };
          }
          const claimed = (await res.json()) as { ok: true; machineId: string; workspaces: number };
          console.log(`[main] claim-machine ok — ${claimed.workspaces} workspace(s)`);
          return claimed;
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          console.error("[main] claim-machine threw:", error);
          return { ok: false, error };
        }
      },
    );

    // US2: the Settings -> Daemon card's two switches and its diagnostics.
    ipcMain.handle("sparstrow:daemon-prefs-get", () => readDaemonPrefs(app.getPath("userData")));
    ipcMain.handle("sparstrow:daemon-prefs-set", (_e, patch: Partial<DaemonPrefs>) =>
      writeDaemonPrefs(app.getPath("userData"), {
        // Read defensively: this crosses the bridge, and a non-boolean here
        // would be written straight to the prefs file.
        ...(typeof patch?.autoStartOnLaunch === "boolean"
          ? { autoStartOnLaunch: patch.autoStartOnLaunch }
          : {}),
        ...(typeof patch?.autoStopOnQuit === "boolean"
          ? { autoStopOnQuit: patch.autoStopOnQuit }
          : {}),
      }),
    );

    /** Read-only status for the Settings -> Daemon card. Never carries a token. */
    ipcMain.handle("sparstrow:cloud-status", async () => {
      console.log("[main] cloud-status requested");
      try {
        const res = await coreFetch("/system/cloud-status");
        if (!res.ok) return { connected: false, error: `Core returned ${res.status}.` };
        return await res.json();
      } catch (err) {
        return { connected: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    tray = createTray({ openWindow, quit: () => quitApp() });
    openWindow();

    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
      // 0004 Phase 2: notify-only update checks (packaged only — dev has no
      // release feed to compare against). The channel argument picks which
      // GitHub Release feed this install tracks (channel.ts).
      setupUpdater(() => mainWindow, packagedPaths?.channel?.updateChannel);
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
      preload: path.join(__dirname, "..", "preload", "index.js"),
      // preload cannot import `app` (main-process only) — pass the real
      // version through argv instead of letting preload guess. See preload.ts.
      additionalArguments: [
        `--sparstrow-version=${app.getVersion()}`,
        // Where `server/` is. Passed as argv rather than read from
        // `process.env` in the renderer, which has no `process` at all under
        // contextIsolation — and should not.
        `--sparstrow-server-url=${process.env.SPARSTROW_SERVER_URL ?? "http://127.0.0.1:8080"}`,
      ],
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
      const failed =
        validatedURL || resolveAppUrl(process.env) || rendererDevUrl() || "the app";
      console.warn(`[main] window failed to load ${failed}: ${errorDescription} (${errorCode})`);
      // Rebuilt per failure rather than cached, so the error named on screen is
      // the current one. Retry is a plain link back: it either succeeds, or
      // fails and lands right back here with a fresh message.
      void mainWindow?.loadURL(offlineScreenUrl({ intendedUrl: failed, errorDescription }));
    },
  );

  // Precedence, most explicit first: an operator's override, then the dev
  // server, then the SPA on disk. One line logged either way, so a support
  // question is a log lookup rather than a guess about where a build pointed.
  const override = resolveAppUrl(process.env);
  const devUrl = rendererDevUrl();

  if (override) {
    console.log(`[main] loading window: ${override} (SPARSTROW_APP_URL)`);
    void mainWindow.loadURL(override);
  } else if (devUrl) {
    console.log(`[main] loading window: ${devUrl} (vite dev server)`);
    void mainWindow.loadURL(devUrl);
  } else {
    const indexHtml = path.join(__dirname, "..", "renderer", "index.html");
    console.log(`[main] loading window: ${indexHtml} (bundled SPA)`);
    void mainWindow.loadFile(indexHtml);
  }
}

function quitApp(): void {
  quitting = true;
  // US2's headline behaviour. Quitting the app leaves the runtime running
  // unless the owner has said otherwise, so a machine stays reachable across
  // "I closed the app to tidy my taskbar" — which is what made it silently
  // unreachable before.
  const { autoStopOnQuit } = readDaemonPrefs(app.getPath("userData"));
  void services.stop(autoStopOnQuit).finally(() => {
    tray?.destroy();
    app.quit();
  });
}
