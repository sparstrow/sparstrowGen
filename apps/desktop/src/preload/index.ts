// Intentionally minimal: the UI talks to the core over HTTP/WS only. There are
// three exceptions, all Electron-side by nature and all exposed as narrow,
// invoke-only surfaces:
//   - the self-update flow (0004 Phase 2)
//   - the native folder picker (001 US1), because no web API can return a real
//     host path from the OS directory dialog
//   - claiming this computer, because the renderer holds the session that can
//     mint a credential and the main process holds the only path to core's
//     local authed API — neither half can do it alone
// Neither hands a filesystem handle to the renderer; the picker returns a
// string or null and can do nothing else.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

// `app.getVersion()` is main-process only — preload cannot import `app`
// directly. `main.ts` passes it through `additionalArguments` on the
// BrowserWindow instead, so this reads real argv rather than a literal that
// drifts from package.json the moment either one is bumped alone.
function argValue(prefix: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

const appVersion = argValue("--sparstrow-version=", "unknown");

/**
 * Where `server/` is, handed down from the main process.
 *
 * The renderer has no `process` under contextIsolation and should not — this is
 * the narrow, read-only way it learns one string. Exposed on its own global
 * rather than inside `sparstrowDesktop` because `main.tsx` needs it before any
 * React code runs, and reaching into a nested object at that point reads worse
 * than a single documented name.
 */
const serverUrl = argValue("--sparstrow-server-url=", "http://127.0.0.1:8080");
contextBridge.exposeInMainWorld("__SPARSTROW_SERVER_URL__", serverUrl);

contextBridge.exposeInMainWorld("sparstrowDesktop", {
  version: appVersion,
  updates: {
    getStatus: () => ipcRenderer.invoke("sparstrow:update-status-get"),
    download: () => ipcRenderer.invoke("sparstrow:update-download"),
    install: (opts?: { force?: boolean }) => ipcRenderer.invoke("sparstrow:update-install", opts),
    cancel: () => ipcRenderer.invoke("sparstrow:update-cancel"),
    onStatus: (cb: (status: unknown) => void) => {
      const listener = (_e: IpcRendererEvent, status: unknown) => cb(status);
      ipcRenderer.on("sparstrow:update-status", listener);
      return () => ipcRenderer.removeListener("sparstrow:update-status", listener);
    },
  },
  dialogs: {
    /** Absolute path of the chosen directory, or null when cancelled. */
    pickDirectory: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke("sparstrow:pick-directory", defaultPath),
  },
  machine: {
    /**
     * Hand this computer's core a credential the renderer just minted, and
     * claim the machine with it (US1).
     *
     * One-way by shape: a token goes in, and what comes back says only whether
     * it worked and how many workspaces this computer now serves. The renderer
     * cannot read the stored credential back, and nothing here returns it.
     */
    claim: (token: string, name?: string): Promise<ClaimResult> =>
      ipcRenderer.invoke("sparstrow:claim-machine", { token, name }),
    /** Read-only status for the Settings -> Daemon card. Never carries a token. */
    status: (): Promise<CloudStatus> => ipcRenderer.invoke("sparstrow:cloud-status"),
  },
  daemon: {
    /** US2: the two lifecycle switches on the Settings -> Daemon card. */
    getPrefs: (): Promise<DaemonPrefs> => ipcRenderer.invoke("sparstrow:daemon-prefs-get"),
    setPrefs: (patch: Partial<DaemonPrefs>): Promise<DaemonPrefs> =>
      ipcRenderer.invoke("sparstrow:daemon-prefs-set", patch),
  },
});

type DaemonPrefs = {
  autoStartOnLaunch: boolean;
  autoStopOnQuit: boolean;
};

type ClaimResult =
  | { ok: true; machineId: string; workspaces: number }
  | { ok: false; error: string };

type CloudStatus = {
  connected: boolean;
  machineId?: string | null;
  workspaces?: number;
  cloudUrl?: string;
  error?: string;
};
