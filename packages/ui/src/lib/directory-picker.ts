/**
 * 001 §FR-007/FR-008: which folder-picking surface this build is running on.
 *
 * The desktop shell exposes a native Explorer dialog over the preload bridge;
 * everywhere else falls back to the in-app directory browser. Probing for the
 * function itself (not for `sparstrowDesktop`) means a shell built before this
 * feature degrades to the fallback instead of throwing.
 */

import type { ProjectCreateMode } from "@sparstrow/shared";

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

/**
 * FR-016 — the create-folder action exists only where the target directory is
 * meant not to exist yet. "Use existing folder" binds something already on
 * disk, so offering to create one there would be offering to bind an empty
 * folder, which is what "Start from scratch" is for.
 */
export function canCreateFolder(mode: ProjectCreateMode): boolean {
  return mode === "scratch" || mode === "clone";
}

/**
 * FR-017 — a submitted folder name must be exactly one segment. The server
 * validates this again before touching disk; this copy exists to fail the
 * owner fast in the dialog, never as the security boundary.
 */
export function isSingleSegment(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) return false;
  if (trimmed === "." || trimmed === "..") return false;
  return !trimmed.includes("/") && !trimmed.includes("\\") && !/^[a-zA-Z]:/.test(trimmed);
}

/**
 * The last segment of an absolute path, for display. Falls back to the whole
 * path at a volume root, where there is no trailing segment to show.
 */
export function displayName(absolutePath: string): string {
  const trimmed = absolutePath.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  return cut >= 0 && cut < trimmed.length - 1 ? trimmed.slice(cut + 1) : absolutePath;
}
