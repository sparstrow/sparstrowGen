import { NextResponse } from "next/server";
import { createClient } from "@web/utils/supabase/server";
import { safeRedirectPath } from "@web/lib/auth/redirect";
import { siteOrigin } from "@web/lib/auth/origin";
import {
  crossBrowserOutcome,
  isMissingCodeVerifier,
  isRecoveryNext,
  RECOVERY_DESTINATION,
} from "@web/lib/auth/cross-browser-link";

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

  // Read the RAW `next` before sanitising, because `safeRedirectPath` rewrites
  // every `/auth/*` path to `/` -- correct for an attacker-suppliable value,
  // but it also erases the one thing that identifies a password reset. Without
  // this distinction a recovery link signs the user in and drops them on the
  // dashboard with their OLD password still in force, believing they had just
  // changed it; `lib/auth/otp-types.ts` names that exact failure, and the
  // sibling /auth/confirm route already guards against it via
  // `destinationForOtpType`. This brings the two routes into line.
  // See doc/bug/BUG-2026-08-28-password-reset-link-lands-on-dashboard.md.
  const rawNext = url.searchParams.get("next");
  const recovery = isRecoveryNext(rawNext);
  const next = recovery ? RECOVERY_DESTINATION : safeRedirectPath(rawNext);

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
    // A link opened in a browser other than the one that started the flow
    // cannot complete the PKCE exchange. That is not a broken link and must
    // not be reported as one -- see lib/auth/cross-browser-link.ts.
    if (isMissingCodeVerifier(error.message)) {
      const outcome = crossBrowserOutcome(recovery);
      const target = new URL("/login", origin);
      target.searchParams.set(outcome.kind === "notice" ? "notice" : "error", outcome.text);
      return NextResponse.redirect(target.toString());
    }
    return NextResponse.redirect(failureUrl(origin, error.message));
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function failureUrl(origin: string, message: string): string {
  const target = new URL("/login", origin);
  target.searchParams.set("error", message);
  return target.toString();
}
