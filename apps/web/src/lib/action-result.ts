import { toCamel, toSnake } from "@sparstrow/shared";
import { createClient } from "@web/utils/supabase/server";
import { getActiveWorkspaceId } from "@sparstrow/server/routes";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The result convention every Server Action in `apps/web` returns.
 *
 * Why a discriminated result and not a thrown error: React Query's `onError`
 * was doing real work on these pages -- 400s carrying a field message, the
 * 501s from `handlers/stubs.ts`, "no machine is online". **An uncaught throw
 * in a Server Action reaches the client as a generic redacted digest in
 * production**, so converting a write to an action that throws would silently
 * destroy every one of those messages while typechecking perfectly.
 *
 * Unexpected failures still throw and still reach `error.tsx`. The distinction
 * is expected-and-explainable versus a bug.
 *
 * Plan decision DD-3:
 * `doc/plans/2026-08-24-server-action-write-conversion.md`.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFail(error: string, field?: string): ActionResult<never> {
  return field ? { ok: false, error, field } : { ok: false, error };
}

export interface ActionContext {
  supabase: SupabaseClient;
  workspaceId: string;
}

/**
 * Resolve the caller's session and workspace, exactly as `/api/v1`'s route
 * middleware does for a handler.
 *
 * **A Server Action is a public HTTP endpoint with an unguessable name.** It is
 * not protected by the fact that the page rendering it did an auth check, so
 * every action calls this first rather than inheriting the page's guard (plan
 * DD-4). `getActiveWorkspaceId` performs the `auth.getUser()` check itself and
 * returns `{ error: "Unauthorized" }` when there is no session, so this one
 * call is both the authentication and the workspace resolution.
 *
 * The client is always the *caller's* supabase-js client, never the service
 * role -- RLS stays the security boundary, per AGENTS.md section 4. Moving a
 * write's call site does not relax that.
 *
 * Returns `null` rather than throwing: an unauthenticated action call is an
 * expected failure the caller renders, not a bug for `error.tsx`.
 */
export async function actionContext(): Promise<ActionContext | null> {
  const supabase = await createClient();
  const ws = await getActiveWorkspaceId(supabase);
  if (ws.error || !ws.workspaceId) return null;
  return { supabase, workspaceId: ws.workspaceId };
}

/** The message every action returns when {@link actionContext} yields null. */
export const NOT_SIGNED_IN = "Not signed in.";

/**
 * Translate a Supabase/PostgREST error into an `ActionResult` failure, matching
 * the status-to-message mapping `router.ts#handleError` already applies to the
 * `/api/v1` handlers these actions replace.
 *
 * Keeping the mapping identical is what makes "no behaviour changes" checkable:
 * a converted button that reports a different message for the same database
 * error is a defect, not an improvement (plan Scope boundaries).
 */
export function actionErrorFrom(err: unknown): ActionResult<never> {
  const e = err as { code?: string; message?: string } | null;
  if (e && typeof e === "object" && e.code) {
    // `.single()` matched zero rows -- the id does not exist, or RLS hid
    // another workspace's row. Indistinguishable on purpose.
    if (e.code === "PGRST116") return actionFail("Not Found");
    // The body named a column that does not exist: a malformed request, not a
    // server fault.
    if (e.code === "PGRST204" || e.code === "42703") {
      return actionFail(e.message || "Unknown field in request body");
    }
    // The remaining three codes `router.ts#handleError` special-cases --
    // found missing here while verifying T-WA-03's `deleteAgentAction`
    // (BUG-2026-08-26-agent-update-always-404s's sibling finding). Without
    // these, a converted action fell through to the generic branch below and
    // showed the raw Postgres error text instead of the same friendly
    // message `/api/v1` always gave for these three cases.
    if (e.code === "42501") return actionFail("Forbidden by Row Level Security");
    if (e.code === "23505") return actionFail("Resource already exists (unique violation)");
    if (e.code === "23503") return actionFail("Invalid reference (foreign key violation)");
  }
  console.error("Server Action error:", err);
  return actionFail(e?.message || "Internal Server Error");
}

/**
 * Bodies crossing `/api/v1` were snake-cased by `parseBody` before a handler
 * saw them, and responses were camel-cased by `ok()`. An action has no route
 * around it doing that, so it does the same conversion itself -- otherwise the
 * browser's `logoUrl` reaches Postgres as an unknown column and the row that
 * comes back reads as `logo_url` in a component expecting `logoUrl`.
 */
export { toCamel, toSnake };
