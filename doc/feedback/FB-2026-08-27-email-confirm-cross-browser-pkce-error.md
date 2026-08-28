# FB-2026-08-27-email-confirm-cross-browser-pkce-error

**Status:** 🔴 new
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

<!-- Not triaged yet. -->

## Resolution

<!-- Not resolved yet. -->
