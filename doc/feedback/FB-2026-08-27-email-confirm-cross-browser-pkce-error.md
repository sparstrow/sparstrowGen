# FB-2026-08-27-email-confirm-cross-browser-pkce-error

**Status:** 🟢 routed
**Reported by:** owner
**Reported:** 2026-08-27
**Area:** Auth — email confirmation link (`/login` error surface)

## Raw feedback

> I created an account in one browser, and received confirmation link. When I
> clicked the link it opened on different browser. So that showed this error
> message. but the user would not understand what mistake he made. If the
> account is confirmed from the link, it should ask him to sign in to account
> despite any browser. thats what I would have expected.

(Shared alongside a screenshot of the sign-in page showing a red error box:
"PKCE code verifier not found in storage. This can happen if the auth flow
was initiated in a different browser or device, or if the storage was
cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on
both the server and client to store the code verifier in cookies.")

## Context

Sign-up happened in Browser A. The confirmation email link was opened in
Browser B (a different browser than where sign-up started). Landed on
`/login` with a raw Supabase/PKCE library error instead of something a user
could act on — the message is written for a developer debugging the
integration ("use @supabase/ssr on both the server and client..."), not for
the end user who clicked a link in their email client.

Owner's expectation: clicking the confirmation link should confirm the
account regardless of which browser opens it, and land the user somewhere
that lets them sign in — not surface an internal PKCE/storage error.

## Triage

A bug, not a polish item — the app was showing library-internal text to an
end user on a path anyone hitting a second browser or a phone mail client
would take. Fixed directly on `fix/auth-signup-reset-and-tab-order`.

It also **spawned a second, more serious bug**:
[`BUG-2026-08-28-password-reset-link-lands-on-dashboard`](../bug/BUG-2026-08-28-password-reset-link-lands-on-dashboard.md).
Writing the recovery branch for this fix revealed that branch could never
execute, because `safeRedirectPath` had already rewritten the recovery
destination to `/` — meaning every password reset was silently landing on
the dashboard without showing the new-password form.

## Resolution

Done. `/auth/callback` now recognises the "code verifier missing" failure —
which means only *"this link was opened in a different browser"* — and
replaces the raw library text with advice that fits the flow:

- **Confirmation / OAuth** → a success-toned notice: *"Your email address is
  confirmed. Sign in below to finish setting up your account."* This is
  accurate, not reassurance: Supabase's own `/verify` endpoint marks the
  address confirmed **before** redirecting with the code, so the account
  genuinely is ready and only the session is missing. That is exactly the
  behaviour asked for above.
- **Password reset** → an error explaining the link must be opened in the
  browser that requested it, or a new one requested. "Sign in" would be
  advice that cannot be followed here, since the reset form needs the session
  the failed exchange would have created.

Logic and copy live in `apps/web/src/lib/auth/cross-browser-link.ts` with
unit tests, kept out of the route for the same reason `otp-types.ts` and
`redirect.ts` are: it decides what a user is told, and is worth testing
directly. Expired/already-used links are deliberately **not** matched — they
need the opposite advice ("request a fresh one"), and a test pins that
distinction.

**Verified live** (`agent-browser`, port 3030) by hitting `/auth/callback`
with an unusable code from a browser that never started the flow — the exact
cross-browser condition. Confirmation path renders the confirmed/sign-in
notice; recovery path renders the request-a-new-link error. The raw PKCE
string no longer appears on either.

**Still open, and an owner action:** this makes the failure *legible*, but
the link still cannot complete in another browser. Making it seamless means
switching Supabase's email templates to the stateless
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` form,
which `/auth/confirm` and `otp-types.ts` already fully support. That is a
Supabase dashboard change (there is no `supabase/config.toml` in this repo),
so it could not be done from here — see
[`doc/runbooks/email-delivery.md`](../runbooks/email-delivery.md).
