import { NextResponse } from "next/server";
import { createClient } from "@web/utils/supabase/server";
import { siteOrigin } from "@web/lib/auth/origin";

/**
 * Sign out on the server so the auth cookies are actually cleared.
 *
 * Calling `supabase.auth.signOut()` in the browser drops the client-side
 * session, but the httpOnly cookies the middleware reads are set by the
 * server -- so on the next full page load the middleware still sees a valid
 * user and lets them straight back in. Routing sign-out through here makes the
 * cookie removal part of the response.
 *
 * POST only, deliberately: a GET sign-out can be triggered by any <img> tag on
 * any page on the internet, and logging users out at random is a nuisance a
 * cross-site request should not be able to cause.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // `scope: "global"` revokes every refresh token for the user, not just
    // this browser's. Signing out is the action people take on a machine they
    // no longer trust, so it should mean everywhere.
    await supabase.auth.signOut({ scope: "global" });
  }

  const origin = siteOrigin(request, new URL(request.url));
  return NextResponse.redirect(new URL("/login", origin), { status: 303 });
}
