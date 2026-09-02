"use server";

import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";

/**
 * The one write on `/connect` — pending -> approved, nothing else.
 *
 * A real Server Action invoked by the confirm button's `onClick`, not logic
 * inlined into the page's render: a Server Component's render runs on the
 * initial GET, and doing the mutation there would bypass Next's built-in
 * Server Action origin/CSRF checks.
 *
 * Minting the real access token is NOT this action's job — see
 * `exchange_connect_attempt` (policies/033). This only ever flips a row from
 * `pending` to `approved`, governed entirely by RLS
 * (`connect_attempts_approve`), whose WITH CHECK is what actually records
 * whose computer this becomes.
 *
 * No workspace is chosen here, unlike the workspace-scoped version this
 * replaces. A machine belongs to a person and reaches every workspace that
 * person is in, so there is nothing left to pick.
 */
export async function approveConnectAttemptAction(
  attemptId: string,
): Promise<ActionResult<{ callback: string }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("connect_attempts")
    .update({ status: "approved", approved_by_user_id: user.id })
    .eq("id", attemptId)
    .select("callback")
    .maybeSingle();

  if (error) return actionErrorFrom(error);
  // RLS denies the update silently (zero rows) rather than erroring, for a row
  // that's missing, already approved/consumed, or expired — all of which read
  // the same as "not found" here, which is what the page's error state is
  // written to handle without needing to tell them apart.
  if (!data) return actionFail("This connection attempt is no longer valid.", "attempt_not_found");

  return actionOk({ callback: data.callback as string });
}
