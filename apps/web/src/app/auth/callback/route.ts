import { NextResponse } from "next/server";
import { createClient } from "@web/utils/supabase/server";
import { safeRedirectPath } from "@web/lib/auth/redirect";
import { siteOrigin } from "@web/lib/auth/origin";

/**
 * OAuth / PKCE landing point.
 *
 * GitHub and Google send the browser back here with `?code=...`, which we
 * exchange for a session. They also send it back here when the user clicks
 * "Cancel" on the consent screen, or when the provider is misconfigured -- in
 * that case there is no `code` at all, only `?error=access_denied&
 * error_description=...`. The previous version ignored those parameters
 * entirely and redirected to a bare "Authentication failed", so a wrong client
 * secret and a user changing their mind were indistinguishable, and neither
 * told you which provider had the problem.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = siteOrigin(request, url);
  const next = safeRedirectPath(url.searchParams.get("next"));

  const providerError = url.searchParams.get("error");
  if (providerError) {
    // `error_description` is the provider's own prose. It is the only thing
    // that distinguishes "you cancelled" from "this provider is not enabled
    // in Supabase", which is the failure people actually hit during setup.
    const description = url.searchParams.get("error_description") || providerError;
    return NextResponse.redirect(failureUrl(origin, description));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      failureUrl(origin, "The sign-in link was missing its authorization code."),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(failureUrl(origin, error.message));
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function failureUrl(origin: string, message: string): string {
  const target = new URL("/login", origin);
  target.searchParams.set("error", message);
  return target.toString();
}
