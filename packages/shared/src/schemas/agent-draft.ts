import { z } from "zod";
import { agentCreateSchema } from "./agent.js";

/**
 * The Agent Creator works with a PARTIAL agent draft that fills in over the
 * conversation. It is validated against the REAL agent schema field names
 * (`cwd`, `memoryReadScopes`, …) — never the design module's legacy names
 * (`workingDir`, `readScopes`, `skill`). zod strips unknown keys, so a draft
 * carrying the old names simply drops them instead of silently corrupting data.
 */
export const agentDraftSchema = agentCreateSchema.partial();
export type AgentDraft = z.infer<typeof agentDraftSchema>;

export const draftIntentSchema = z.enum(["build", "find"]);
export type DraftIntent = z.infer<typeof draftIntentSchema>;

export const draftMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type DraftMessage = z.infer<typeof draftMessageSchema>;

/** Request body for POST /api/v1/agents/draft. The incoming `draft` is untrusted
 *  work-in-progress context (it may carry an empty name, partial fields, even
 *  legacy names) — it is accepted loosely here and re-validated + clamped
 *  server-side by clampDraft, so request validation never rejects a half-filled
 *  draft. */
export const draftRequestSchema = z.object({
  messages: z.array(draftMessageSchema).min(1),
  draft: z.record(z.unknown()).default({}),
  /** Provider session id to resume the interview (multi-turn). */
  sessionId: z.string().optional(),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export interface AgentMatch {
  id: string;
  name: string;
  role: string;
  reason?: string;
}

/**
 * One turn of the Agent Creator conversation. `source` lets the UI announce
 * when the AI was unavailable and a deterministic fallback produced the turn —
 * it must never substitute silently.
 */
export interface DraftTurn {
  reply: string;
  intent: DraftIntent;
  draft: AgentDraft;
  /** Server-computed from the REAL required fields, not the model's say-so. */
  readyToCreate: boolean;
  followups: string[];
  matches: AgentMatch[];
  sessionId: string | null;
  source: "ai" | "fallback";
}
