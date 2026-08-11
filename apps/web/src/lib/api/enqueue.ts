import { ENQUEUE_ERRCODE_REASONS, type EnqueueFailureReason } from "@sparstrow/shared";

/**
 * Translating `start_run`'s error contract into HTTP.
 *
 * The SQLSTATEs are defined in `packages/shared/drizzle/policies/009_command_spine.sql`
 * and the token map lives in `@sparstrow/shared`, so three places cannot drift:
 * the function that raises, the client that switches, and this, which converts.
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
