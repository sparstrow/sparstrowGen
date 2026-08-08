# Contract: Desktop preload directory-picker channel

**Feature**: 001-project-folder-picker | **Files**: `packages/desktop/src/preload.ts`,
`packages/desktop/src/dialogs.ts`, `packages/desktop/src/main.ts`

---

## Why this surface stays narrow

`preload.ts` opens with a deliberate statement that the UI talks to the core over HTTP/WS only,
and that self-update is the one exception because it is Electron-side by nature. This feature is
the second exception, on the same grounds: no web API can return a real host path from a native
folder dialog.

It is therefore held to the same shape as the first — **invoke-only, one verb, no filesystem
handle crosses the bridge**. The renderer gets a string back or nothing. It cannot list, read,
write, or enumerate anything through this channel; `contextIsolation: true` and
`nodeIntegration: false` in `main.ts` remain untouched.

---

## Renderer surface

```ts
window.sparstrowDesktop.dialogs.pickDirectory(defaultPath?: string): Promise<string | null>
```

| Outcome | Return |
|---|---|
| A directory was chosen | Its absolute path |
| The dialog was cancelled | `null` |
| The dialog could not be opened | Rejects with an `Error` |

**Detection.** Callers must probe for the function itself —
`typeof window.sparstrowDesktop?.dialogs?.pickDirectory === "function"` — and fall back to the
in-app browser when it is absent. Probing for `sparstrowDesktop` alone is wrong: a shell built
before this feature exposes that object without `dialogs`.

---

## IPC channel

| | |
|---|---|
| Channel | `sparstrow:pick-directory` |
| Direction | `ipcRenderer.invoke` → `ipcMain.handle` |
| Argument | `defaultPath?: string` |
| Resolves | `string \| null` |

Registered alongside the existing `sparstrow:update-*` handlers, following the shape already
established in `packages/desktop/src/updater.ts`.

---

## Main-process behaviour

```
dialog.showOpenDialog(mainWindow, {
  properties: ["openDirectory"],
  defaultPath,        // omitted when absent or not an existing directory
})
```

- **Window-modal.** The `BrowserWindow` is passed, so the dialog cannot be lost behind the app.
- **`defaultPath` is validated before use** — an absolute path to an existing directory, or
  omitted. A stale or malformed value must not stop the dialog from opening (FR-005).
- **Returns `filePaths[0]`** when `canceled` is false and the array is non-empty; `null`
  otherwise.
- **No `createDirectory` property.** It is macOS-only, and the Windows folder dialog already
  provides a New folder button — which is why User Story 3 is scoped to the in-app browser and
  the desktop app needs nothing extra to satisfy it.

---

## What this contract does *not* do

- It does not list directories. The in-app browser's endpoints are a separate surface with their
  own contract, and the desktop app never calls them for this feature.
- It does not create directories. Explorer's own dialog does that, in-process, with no channel
  of ours involved.
- It does not remember the last location. `defaultPath` comes from the field on each call.
