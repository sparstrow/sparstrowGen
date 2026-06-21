import { z } from "zod";
import { idSchema, isoDateSchema, slugSchema } from "./common.js";

export const memoryScopeKindSchema = z.enum(["global", "project", "agent"]);
export type MemoryScopeKind = z.infer<typeof memoryScopeKindSchema>;

export const memoryNoteSchema = z.object({
  id: idSchema,
  /** Path relative to vault root, forward slashes. */
  path: z.string().min(1),
  scope: memoryScopeKindSchema,
  projectSlug: slugSchema.nullable().default(null),
  agentSlug: slugSchema.nullable().default(null),
  title: z.string().default(""),
  tags: z.array(z.string()).default([]),
  /** 'user' or 'agent:<slug>' */
  source: z.string().default("user"),
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
});
export type MemoryNoteCreate = z.infer<typeof memoryNoteCreateSchema>;

export const memorySearchRequestSchema = z.object({
  query: z.string().min(1),
  /** Scope strings using the agent memory-scope grammar; omitted = all scopes. */
  scopes: z.array(z.string()).optional(),
  k: z.number().int().min(1).max(50).default(8),
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
});
export type MemorySearchHit = z.infer<typeof memorySearchHitSchema>;
