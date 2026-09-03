import { lessonRefSchema, type LessonRef, type MemoryNote } from "@sparstrow/shared";
import { parseFrontmatter } from "./frontmatter.js";
import { readNoteRaw } from "./vault.js";

/**
 * P5 LESSONS overlay (plan item 7, re-specced by the 2026-07-05 amendment):
 * lessons are typed memory notes (type='lesson') whose frontmatter stores
 * PORTABLE (filePath, symbolName) refs. The engine's qualified-name grammar is
 * data-level vendor coupling — refused at rest. This module owns the ONLY
 * place that grammar is spelled: toEngineQualifiedName, applied at query time.
 * (Lesson-decoration of graph results is a recorded TODO — needs this fn.)
 */

/** Parse a lesson note's refs from its frontmatter. Invalid entries dropped. */
export function parseLessonRefs(fm: Record<string, unknown>): LessonRef[] {
  const raw = fm.refs;
  if (!Array.isArray(raw)) return [];
  const refs: LessonRef[] = [];
  for (const entry of raw) {
    const parsed = lessonRefSchema.safeParse(entry);
    if (parsed.success) refs.push(parsed.data);
  }
  return refs;
}

/** Read a note's lesson refs from its file (frontmatter is source of truth). */
export function readNoteRefs(note: MemoryNote): LessonRef[] {
  try {
    return parseLessonRefs(parseFrontmatter(readNoteRaw(note)).data);
  } catch {
    return [];
  }
}

/**
 * THE core-owned translation fn (amendment: "resolved to engine names at query
 * time by one core-owned translation fn"): a portable (filePath, symbolName)
 * ref becomes a codebase-memory-mcp qualified name.
 *
 * Engine grammar (v0.8.1, spike-observed): `<engineProject>.<dotted path
 * without extension>.<symbolName>` where the file path's slashes become dots
 * and the extension is stripped — e.g. project `my-app` +
 * (`server/src/orchestrator/run-manager.ts`, `RunManager.tick`) →
 * `my-app.packages.core.src.orchestrator.run-manager.RunManager.tick`.
 * If the engine's grammar ever changes, THIS is the only line to update.
 */
export function toEngineQualifiedName(engineProject: string, ref: LessonRef): string {
  const dottedPath = ref.filePath
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.[^./]+$/, "")
    .replace(/\//g, ".");
  return `${engineProject}.${dottedPath}.${ref.symbolName}`;
}
