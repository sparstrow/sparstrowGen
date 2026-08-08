// 001 User Story 1 — the native Explorer folder dialog. Electron-side by
// nature: no web API can return a real host path, which is the same ground on
// which the self-update surface is the other exception to "HTTP/WS only".
import fs from "node:fs";
import path from "node:path";
import { dialog, type BrowserWindow } from "electron";

/**
 * A defaultPath Windows will accept: absolute, and an existing directory. A
 * stale or malformed value must never stop the dialog opening (FR-005), so
 * anything else is dropped rather than passed through.
 */
function usableDefaultPath(candidate?: string): string | undefined {
  if (!candidate?.trim()) return undefined;
  const resolved = candidate.trim();
  if (!path.isAbsolute(resolved)) return undefined;
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Opens the OS directory-selection dialog, modal to the app window so it can
 * never be lost behind it. Resolves to the chosen absolute path, or null when
 * the dialog was cancelled.
 *
 * `createDirectory` is deliberately not passed — it is macOS-only, and the
 * Windows folder dialog already carries its own New folder button, which is
 * why User Story 3 only had to be built for the in-app browser.
 */
export async function pickDirectory(
  win: BrowserWindow | null,
  defaultPath?: string,
): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openDirectory"],
    defaultPath: usableDefaultPath(defaultPath),
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}
