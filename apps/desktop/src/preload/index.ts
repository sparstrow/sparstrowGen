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
  /**
   * Somewhere the main process wants the window to be.
   *
   * Currently only the update notification uses it: clicking an OS notification
   * about a new version should land on the screen that installs it, not on
   * whatever screen happened to be open. One-way main → renderer, and a hint
   * rather than a command — the renderer decides what the name means.
   */
  onNavigate: (cb: (screen: string) => void) => {
    const listener = (_e: IpcRendererEvent, screen: string) => cb(screen);
    ipcRenderer.on("sparstrow:navigate", listener);
    return () => ipcRenderer.removeListener("sparstrow:navigate", listener);
  },
  /**
   * This computer's registration changed, so anything showing machines is
   * stale. Carries no data — the renderer refetches through the same API it
   * always uses, rather than being handed a machine over the bridge.
   */
  /**
   * Which step of signing in is happening. One-way main → renderer.
   *
   * "browser", then "connecting", and "unclaimed" if the session worked but
   * this computer could not be registered.
   */
  onSignInStage: (cb: (stage: string) => void) => {
    const listener = (_e: IpcRendererEvent, stage: string) => cb(stage);
    ipcRenderer.on("sparstrow:sign-in-stage", listener);
    return () => ipcRenderer.removeListener("sparstrow:sign-in-stage", listener);
  },
  onMachinesChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("sparstrow:machines-changed", listener);
    return () => ipcRenderer.removeListener("sparstrow:machines-changed", listener);
  },
  updates: {
    getStatus: () => ipcRenderer.invoke("sparstrow:update-status-get"),
    check: () => ipcRenderer.invoke("sparstrow:update-check"),
    download: () => ipcRenderer.invoke("sparstrow:update-download"),
    install: (opts?: { force?: boolean }) => ipcRenderer.invoke("sparstrow:update-install", opts),
    cancel: () => ipcRenderer.invoke("sparstrow:update-cancel"),
    onStatus: (cb: (status: unknown) => void) => {
      const listener = (_e: IpcRendererEvent, status: unknown) => cb(status);
      ipcRenderer.on("sparstrow:update-status", listener);
      return () => ipcRenderer.removeListener("sparstrow:update-status", listener);
    },
  },
  /**
   * This machine's `server/` — its state, and the Supabase credentials it runs
   * with.
   *
   * `get` NEVER returns a secret's value, only whether one is stored. A service
   * role key that has crossed into the renderer is a service role key in a
   * process that renders untrusted content, and there is no reason for it to be
   * there: the form writes, it does not read back.
   */
  server: {
    getConfig: (): Promise<ServerConfigStatus> => ipcRenderer.invoke("sparstrow:server-config-get"),
    setConfig: (
      patch: Partial<Record<"supabaseUrl" | "supabaseAnonKey" | "supabaseServiceRoleKey" | "supabaseJwtSecret", string>>,
    ): Promise<{ ok: true; status: ServerConfigStatus } | { ok: false; error: string }> =>
      ipcRenderer.invoke("sparstrow:server-config-set", patch),
    clearConfig: (): Promise<ServerConfigStatus> =>
      ipcRenderer.invoke("sparstrow:server-config-clear"),
    getState: (): Promise<unknown> => ipcRenderer.invoke("sparstrow:server-state-get"),
    onState: (cb: (state: unknown) => void) => {
      const listener = (_e: IpcRendererEvent, state: unknown) => cb(state);
      ipcRenderer.on("sparstrow:server-state", listener);
      return () => ipcRenderer.removeListener("sparstrow:server-state", listener);
    },
  },
  dialogs: {
    /** Absolute path of the chosen directory, or null when cancelled. */
    pickDirectory: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke("sparstrow:pick-directory", defaultPath),
  },
  session: {
    /** Opens the browser and waits for the confirm. Never returns a token. */
    signIn: (): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke("sparstrow:sign-in"),
    signOut: (): Promise<{ ok: true }> => ipcRenderer.invoke("sparstrow:sign-out"),
    /**
     * The credential for an Authorization header, or null when signed out.
     *
     * This is the one call that hands a secret to the renderer, and it is
     * deliberately a FUNCTION rather than a value captured at startup: the
     * stored token can change under it (sign-out, re-connect), and a value read
     * once is one that keeps authenticating after the user signed out.
     */
    token: (): Promise<string | null> => ipcRenderer.invoke("sparstrow:session-token"),
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

type ServerConfigStatus = {
  configured: boolean;
  supabaseUrl: string | null;
  hasServiceRoleKey: boolean;
  hasJwtSecret: boolean;
  encryptionAvailable: boolean;
};

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
