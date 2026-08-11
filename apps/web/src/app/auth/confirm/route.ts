import { NextResponse } from "next/server";
import { createClient } from "@web/utils/supabase/server";
import { safeRedirectPath } from "@web/lib/auth/redirect";
import { siteOrigin } from "@web/lib/auth/origin";
import { destinationForOtpType, isHandledOtpType } from "@web/lib/auth/otp-types";

/**
 * Landing point for every link Supabase mails out: sign-in-by-link, account
 * confirmation, password recovery, and email-change verification. They arrive
 * as `?token_hash=...&type=magiclink`, which is a different exchange from the
 * OAuth `?code=...` handled in ../callback.
 *
 * One route serves all of them because the exchange is identical -- only the
 * destination afterwards differs. See lib/auth/otp-types.ts.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = siteOrigin(request, url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || !isHandledOtpType(type)) {
    return NextResponse.redirect(failureUrl(origin, "That link is not valid."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Overwhelmingly this is an expired or already-used link, and saying so is
    // what tells the user to request a fresh one instead of retrying the same
    // one from their inbox.
    return NextResponse.redirect(failureUrl(origin, error.message));
  }

  const next = url.searchParams.get("next");
  const destination = next ? safeRedirectPath(next) : destinationForOtpType(type);

  return NextResponse.redirect(`${origin}${destination}`);
}

function failureUrl(origin: string, message: string): string {
  const target = new URL("/login", origin);
  target.searchParams.set("error", message);
  return target.toString();
}
