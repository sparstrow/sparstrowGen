import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * The emailed-link types this app knows how to land.
 *
 * Supabase puts the type in the link it mails out, and `verifyOtp` refuses a
 * token whose type does not match. Anything missing from this list is rejected
 * before we ever call Supabase, so the user gets "that link is not valid"
 * rather than a raw API error -- which also means **an omission here silently
 * breaks a whole flow**. `magiclink` was missing when sign-in-by-link was
 * first added back, and every emailed link would have bounced to the error
 * page.
 *
 * - `magiclink`   — sign in by emailed link
 * - `signup`      — confirm a new account
 * - `recovery`    — password reset
 * - `invite`      — invited account (no invite flow yet, but the link type exists)
 * - `email_change`— confirm a new address
 * - `email`       — generic OTP, what `generateLink` mints for admin sessions
 */
const HANDLED: readonly EmailOtpType[] = [
  "magiclink",
  "signup",
  "recovery",
  "invite",
  "email_change",
  "email",
];

export function isHandledOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (HANDLED as readonly string[]).includes(value);
}

/**
 * Where a link of this type should land once the token is exchanged.
 *
 * `recovery` is the one that must not go to the dashboard: it signs you in
 * only so you can pick a new password, and dropping the user on `/` turns it
 * into an ordinary session with the old password still in force.
 */
export function destinationForOtpType(type: EmailOtpType): string {
  return type === "recovery" ? "/auth/reset-password" : "/";
}
