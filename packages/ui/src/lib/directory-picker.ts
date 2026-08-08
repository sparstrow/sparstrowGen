/**
 * 001 §FR-007/FR-008: which folder-picking surface this build is running on.
 *
 * The desktop shell exposes a native Explorer dialog over the preload bridge;
 * everywhere else falls back to the in-app directory browser. Probing for the
 * function itself (not for `sparstrowDesktop`) means a shell built before this
 * feature degrades to the fallback instead of throwing.
 */

export interface DesktopDirectoryDialogs {
  pickDirectory(defaultPath?: string): Promise<string | null>;
}

/** Reads `globalThis`, not `window`, so this module is importable under node (tests). */
function desktopDialogs(): DesktopDirectoryDialogs | null {
  const host = globalThis as { sparstrowDesktop?: { dialogs?: unknown } };
  const dialogs = host.sparstrowDesktop?.dialogs as DesktopDirectoryDialogs | undefined;
  return typeof dialogs?.pickDirectory === "function" ? dialogs : null;
}

export function nativePickerAvailable(): boolean {
  return desktopDialogs() !== null;
}

/** Resolves to the chosen absolute path, or null when the dialog was cancelled. */
export function pickDirectoryNative(defaultPath?: string): Promise<string | null> {
  const dialogs = desktopDialogs();
  if (!dialogs) throw new Error("native directory picker is unavailable");
  return dialogs.pickDirectory(defaultPath);
}
