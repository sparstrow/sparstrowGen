/**
 * Deciding what to say when an emailed link's PKCE exchange fails because the
 * link was opened somewhere other than the browser that started the flow.
 *
 * Lives here rather than inside `app/auth/callback/route.ts` for the same
 * reason `otp-types.ts` and `redirect.ts` do: it is pure branching over a
 * string, it decides what a user is told, and both of those make it worth
 * testing directly instead of through a route that needs a mocked Supabase
 * client.
 *
 * See doc/feedback/FB-2026-08-27-email-confirm-cross-browser-pkce-error.md.
 */

/**
 * The PKCE code verifier lives in the storage of the browser that STARTED the
 * flow, so a link opened anywhere else cannot complete the exchange. Supabase
 * reports that as a developer-facing string naming `@supabase/ssr` and telling
 * you to store the verifier in cookies -- accurate for whoever wrote the
 * integration, meaningless to the person who just clicked a link in their
 * phone's mail app.
 *
 * Matched on the phrase rather than a code because supabase-js does not give
 * this failure a distinct `code`/`status`, and `isAuthApiError` is far too
 * broad: it also covers expired and already-used links, which need the
 * opposite advice ("request a fresh one", not "use the original browser").
 */
export function isMissingCodeVerifier(message: string): boolean {
  return /code verifier/i.test(message);
}

export type CrossBrowserOutcome =
  | { kind: "notice"; text: string }
  | { kind: "error"; text: string };

/**
 * Where a recovery link must land, and the one destination
 * `safeRedirectPath` deliberately will not produce.
 *
 * That function rejects every `/auth/*` path to close an open redirect, which
 * is right for an attacker-suppliable value -- but it also silently rewrites
 * this app's own recovery destination to `/`. A caller that wants this must
 * therefore use this literal constant rather than passing the user's `next`
 * through, which is safe precisely because it is a fixed string and not
 * attacker-controlled content.
 */
export const RECOVERY_DESTINATION = "/auth/reset-password";

/**
 * Whether this callback is completing a password reset.
 *
 * Takes the RAW `next` parameter, before `safeRedirectPath` has sanitised it
 * -- after sanitising, a recovery flow is indistinguishable from any other,
 * because `/auth/reset-password` has already become `/`.
 *
 * Exact match, not `startsWith`: this only ever needs to recognise the one
 * value this app itself sends, and a prefix test would widen it for no gain.
 */
export function isRecoveryNext(rawNext: string | null): boolean {
  return rawNext === RECOVERY_DESTINATION;
}

/**
 * What to tell someone whose link failed only because they opened it
 * elsewhere. The advice differs by flow, and getting it wrong wastes their
 * time in opposite directions:
 *
 * - **Confirmation / OAuth** — Supabase's own `/verify` endpoint has ALREADY
 *   marked the address confirmed by the time it redirects here with a code;
 *   the exchange only establishes the session. The account genuinely is ready,
 *   so the honest instruction is "sign in" -- which is exactly what the owner
 *   expected to happen instead of a raw PKCE error.
 * - **Recovery** — the reset form needs the session this exchange would have
 *   created, so there is nothing to sign in to yet. The only ways through are
 *   the original browser or a fresh link, and saying "sign in" here would be
 *   advice that cannot be followed.
 */
export function crossBrowserOutcome(isRecovery: boolean): CrossBrowserOutcome {
  if (isRecovery) {
    return {
      kind: "error",
      text: "That password reset link was opened in a different browser than the one that requested it, so it can't be completed here. Request a new link and open it in this browser.",
    };
  }
  return {
    kind: "notice",
    text: "Your email address is confirmed. Sign in below to finish setting up your account.",
  };
}
