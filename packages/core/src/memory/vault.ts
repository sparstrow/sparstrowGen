import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  VAULT_DIRS,
  slugify,
  type MemoryNote,
  type MemoryNoteCreate,
  type MemoryScopeKind,
} from "@sparstrow/shared";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { memoryNotes } from "../db/schema.js";
import { logger } from "../logger.js";

const nowIso = () => new Date().toISOString();

export function ensureVaultDirs(): void {
  for (const dir of Object.values(VAULT_DIRS)) {
    fs.mkdirSync(path.join(config.vaultPath, dir), { recursive: true });
  }
}

/** Vault-relative path with forward slashes (stable key across OSes). */
export function toRelPath(absPath: string): string {
  return path.relative(config.vaultPath, absPath).split(path.sep).join("/");
}

export function toAbsPath(relPath: string): string {
  const abs = path.resolve(config.vaultPath, relPath);
  if (!abs.startsWith(path.resolve(config.vaultPath))) {
    throw new Error(`path escapes vault: ${relPath}`);
  }
  return abs;
}

export function scopeDir(
  scope: MemoryScopeKind,
  projectSlug?: string | null,
  agentSlug?: string | null,
): string {
  switch (scope) {
    case "global":
      return VAULT_DIRS.global;
    case "project": {
      if (!projectSlug) throw new Error("projectSlug required for project-scoped notes");
      return `${VAULT_DIRS.projects}/${projectSlug}`;
    }
    case "agent": {
      if (!agentSlug) throw new Error("agentSlug required for agent-scoped notes");
      return `${VAULT_DIRS.agents}/${agentSlug}`;
    }
  }
}

/** Derive scope metadata from a vault-relative path. Inbox files index as global. */
export function deriveScopeFromPath(relPath: string): {
  scope: MemoryScopeKind;
  projectSlug: string | null;
  agentSlug: string | null;
} {
  const parts = relPath.split("/");
  const head = parts[0];
  if (head === VAULT_DIRS.projects && parts.length >= 3) {
    return { scope: "project", projectSlug: parts[1] ?? null, agentSlug: null };
  }
  if (head === VAULT_DIRS.agents && parts.length >= 3) {
    return { scope: "agent", projectSlug: null, agentSlug: parts[1] ?? null };
  }
  return { scope: "global", projectSlug: null, agentSlug: null };
}

function rowToNote(row: typeof memoryNotes.$inferSelect): MemoryNote {
  return {
    id: row.id,
    path: row.path,
    scope: row.scope as MemoryScopeKind,
    projectSlug: row.projectSlug,
    agentSlug: row.agentSlug,
    title: row.title,
    tags: row.tags,
    source: row.source,
    contentHash: row.contentHash,
    indexedAt: row.indexedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function writeNote(input: MemoryNoteCreate): MemoryNote {
  const db = getDb();
  const id = `mem_${nanoid(10)}`;
  const dir = scopeDir(input.scope, input.projectSlug, input.agentSlug);
  const filename = `${slugify(input.title) || "note"}-${nanoid(6).toLowerCase()}.md`;
  const relPath = `${dir}/${filename}`;
  const absPath = toAbsPath(relPath);
  const ts = nowIso();

  const frontmatter: Record<string, unknown> = {
    id,
    scope: input.scope,
    ...(input.projectSlug ? { project: input.projectSlug } : {}),
    ...(input.agentSlug ? { agent: input.agentSlug } : {}),
    title: input.title,
    tags: input.tags,
    source: input.source,
    created: ts,
    updated: ts,
  };
  const fileContent = stringifyFrontmatter(input.content, frontmatter);

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, fileContent, "utf8");
  noteSelfWrite(relPath, sha256(fileContent));

  const row: typeof memoryNotes.$inferInsert = {
    id,
    path: relPath,
    scope: input.scope,
    projectSlug: input.projectSlug ?? null,
    agentSlug: input.agentSlug ?? null,
    title: input.title,
    tags: input.tags,
    source: input.source,
    contentHash: sha256(fileContent),
    indexedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  db.insert(memoryNotes).values(row).run();
  return rowToNote(row as typeof memoryNotes.$inferSelect);
}

export function getNote(id: string): MemoryNote | null {
  const row = getDb().select().from(memoryNotes).where(eq(memoryNotes.id, id)).get();
  return row ? rowToNote(row) : null;
}

export function readNoteRaw(note: MemoryNote): string {
  return fs.readFileSync(toAbsPath(note.path), "utf8");
}

/** Body without frontmatter, for excerpts/injection. */
export function readNoteBody(note: MemoryNote): string {
  const raw = readNoteRaw(note);
  return parseFrontmatter(raw).content.trim();
}

export function writeNoteRaw(id: string, content: string): MemoryNote {
  const db = getDb();
  const note = getNote(id);
  if (!note) throw new Error(`note not found: ${id}`);
  const absPath = toAbsPath(note.path);
  fs.writeFileSync(absPath, content, "utf8");
  const hash = sha256(content);
  noteSelfWrite(note.path, hash);
  const ts = nowIso();
  db.update(memoryNotes)
    .set({ contentHash: hash, updatedAt: ts, indexedAt: null })
    .where(eq(memoryNotes.id, id))
    .run();
  return { ...note, contentHash: hash, updatedAt: ts, indexedAt: null };
}

export function deleteNote(id: string): void {
  const note = getNote(id);
  if (!note) return;
  try {
    fs.rmSync(toAbsPath(note.path), { force: true });
  } catch (err) {
    logger.warn({ err, path: note.path }, "failed to delete note file");
  }
  getDb().delete(memoryNotes).where(eq(memoryNotes.id, id)).run();
}

/* Self-write suppression: scan/watcher skips files we just wrote ourselves. */
const recentSelfWrites = new Map<string, { hash: string; at: number }>();
const SELF_WRITE_TTL_MS = 5000;

export function noteSelfWrite(relPath: string, hash: string): void {
  recentSelfWrites.set(relPath, { hash, at: Date.now() });
}

export function isSelfWrite(relPath: string, hash: string): boolean {
  const entry = recentSelfWrites.get(relPath);
  if (!entry) return false;
  if (Date.now() - entry.at > SELF_WRITE_TTL_MS) {
    recentSelfWrites.delete(relPath);
    return false;
  }
  return entry.hash === hash;
}

function* walkMdFiles(absDir: string): Generator<string> {
  if (!fs.existsSync(absDir)) return;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) yield* walkMdFiles(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) yield full;
  }
}

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
}

