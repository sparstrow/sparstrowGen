import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@web/utils/supabase/server";
import { safeRedirectPath } from "@web/lib/auth/redirect";
import { siteOrigin } from "@web/lib/auth/origin";

/**
 * Landing point for links Supabase mails out: email confirmation, password
 * recovery, and email-change verification. They arrive as
 * `?token_hash=...&type=recovery`, which is a different exchange from the
 * OAuth `?code=...` handled in ../callback.
 *
 * Nothing consumed these before, so "Forgot password?" had nowhere to land --
 * which is a large part of why there was no password reset at all.
 */
const HANDLED_TYPES: EmailOtpType[] = ["signup", "recovery", "invite", "email_change", "email"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = siteOrigin(request, url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type || !HANDLED_TYPES.includes(type)) {
    return NextResponse.redirect(
      failureUrl(origin, "That confirmation link is not valid."),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Overwhelmingly this is an expired or already-used link, and saying so
    // is what tells the user to request a fresh one instead of retrying.
    return NextResponse.redirect(failureUrl(origin, error.message));
  }

  // A recovery link signs you in, but only so you can choose a new password.
  // Send it to the form rather than the dashboard, or the session quietly
  // becomes a normal one and the password is never actually changed.
  const fallback = type === "recovery" ? "/auth/reset-password" : "/";
  const next = url.searchParams.get("next");
  const destination = next ? safeRedirectPath(next) : fallback;

  return NextResponse.redirect(`${origin}${destination}`);
}

function failureUrl(origin: string, message: string): string {
  const target = new URL("/login", origin);
  target.searchParams.set("error", message);
  return target.toString();
}
