// Intentionally minimal: the UI talks to the core over HTTP/WS only. The one
// exception is the self-update flow (0004 Phase 2), which is Electron-side by
// nature — exposed as a narrow, invoke-only surface.
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
});
