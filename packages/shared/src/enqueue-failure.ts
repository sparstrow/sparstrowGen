import {
  CHAT_TURN_ENQUEUE_ERRCODE_REASONS,
  ENQUEUE_ERRCODE_REASONS,
  type ChatTurnEnqueueFailureReason,
  type EnqueueFailureReason,
} from "./cloud";

/**
 * Translating `start_run`'s error contract into HTTP.
 *
 * The SQLSTATEs are defined in `packages/shared/drizzle/policies/009_command_spine.sql`
 * and the token map lives in `./cloud.ts`, so three places cannot drift: the
 * function that raises, the client that switches, and this, which converts.
 *
 * Moved here from `apps/web/src/lib/api/` by restructure Phase 1, which is
 * where it should always have been — this file *is* the contract between the
 * two sides, and the comment above already said so by pointing at a SQL file
 * and a shared token map while sitting in the web app. `server/` raises the
 * status; `packages/core` switches on the reason. Both import it from here.
 *
 * Pure and separate from the handlers so the mapping is testable without
 * standing up a supabase client — the status code chosen for each failure is a
 * real decision, and it should not need a mock to assert.
 */

export interface EnqueueFailure {
  status: number;
  reason: EnqueueFailureReason;
  message: string;
}

/**
 * 404 for "that thing does not exist"; 409 for "it exists, but not in a state
 * that can run right now".
 *
 * The 409s are the interesting ones, and they are 409 rather than 400 or 503
 * deliberately: nothing about the request is malformed and nothing is
 * temporarily broken on the server. The workspace is in a state that conflicts
 * with the ask — no machine online, no machine holding that project — and the
 * fix is an action the user takes (start a machine, relink, reassign), which is
 * exactly what 409 means.
 */
const STATUS_BY_REASON: Record<EnqueueFailureReason, number> = {
  agent_not_found: 404,
  agent_disabled: 409,
  no_runtime_available: 409,
  project_not_available: 409,
  project_not_found: 404,
  run_not_found: 404,
  no_agent_assigned: 400,
};

/**
 * Recognise an error raised by `start_run` / `cancel_run`.
 *
 * Returns null for anything else, which the caller must rethrow: a connection
 * failure or a genuine bug must not be laundered into a tidy 409 that tells the
 * user to check their machines. Swallowing unknown errors here is the "no
 * superficial symptom patches" rule (AGENTS.md §3.5) in the one place it would
 * be most tempting to break.
 */
export function enqueueFailureFrom(error: unknown): EnqueueFailure | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return null;

  const reason = ENQUEUE_ERRCODE_REASONS[code];
  if (!reason) return null;

  // The message comes from the RAISE in SQL, which is written for a person:
  // "No machine is online that can run claude-code." Passing it through beats
  // inventing a second copy here that has to be kept in step with the first.
  const raw = (error as { message?: unknown }).message;
  const message =
    typeof raw === "string" && raw.trim() ? raw.trim() : "That run could not be started.";

  return { status: STATUS_BY_REASON[reason], reason, message };
}

// ─── M13 — the same job, for enqueue_chat_turn / retry_chat_turn ───────────

export interface ChatTurnFailure {
  status: number;
  reason: ChatTurnEnqueueFailureReason;
  message: string;
}

/**
 * 409 for both "in progress" and "not retryable yet" — nothing about either
 * request is malformed, and the fix is an action the caller takes (wait, or
 * retry once it's terminal). 404 for "does not exist", same rule as above.
 *
 * `turn_in_progress` is what FR-004's second-send refusal renders as. Unlike
 * `no_runtime_available`, `enqueue_chat_turn` never raises for "nothing is
 * online" at all — DD-3 has it return a `waiting` row instead, so there is no
 * "no chat runtime available" reason to map here.
 */
const CHAT_STATUS_BY_REASON: Record<ChatTurnEnqueueFailureReason, number> = {
  turn_in_progress: 409,
  session_not_found: 404,
  turn_not_found: 404,
  turn_not_retryable: 409,
};

/**
 * Recognise an error raised by `enqueue_chat_turn` / `retry_chat_turn`.
 *
 * Returns null for anything else, which the caller must rethrow — same rule
 * as `enqueueFailureFrom`: a connection failure laundered into a tidy 409
 * would tell the owner their session is busy when the truth is the database
 * is down.
 */
export function chatTurnFailureFrom(error: unknown): ChatTurnFailure | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return null;

  const reason = CHAT_TURN_ENQUEUE_ERRCODE_REASONS[code];
  if (!reason) return null;

  const raw = (error as { message?: unknown }).message;
  const message =
    typeof raw === "string" && raw.trim() ? raw.trim() : "That chat turn could not be sent.";

  return { status: CHAT_STATUS_BY_REASON[reason], reason, message };
}
