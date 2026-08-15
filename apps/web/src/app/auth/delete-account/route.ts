import { NextResponse } from "next/server";
import { createClient } from "@web/utils/supabase/server";

/**
 * Permanently delete the signed-in account.
 *
 * All of the work happens in `public.delete_own_account()` (migration 007),
 * called with the *user's own* session rather than the service role. That is
 * deliberate: the function takes no arguments and resolves its target from
 * `auth.uid()`, so there is no parameter for a caller to point at somebody
 * else's account. A service-role variant taking a user id would put "delete
 * any user" one missing check away from being reachable over HTTP.
 *
 * The confirmation gate lives in the UI (type the email to enable the button).
 * This route additionally requires the email in the body to match the session,
 * so a stray POST -- from a bookmarklet, a retried request, a CSRF attempt --
 * cannot delete an account on its own.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  let confirmEmail: unknown;
  try {
    confirmEmail = (await request.json())?.confirmEmail;
  } catch {
    confirmEmail = undefined;
  }

  if (
    typeof confirmEmail !== "string" ||
    confirmEmail.trim().toLowerCase() !== (user.email ?? "").toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Type your account email exactly to confirm deletion." },
      { status: 400 },
    );
  }

  const { error } = await supabase.rpc("delete_own_account");

  if (error) {
    // 23503 is the function's own signal that this account owns a workspace
    // other people are in. It is the one failure the user can act on, so it
    // gets its own status and keeps its message.
    if (error.code === "23503") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error.message || "Could not delete the account." },
      { status: 500 },
    );
  }

  // The account is gone, but this browser still holds its cookies. Clearing
  // them server-side is what stops the next request presenting a token for a
  // user that no longer exists -- which surfaces as a confusing 500 rather
  // than a clean trip to the login page.
  await supabase.auth.signOut({ scope: "global" }).catch(() => {});

  return NextResponse.json({ ok: true });
}
