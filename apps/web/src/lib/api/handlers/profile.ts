import { registerRoute, ok, fail, HandlerContext } from "../router";

/**
 * M9 — the profile as something a person fills in.
 *
 * Singular and id-less, like `/workspace` and for the same reason (M9
 * decision 1): the caller is exactly one user, resolved from the session.
 *
 * **This endpoint serves the form, not the shell.** The sidebar keeps reading
 * the session snapshot (`account-snapshot.ts`), which is server-rendered into
 * the first paint to avoid a hydration mismatch. The two do not compete: one
 * shows a name, the other edits three fields. `bio` is deliberately absent from
 * the session metadata (plan decision 9) — the shell never renders it and it
 * would ride along on every request — so the form has nowhere but here to read
 * it from.
 *
 * The write half (`PATCH /me`) moved to `app/settings/actions.ts`'s
 * `updateProfileAction` (`T-WA-08`); `parseProfilePatch` moved out to
 * `lib/patch-validation.ts` for the reason documented there, and is
 * re-exported below so this module's existing import sites are unaffected.
 */

export { parseProfilePatch, type ProfilePatch } from "../../patch-validation";

/** Everything GET returns. `role` is deliberately absent. */
const SELECT = "id, email, name, avatar_url, bio";

registerRoute({
  method: "GET",
  pattern: "/me",
  handler: async ({ supabase }: HandlerContext) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail(401, "not authenticated");

    const { data, error } = await supabase
      .from("users")
      .select(SELECT)
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    // bootstrap_workspace inserts this row on the first authenticated request,
    // so its absence means something upstream failed rather than "new user".
    if (!data) return fail(404, "Not Found");
    return ok(data);
  },
});
