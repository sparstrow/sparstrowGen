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
 * The one write on `/pair` — pending -> approved, nothing else. This is a
 * real Server Action invoked by the confirm button's `onClick`, not logic
 * inlined into the page's render: a Server Component's render runs on the
 * initial GET, and doing the mutation there would bypass Next's built-in
 * Server Action origin/CSRF checks (see the plan's "What the spec asks for
 * that isn't obvious").
 *
 * Minting the real daemon token is NOT this action's job — see
 * `exchange_pairing_attempt` (policies/031). This only ever flips a row from
 * `pending` to `approved`, governed entirely by RLS
 * (`pairing_attempts_approve`): the WITH CHECK clause is what actually
 * decides which workspace the machine joins, by requiring `ctx.workspaceId`
 * to be one this caller is a member of. There is nothing this action adds on
 * top of that boundary, matching how `revokeRuntimeTokenAction` in
 * `app/machines/actions.ts` relies on RLS alone.
 */
export async function approvePairingAttemptAction(
  attemptId: string,
): Promise<ActionResult<{ callback: string }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("pairing_attempts")
    .update({
      status: "approved",
      workspace_id: ctx.workspaceId,
      approved_by_user_id: user.id,
    })
    .eq("id", attemptId)
    .select("callback")
    .maybeSingle();

  if (error) return actionErrorFrom(error);
  // RLS denies the update silently (zero rows) rather than erroring, for a
  // row that's missing, already approved/consumed, or expired — all three
  // read the same as "not found" here, which is exactly what the page's
  // error state (US1 scenario 9) is written to handle without needing to
  // tell them apart.
  if (!data) return actionFail("This pairing attempt is no longer valid.", "attempt_not_found");

  return actionOk({ callback: data.callback as string });
}
