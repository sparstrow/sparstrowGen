import { z } from "zod";
import { providerIdSchema, type ProviderId } from "./agent";
import { agentDraftSchema } from "./agent-draft";
import type { DraftTurn } from "./agent-draft";
import { idSchema, isoDateSchema } from "./common";

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

/**
 * CS6 (Band 26, T-CS6-01) — the client-facing read shape for one row of
 * `chat_message_attachments` (T-CS5-01). `storagePath` IS included here,
 * unlike the daemon's own dispatch payload — this is read back by a
 * workspace member who already has RLS SELECT access to the object itself
 * (`025_chat_attachments_storage.sql`), so naming the path here grants
 * nothing the bucket's own policy doesn't already allow; it's what lets the
 * composer mint its own signed URL on click, the same
 * `createSignedUrl` call the daemon makes, under the caller's own session
 * rather than a service-role one.
 */
export const chatMessageAttachmentSchema = z.object({
  id: idSchema,
  storagePath: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});
export type ChatMessageAttachment = z.infer<typeof chatMessageAttachmentSchema>;

export const chatMessageSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  role: chatMessageRoleSchema,
  content: z.string(),
  meta: z.record(z.unknown()).nullable().default(null),
  createdAt: isoDateSchema,
  attachments: z.array(chatMessageAttachmentSchema).default([]),
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

/**
 * A message becomes an argv-bound prompt on someone's machine (see
 * `TRANSCRIPT_BUDGET_BYTES` in `packages/core/src/chat/service.ts`, which
 * this ceiling deliberately sits above — a route-level clamp, not the
 * budget itself). Unbounded input is a spawn failure on a laptop rather than
 * a 400 here; this is the one clamp DD-8 (M12 plan) asks for at this
 * boundary, everything else stays pass-through.
 */
export const CHAT_MESSAGE_MAX_BYTES = 64_000;

/**
 * CS5 (Band 26, T-CS5-02) — a file already uploaded to the `chat-attachments`
 * bucket (`createChatAttachmentUploader`), waiting to be attached to the
 * message the caller is about to send. Never a URL — `storagePath` is the
 * object key; reads happen later through a signed URL (T-CS5-03), never
 * anything stored durably that could resolve the file without RLS.
 */
export const chatAttachmentUploadSchema = z.object({
  storagePath: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});
export type ChatAttachmentUpload = z.infer<typeof chatAttachmentUploadSchema>;

/**
 * How many attachments one message may carry. The spec's own Edge Cases
 * section leaves "what happens with more than one file" open at the UX
 * level (CS6's to answer — how it's displayed, whether there's a lower,
 * UI-enforced limit) — this is only a request-boundary sanity clamp, the
 * same kind `CHAT_MESSAGE_MAX_BYTES` already is for `content`, not a
 * product decision about how many a user should realistically attach.
 */
export const CHAT_ATTACHMENTS_MAX_PER_MESSAGE = 10;

/**
 * POST /chat/sessions/:id/messages — one user turn. `draft` is only honored
 * on agent-creator sessions (untrusted WIP context, clamped server-side).
 *
 * `content` allows empty — CS6's own Trap: a message with an attachment but
 * no text must still be sendable, and `chat_messages.content` being NOT
 * NULL means that's an explicit `""`, not a validation error. The action
 * layer (`postChatTurnAction`) is what actually enforces "text OR an
 * attachment, not neither."
 */
export const chatTurnRequestSchema = z.object({
  content: z
    .string()
    .refine((s) => Buffer.byteLength(s, "utf8") <= CHAT_MESSAGE_MAX_BYTES, {
      message: `content must not exceed ${CHAT_MESSAGE_MAX_BYTES} bytes`,
    }),
  draft: z.record(z.unknown()).optional(),
  attachments: z.array(chatAttachmentUploadSchema).max(CHAT_ATTACHMENTS_MAX_PER_MESSAGE).optional(),
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
  /**
   * M13 — the session's most recent turn, terminal or not; `status`
   * distinguishes them. `null` if no turn was ever sent. This is what makes a
   * turn recoverable after a reload (FR-007): the mutation response is gone
   * once the page remounts, and this field is the only source left. The local
   * host always reports a terminal turn here, or `null` if the local `ChatTurn`
   * shape doesn't apply (agent-creator sessions).
   */
  activeTurn: ChatTurnState | null;
}

// ─── M12 — one async contract for both hosts ────────────────────────────────

/**
 * The unified response shape for `POST /chat/sessions/:id/messages` and
 * `.../retry`, used by BOTH the cloud-dispatched path and the local
 * single-daemon path (M12 plan, DD-7).
 *
 * `ChatTurn` above is synchronous — built when the local daemon answered
 * in-process and could return the finished exchange from the POST itself.
 * The cloud path cannot do that: the reply doesn't exist yet when the route
 * returns. Rather than give `packages/ui` two response shapes to branch on
 * (exactly the "am I hosted?" question `live-events.ts` already documents a
 * component must never ask), both hosts now return THIS shape — the cloud
 * route returns it non-terminal (usually `waiting` or `in_progress`) and the
 * local Fastify route returns it already terminal, `assistantMessage`
 * populated, in the same request. The consumer renders the turn and
 * subscribes only while `status` is non-terminal.
 *
 * Migrating existing callers of `ChatTurn` to this shape is M13's job, not
 * this schema addition's — this is purely additive until then.
 */
export const chatTurnStatusSchema = z.enum(["waiting", "in_progress", "succeeded", "failed"]);
export type ChatTurnStatus = z.infer<typeof chatTurnStatusSchema>;

export const chatTurnWaitingReasonSchema = z.enum([
  "no_runtime_paired",
  "all_runtimes_offline",
  "project_not_available",
]);

export const chatTurnStateSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  status: chatTurnStatusSchema,
  waitingReason: chatTurnWaitingReasonSchema.nullable(),
  /** Full text produced so far — grows in place, never a delta, matching how it's stored. */
  replyText: z.string(),
  replySeq: z.number(),
  provider: providerIdSchema.nullable(),
  model: z.string().nullable(),
  attempt: z.number(),
  retryOfTurnId: z.string().nullable(),
  error: z.string().nullable(),
  userMessage: chatMessageSchema,
  /** Present only once `status === "succeeded"`. */
  assistantMessage: chatMessageSchema.nullable(),
});
export type ChatTurnState = z.infer<typeof chatTurnStateSchema>;
