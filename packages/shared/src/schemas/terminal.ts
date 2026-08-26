import { z } from "zod";
import { isoDateSchema } from "./common";

/**
 * M16 — the terminal channel's wire contract.
 *
 * Two Realtime topic families carry this (`machineControlTopic` /
 * `terminalSessionTopic` in `../cloud.ts`): a per-machine control channel for
 * request/reply, and a per-session channel for raw input/output. Nothing
 * downstream of this file invents a request kind, a reply shape, or an event
 * name — `T-M16-03`'s send policy matches the control/session event names
 * literally, so a shape drifting from what it was written against silently
 * changes what a client is allowed to send.
 */

/**
 * Why a control request was refused, as a stable token — M17 renders a
 * different sentence for each, and an unmatched string would fall through to
 * a generic error, the exact failure this contract exists to delete.
 */
export const terminalRefusalSchema = z.enum([
  "terminal_access_disabled",
  "session_limit_reached",
  "unknown_session",
  "agent_not_interactive",
  "agent_not_found",
  "spawn_failed",
]);
export type TerminalRefusal = z.infer<typeof terminalRefusalSchema>;

/**
 * What a subscriber renders about one session.
 *
 * NOT `packages/core`'s local `TerminalSession` — that interface carries
 * `agentId` as a machine-local id the browser cannot resolve on its own, so
 * this carries the agent's name alongside it (mirrors how `terminals.tsx`
 * already falls back to `shortId` when it can't find a match today).
 *
 * `ageMs` and `attached` were added by `T-M16-05`, after this schema first
 * shipped in `T-M16-01` — safe to widen additively since nothing outside
 * this module's own tests consumed the type yet. `ageMs` is computed on the
 * MACHINE and sent as a number rather than left for the browser to diff
 * against `createdAt` itself, the same reasoning `HeartbeatResponse.serverTime`
 * uses: the two clocks are in different domains and a diffed timestamp would
 * silently absorb whatever skew exists between them.
 */
export const terminalSessionInfoSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().nullable(),
  agentName: z.string().nullable(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  createdAt: isoDateSchema,
  /** Milliseconds since createdAt, as of when this was sent. */
  ageMs: z.number().int().nonnegative(),
  /** Whether any sink — local WS or cloud bridge — is currently attached. */
  attached: z.boolean(),
});
export type TerminalSessionInfo = z.infer<typeof terminalSessionInfoSchema>;

// ─── Control channel: browser → machine requests ────────────────────────────
//
// Every request carries a client-generated `requestId`; every reply echoes
// it. The control topic is per machine, not per browser, so two tabs issuing
// `terminal.list` at once both receive both replies — `requestId` is how each
// finds its own. A reply with an unrecognised `requestId` is dropped, not
// logged as an error.

export const terminalListRequestSchema = z.object({
  requestId: z.string().min(1),
  kind: z.literal("terminal.list"),
});
export type TerminalListRequest = z.infer<typeof terminalListRequestSchema>;

export const terminalOpenRequestSchema = z.object({
  requestId: z.string().min(1),
  kind: z.literal("terminal.open"),
  agentId: z.string().nullable().optional(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
export type TerminalOpenRequest = z.infer<typeof terminalOpenRequestSchema>;

export const terminalCloseRequestSchema = z.object({
  requestId: z.string().min(1),
  kind: z.literal("terminal.close"),
  sessionId: z.string().min(1),
});
export type TerminalCloseRequest = z.infer<typeof terminalCloseRequestSchema>;

/**
 * Also how a live resize travels — re-attaching an already-open session with
 * new `cols`/`rows` is the resize, since the plan's four kinds are a closed
 * set and there is no fifth for it.
 */
export const terminalAttachRequestSchema = z.object({
  requestId: z.string().min(1),
  kind: z.literal("terminal.attach"),
  sessionId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
export type TerminalAttachRequest = z.infer<typeof terminalAttachRequestSchema>;

/** Every request kind a browser may send on the control topic, and no fifth. */
export const machineRequestSchema = z.discriminatedUnion("kind", [
  terminalListRequestSchema,
  terminalOpenRequestSchema,
  terminalCloseRequestSchema,
  terminalAttachRequestSchema,
]);
export type MachineRequest = z.infer<typeof machineRequestSchema>;

// ─── Control channel: machine → browser replies ─────────────────────────────

export const terminalListReplySchema = z.object({
  requestId: z.string().min(1),
  kind: z.literal("terminal.list"),
  sessions: z.array(terminalSessionInfoSchema),
  /** So a stale client can tell "no sessions" apart from "different machine boot". */
  machineStartedAt: isoDateSchema,
});
export type TerminalListReply = z.infer<typeof terminalListReplySchema>;

export const terminalOpenReplySchema = z.union([
  z.object({
    requestId: z.string().min(1),
    kind: z.literal("terminal.open"),
    session: terminalSessionInfoSchema,
  }),
  z.object({
    requestId: z.string().min(1),
    kind: z.literal("terminal.open"),
    error: terminalRefusalSchema,
  }),
]);
export type TerminalOpenReply = z.infer<typeof terminalOpenReplySchema>;

export const terminalCloseReplySchema = z.union([
  z.object({
    requestId: z.string().min(1),
    kind: z.literal("terminal.close"),
    ok: z.literal(true),
  }),
  z.object({
    requestId: z.string().min(1),
    kind: z.literal("terminal.close"),
    error: terminalRefusalSchema,
  }),
]);
export type TerminalCloseReply = z.infer<typeof terminalCloseReplySchema>;

export const terminalAttachReplySchema = z.union([
  z.object({
    requestId: z.string().min(1),
    kind: z.literal("terminal.attach"),
    session: terminalSessionInfoSchema,
    /** The session's ring buffer as of attach, so a reconnecting client catches up. */
    replay: z.string(),
  }),
  z.object({
    requestId: z.string().min(1),
    kind: z.literal("terminal.attach"),
    error: terminalRefusalSchema,
  }),
]);
export type TerminalAttachReply = z.infer<typeof terminalAttachReplySchema>;

/** Every reply shape a machine may send on the control topic. */
export const machineReplySchema = z.union([
  terminalListReplySchema,
  terminalOpenReplySchema,
  terminalCloseReplySchema,
  terminalAttachReplySchema,
]);
export type MachineReply = z.infer<typeof machineReplySchema>;

// ─── Session channel: raw bytes, both directions ────────────────────────────
//
// The topic is per session already (`terminal:<workspaceId>:<sessionId>`), so
// unlike the chat broadcast — one topic serving many turns — nothing here
// repeats an id the topic already carries.

export const terminalInputMessageSchema = z.object({
  data: z.string(),
});
export type TerminalInputMessage = z.infer<typeof terminalInputMessageSchema>;

export const terminalOutputMessageSchema = z.object({
  data: z.string(),
});
export type TerminalOutputMessage = z.infer<typeof terminalOutputMessageSchema>;
