// Intentionally minimal: the UI talks to the core over HTTP/WS only. There are
// two exceptions, both Electron-side by nature and both exposed as narrow,
// invoke-only surfaces:
//   - the self-update flow (0004 Phase 2)
//   - the native folder picker (001 US1), because no web API can return a real
//     host path from the OS directory dialog
// Neither hands a filesystem handle to the renderer; the picker returns a
// string or null and can do nothing else.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

contextBridge.exposeInMainWorld("sparstrowDesktop", {
  version: "0.1.0",
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
});
