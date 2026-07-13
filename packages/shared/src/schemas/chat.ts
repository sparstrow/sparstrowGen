import { z } from "zod";
import { providerIdSchema, type ProviderId } from "./agent.js";
import { agentDraftSchema } from "./agent-draft.js";
import type { DraftTurn } from "./agent-draft.js";
import { idSchema, isoDateSchema } from "./common.js";

/**
 * Unified session-chat architecture (intake 0001 + 0002). One session model
 * backs every conversational surface:
 *   - `free`          — stateless-context chat with a CLI model, no project/agent binding
 *   - `project`       — chat grounded in one project's repo (read-only tools, cwd = rootDir)
 *   - `agent`         — chat with a specific agent (its prompt/provider/model/tools)
 *   - `agent-creator` — the Agent Creator interview; `draft` holds the WIP agent
 * Sessions and their messages persist in SQLite, so closing the browser never
 * loses a conversation — they're a permanent, revisitable history.
 */
export const chatSessionKindSchema = z.enum(["free", "project", "agent", "agent-creator"]);
export type ChatSessionKind = z.infer<typeof chatSessionKindSchema>;

export const chatSessionStatusSchema = z.enum(["active", "archived"]);
export type ChatSessionStatus = z.infer<typeof chatSessionStatusSchema>;

export const chatSessionSchema = z.object({
  id: idSchema,
  kind: chatSessionKindSchema,
  title: z.string().default(""),
  projectId: z.string().nullable().default(null),
  agentId: z.string().nullable().default(null),
  /** Provider/model driving the turns. For `agent` sessions these mirror the agent row. */
  provider: providerIdSchema.nullable().default(null),
  model: z.string().nullable().default(null),
  status: chatSessionStatusSchema.default("active"),
  /** Agent Creator sessions only: the accumulated (clamped) agent draft. */
  draft: agentDraftSchema.nullable().default(null),
  lastMessageAt: isoDateSchema.nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type ChatSession = z.infer<typeof chatSessionSchema>;

export const chatMessageRoleSchema = z.enum(["user", "assistant"]);
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;

/** Per-message annotations (which model answered, creator followups, …). */
export interface ChatMessageMeta {
  source?: "ai" | "fallback";
  provider?: ProviderId;
  model?: string;
  followups?: string[];
  readyToCreate?: boolean;
  [key: string]: unknown;
}

export const chatMessageSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  role: chatMessageRoleSchema,
  content: z.string(),
  meta: z.record(z.unknown()).nullable().default(null),
  createdAt: isoDateSchema,
});
export type ChatMessage = Omit<z.infer<typeof chatMessageSchema>, "meta"> & {
  meta: ChatMessageMeta | null;
};

export const chatSessionCreateSchema = z.object({
  kind: chatSessionKindSchema,
  title: z.string().max(120).optional(),
  projectId: z.string().optional(),
  agentId: z.string().optional(),
  provider: providerIdSchema.optional(),
  model: z.string().optional(),
});
export type ChatSessionCreate = z.infer<typeof chatSessionCreateSchema>;

export const chatSessionUpdateSchema = z.object({
  title: z.string().max(120).optional(),
  status: chatSessionStatusSchema.optional(),
  /** Switch the model mid-conversation; subsequent turns use the new target
   *  (each stored reply is stamped with the model that produced it). */
  provider: providerIdSchema.optional(),
  model: z.string().min(1).optional(),
});
export type ChatSessionUpdate = z.infer<typeof chatSessionUpdateSchema>;

export const chatSessionListQuerySchema = z.object({
  kind: chatSessionKindSchema.optional(),
  projectId: z.string().optional(),
  agentId: z.string().optional(),
  status: chatSessionStatusSchema.optional(),
});
export type ChatSessionListQuery = z.infer<typeof chatSessionListQuerySchema>;

/** POST /chat/sessions/:id/messages — one user turn. `draft` is only honored on
 *  agent-creator sessions (untrusted WIP context, clamped server-side). */
export const chatTurnRequestSchema = z.object({
  content: z.string().min(1),
  draft: z.record(z.unknown()).optional(),
});
export type ChatTurnRequest = z.infer<typeof chatTurnRequestSchema>;

/** POST /chat/sessions/:id/retry — re-run the last failed turn, optionally on a
 *  different (secondary) provider/model. The user decides; never silent. */
export const chatRetryRequestSchema = z.object({
  provider: providerIdSchema.optional(),
  model: z.string().optional(),
  draft: z.record(z.unknown()).optional(),
});
export type ChatRetryRequest = z.infer<typeof chatRetryRequestSchema>;

/** Why a turn failed — surfaced verbatim to the user instead of a vague
 *  "unavailable" (intake 0001: name the actual reason, offer a failover). */
export interface ChatTurnError {
  /** Coarse classification for the UI. */
  kind: "timeout" | "not-installed" | "usage-limit" | "provider" | "unknown";
  /** Human-readable detail (the provider's actual error text when present). */
  reason: string;
  /** How many attempts were made on the model that failed. */
  attempts: number;
  /** Suggested secondary model. The UI must ASK before using it. */
  fallback: { provider: ProviderId; model: string } | null;
}

/** Result of one chat turn. On failure `assistantMessage` is null and `error`
 *  says why; the user message is kept so /retry can re-run it. */
export interface ChatTurn {
  session: ChatSession;
  userMessage: ChatMessage | null;
  assistantMessage: ChatMessage | null;
  error: ChatTurnError | null;
  /** Agent Creator sessions only: the full draft turn (draft, followups, matches…). */
  draftTurn: DraftTurn | null;
}

/** GET /chat/sessions/:id */
export interface ChatSessionDetail {
  session: ChatSession;
  messages: ChatMessage[];
}
