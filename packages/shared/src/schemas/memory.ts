import { z } from "zod";
import { idSchema, isoDateSchema, slugSchema } from "./common";

export const memoryScopeKindSchema = z.enum(["global", "project", "agent"]);
export type MemoryScopeKind = z.infer<typeof memoryScopeKindSchema>;

/**
 * P5 typed memory (spec §6, plan item 2). `note` is the untyped default every
 * pre-0008 row migrates to; the rest let the query engine filter by kind
 * ("give me all *decisions* about auth"). `lesson` carries the P5 LESSONS
 * overlay (portable code refs — see lessonRefSchema).
 */
export const memoryNoteTypeSchema = z.enum([
  "note",
  "decision",
  "architecture",
  "pitfall",
  "meeting",
  "lesson",
]);
export type MemoryNoteType = z.infer<typeof memoryNoteTypeSchema>;
export const MEMORY_NOTE_TYPES = memoryNoteTypeSchema.options;

/**
 * P5 LESSONS (plan item 7, amended 2026-07-05): lessons store PORTABLE
 * (filePath, symbolName) refs — never the graph engine's qualified-name
 * grammar, which is vendor-coupled. One core-owned fn translates these to
 * engine names at query time (server/src/memory/lessons.ts).
 */
export const lessonRefSchema = z.object({
  /** Repo-relative file path, forward slashes. */
  filePath: z.string().min(1),
  symbolName: z.string().min(1),
});
export type LessonRef = z.infer<typeof lessonRefSchema>;

export const memoryNoteSchema = z.object({
  id: idSchema,
  /** Path relative to vault root, forward slashes. */
  path: z.string().min(1),
  scope: memoryScopeKindSchema,
  projectSlug: slugSchema.nullable().default(null),
  agentSlug: slugSchema.nullable().default(null),
  title: z.string().default(""),
  tags: z.array(z.string()).default([]),
  /** 'user', 'agent:<slug>', 'signal' (P5 extractor), or 'dream' (P5 synthesis). */
  source: z.string().default("user"),
  type: memoryNoteTypeSchema.default("note"),
  /**
   * EH6 quarantine: a signal note extracted from a run that consumed
   * untrusted/external content. Non-injectable and invisible to agent reads
   * until the owner approves it (a stored note is a second-order prompt-
   * injection channel).
   */
  quarantined: z.boolean().default(false),
  /**
   * P5 dream cycle soft-archive: originals merged into a synthesis note are
   * archived (never hard-deleted) and point at the synthesis via supersededBy.
   */
  archivedAt: isoDateSchema.nullable().default(null),
  supersededBy: idSchema.nullable().default(null),
  contentHash: z.string().default(""),
  indexedAt: isoDateSchema.nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type MemoryNote = z.infer<typeof memoryNoteSchema>;

export const memoryNoteCreateSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  scope: memoryScopeKindSchema,
  projectSlug: slugSchema.nullable().optional(),
  agentSlug: slugSchema.nullable().optional(),
  tags: z.array(z.string()).default([]),
  source: z.string().default("user"),
  type: memoryNoteTypeSchema.default("note"),
  /** LESSONS refs; persisted to frontmatter. Meaningful for type='lesson'. */
  refs: z.array(lessonRefSchema).default([]),
  /** EH6: written-quarantined (core-internal writers only; harmless via API). */
  quarantined: z.boolean().default(false),
});
export type MemoryNoteCreate = z.infer<typeof memoryNoteCreateSchema>;
/** Input-side shape: defaulted fields (tags/source/type/refs/quarantined) optional. */
export type MemoryNoteCreateInput = z.input<typeof memoryNoteCreateSchema>;

export const memorySearchRequestSchema = z.object({
  query: z.string().min(1),
  /** Scope strings using the agent memory-scope grammar; omitted = all scopes. */
  scopes: z.array(z.string()).optional(),
  k: z.number().int().min(1).max(50).default(8),
  /** P5 typed memory: restrict hits to one note type. */
  type: memoryNoteTypeSchema.optional(),
  /** P5 synthesis-over-search: also return a cited synthesis of the top hits. */
  synthesize: z.boolean().default(false),
});
export type MemorySearchRequest = z.infer<typeof memorySearchRequestSchema>;

export const memorySearchHitSchema = z.object({
  noteId: idSchema,
  path: z.string(),
  title: z.string(),
  scope: memoryScopeKindSchema,
  projectSlug: slugSchema.nullable(),
  agentSlug: slugSchema.nullable(),
  excerpt: z.string(),
  heading: z.string().nullable(),
  score: z.number(),
  vecRank: z.number().nullable(),
  ftsRank: z.number().nullable(),
  type: memoryNoteTypeSchema.default("note"),
});
export type MemorySearchHit = z.infer<typeof memorySearchHitSchema>;

/**
 * P5 synthesis-over-search result (gbrain-think pattern): a cited answer plus
 * an explicit gaps line — what memory does NOT know — so callers never mistake
 * retrieval silence for confirmation.
 */
export interface MemorySynthesis {
  /** Markdown answer with inline [n] citations into `citations`. */
  answer: string;
  /** What the searched memory does not cover, as specific missing pieces. */
  gaps: string[];
  citations: Array<{ index: number; noteId: string; path: string; title: string }>;
}

/** P5 wikilinks: one `[[Note Title]]` edge extracted at index time. */
export interface MemoryLink {
  id: number;
  fromNoteId: string;
  /** Resolved target; null while the linked title has no matching note. */
  toNoteId: string | null;
  /** The raw link text — kept even when resolved, for re-resolution. */
  unresolvedTitle: string;
  createdAt: string;
}

/** P5 dream cycle: a flagged (never auto-resolved) contradiction pair. */
export interface MemoryContradiction {
  id: string;
  projectSlug: string | null;
  noteA: string;
  noteB: string;
  /** One line: what the two notes disagree about. */
  axis: string;
  severity: "info" | "low" | "medium" | "high";
  confidence: number;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}
