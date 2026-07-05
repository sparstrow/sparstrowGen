import fs from "node:fs";
import path from "node:path";
import { HttpError } from "../orchestrator/run-manager.js";

/** P4 §4 Context panel — READ-ONLY project file tree (P4-Q4; open-in-editor deferred). */
export interface DirEntry {
  name: string;
  type: "dir" | "file";
  size: number | null;
}

/** Directories that only add noise to a code file tree. */
const HIDDEN = new Set([".git", "node_modules", ".turbo", "dist", ".next", ".venv", "__pycache__"]);
const MAX_ENTRIES = 500;

/**
 * List one directory level under a project's rootDir. Strictly contained: the
 * requested subpath is resolved under rootDir and rejected if it escapes (no
 * `..` traversal out of the project). Read-only — never opens file contents.
 */
export function listProjectDir(rootDir: string | null, subpath: string): { path: string; entries: DirEntry[] } {
  if (!rootDir) throw new HttpError(400, "project has no rootDir");
  const base = path.resolve(rootDir);
  const target = path.resolve(base, subpath || ".");
  // Containment: target must be base or a descendant.
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new HttpError(400, "path escapes the project root");
  }
  if (!fs.existsSync(target)) throw new HttpError(404, "path not found");
  if (!fs.statSync(target).isDirectory()) throw new HttpError(400, "not a directory");

  const entries: DirEntry[] = [];
  for (const dirent of fs.readdirSync(target, { withFileTypes: true })) {
    if (HIDDEN.has(dirent.name)) continue;
    const isDir = dirent.isDirectory();
    let size: number | null = null;
    if (dirent.isFile()) {
      try {
        size = fs.statSync(path.join(target, dirent.name)).size;
      } catch {
        size = null;
      }
    }
    entries.push({ name: dirent.name, type: isDir ? "dir" : "file", size });
    if (entries.length >= MAX_ENTRIES) break;
  }
  // Directories first, then files, each alphabetical.
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  // Relative sub-path (forward slashes) for the client to build the next request.
  const rel = path.relative(base, target).split(path.sep).join("/");
  return { path: rel, entries };
}