/**
 * Reconcile the vault with memory_notes. Read-only toward user files:
 * scope/metadata is derived (frontmatter wins) and stored in the DB only.
 * Returns note ids needing (re)indexing for the phase-2 embedder.
 */
export function scanVault(): ScanResult & { dirtyNoteIds: string[] } {
  const db = getDb();
  const result: ScanResult & { dirtyNoteIds: string[] } = {
    added: 0,
    updated: 0,
    removed: 0,
    dirtyNoteIds: [],
  };
  const seenPaths = new Set<string>();
  const existingRows = db.select().from(memoryNotes).all();
  const byPath = new Map(existingRows.map((r) => [r.path, r]));

  for (const dirName of Object.values(VAULT_DIRS)) {
    for (const absPath of walkMdFiles(path.join(config.vaultPath, dirName))) {
      const relPath = toRelPath(absPath);
      seenPaths.add(relPath);
      let raw: string;
      try {
        raw = fs.readFileSync(absPath, "utf8");
      } catch {
        continue; // file vanished or locked mid-scan
      }
      const hash = sha256(raw);
      const existing = byPath.get(relPath);
      if (existing && existing.contentHash === hash) continue;

      let fm: Record<string, unknown> = {};
      let body = raw;
      try {
        const parsed = parseFrontmatter(raw);
        fm = parsed.data;
        body = parsed.content;
      } catch {
        // malformed frontmatter — index as plain content
      }
      const derived = deriveScopeFromPath(relPath);
      const scope = (
        fm.scope === "global" || fm.scope === "project" || fm.scope === "agent"
          ? fm.scope
          : derived.scope
      ) as MemoryScopeKind;
      const title =
        (typeof fm.title === "string" && fm.title) ||
        firstHeading(body) ||
        path.basename(relPath, ".md");
      const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
      const ts = nowIso();

      if (existing) {
        db.update(memoryNotes)
          .set({
            scope,
            projectSlug: typeof fm.project === "string" ? fm.project : derived.projectSlug,
            agentSlug: typeof fm.agent === "string" ? fm.agent : derived.agentSlug,
            title,
            tags,
            contentHash: hash,
            indexedAt: null,
            updatedAt: ts,
          })
          .where(eq(memoryNotes.id, existing.id))
          .run();
        result.updated++;
        result.dirtyNoteIds.push(existing.id);
      } else {
        const id = typeof fm.id === "string" && fm.id ? fm.id : `mem_${nanoid(10)}`;
        db.insert(memoryNotes)
          .values({
            id,
            path: relPath,
            scope,
            projectSlug: typeof fm.project === "string" ? fm.project : derived.projectSlug,
            agentSlug: typeof fm.agent === "string" ? fm.agent : derived.agentSlug,
            title,
            tags,
            source: typeof fm.source === "string" ? fm.source : "user",
            contentHash: hash,
            indexedAt: null,
            createdAt: typeof fm.created === "string" ? fm.created : ts,
            updatedAt: ts,
          })
          .onConflictDoNothing()
          .run();
        result.added++;
        result.dirtyNoteIds.push(id);
      }
    }
  }

  for (const row of existingRows) {
    if (!seenPaths.has(row.path)) {
      db.delete(memoryNotes).where(eq(memoryNotes.id, row.id)).run();
      result.removed++;
    }
  }
  return result;
}

function firstHeading(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}
