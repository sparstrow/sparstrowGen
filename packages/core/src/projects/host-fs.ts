import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DirectoryEntry, DirectoryListing, Volume } from "@sparstrow/shared";
import { HttpError } from "../orchestrator/run-manager.js";

/**
 * 001 — host directory browsing for the New project folder picker.
 *
 * Deliberately NOT part of `files.ts`. That module's entire job is containment
 * under a project root; this one is defined by the absence of containment, and
 * folding a "skip the check" branch into the function that enforces it is how
 * a project file tree quietly becomes a whole-disk browser. They stay apart.
 *
 * Access to everything here is gated twice before a handler is reached: the
 * routes are registered only when `config.deployment === "local"` (FR-022a),
 * and each refuses non-loopback callers (FR-022b).
 */

const MAX_ENTRIES = 500; // matches files.ts, so the repo has one answer

/** Names that are never plausible project roots and only add permission noise. */
const SKIP = new Set([
  "$RECYCLE.BIN",
  "System Volume Information",
  "$Recycle.Bin",
]);

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/** Windows exposes no volume API to Node; probe the letters instead (research R2). */
async function windowsVolumes(): Promise<Volume[]> {
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  const found = await Promise.all(
    letters.map(async (letter) => {
      const root = `${letter}:\\`;
      try {
        await fs.promises.access(root);
        return { path: root, label: `${letter}:` } satisfies Volume;
      } catch {
        return null;
      }
    }),
  );
  return found.filter((v): v is Volume => v !== null);
}

export async function listVolumes(): Promise<Volume[]> {
  if (process.platform === "win32") return windowsVolumes();
  return [{ path: path.sep, label: path.sep }];
}

/**
 * The parent of an absolute path, or null when it is already a volume root.
 * `path.dirname("C:\\")` returns "C:\\" and `path.dirname("/")` returns "/",
 * so the fixed point is what identifies a root — not a platform check.
 */
function parentOf(target: string): string | null {
  const parent = path.dirname(target);
  return parent === target ? null : parent;
}

/**
 * One directory level: immediate subdirectories only, alphabetical, bounded.
 * `target` defaults to the home directory of the account the core runs as
 * (FR-005) — never the volume list, which costs several clicks to reach a
 * typical project folder.
 */
export function listHostDir(target?: string): DirectoryListing {
  const requested = target?.trim();
  if (requested && !path.isAbsolute(requested)) {
    throw new HttpError(400, "path must be absolute");
  }
  const dir = path.resolve(requested || os.homedir());

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new HttpError(403, `permission denied: ${dir}`);
    }
    throw new HttpError(404, `path not found: ${dir}`);
  }
  if (!stat.isDirectory()) throw new HttpError(400, `not a directory: ${dir}`);

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new HttpError(403, `permission denied: ${dir}`);
    }
    throw err;
  }

  const entries: DirectoryEntry[] = [];
  let truncated = false;
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue; // directories only — files aren't selectable
    if (isHidden(dirent.name) || SKIP.has(dirent.name)) continue;
    if (entries.length >= MAX_ENTRIES) {
      truncated = true;
      break;
    }
    entries.push({ name: dirent.name, path: path.join(dir, dirent.name) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return { path: dir, parent: parentOf(dir), entries, truncated };
}

/**
 * Create exactly one directory directly inside `parent` (FR-016 – FR-020).
 *
 * The segment checks and the resolve check are deliberately redundant: they
 * fail independently, and the cost of a miss here is writing outside the
 * directory the owner is looking at.
 */
export function createHostDir(parent: string, rawName: string): DirectoryListing {
  if (!path.isAbsolute(parent)) throw new HttpError(400, "parent must be an absolute path");
  const name = rawName.trim();
  if (!name) throw new HttpError(400, "folder name is required");
  if (name.length > 255) throw new HttpError(400, "folder name is too long");
  if (name === "." || name === "..") throw new HttpError(400, "folder name is not a valid name");
  if (name.includes("/") || name.includes("\\") || path.isAbsolute(name)) {
    throw new HttpError(400, "folder name must be a single folder, not a path");
  }

  const base = path.resolve(parent);
  let parentStat: fs.Stats;
  try {
    parentStat = fs.statSync(base);
  } catch {
    throw new HttpError(404, `folder not found: ${base}`);
  }
  if (!parentStat.isDirectory()) throw new HttpError(400, `not a directory: ${base}`);

  const target = path.resolve(base, name);
  // Independent confirmation of the segment checks above: the result must be a
  // direct child of the directory being shown, not merely a plausible-looking name.
  if (path.dirname(target) !== base) {
    throw new HttpError(400, "folder name must be a single folder, not a path");
  }
  if (fs.existsSync(target)) {
    throw new HttpError(409, `"${name}" already exists in ${base}`);
  }

  try {
    // No `recursive`: a missing parent chain must fail rather than be created
    // silently, which is what makes "creates a single level" true by construction.
    fs.mkdirSync(target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      throw new HttpError(403, `cannot create a folder in ${base}: permission denied`);
    }
    if (code === "EEXIST") throw new HttpError(409, `"${name}" already exists in ${base}`);
    throw new HttpError(400, `could not create "${name}": ${(err as Error).message}`);
  }

  return listHostDir(target);
}
