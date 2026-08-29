# BUG-2026-08-28-password-reset-link-lands-on-dashboard

**Status:** 🟢 resolved
**Reported by:** agent — found while fixing
[`FB-2026-08-27-email-confirm-cross-browser-pkce-error`](../feedback/FB-2026-08-27-email-confirm-cross-browser-pkce-error.md);
the cross-browser branch being written for that fix turned out to be
unreachable, and the reason it was unreachable was this bug.
**Reported:** 2026-08-28

## Symptom

Clicking an emailed password-reset link signs the user in and drops them on
the **dashboard**, never showing the "choose a new password" form. The
session is real, so nothing looks broken — but the password was never
changed, and the old one still works. The user has every reason to believe
they just reset it.

This is the exact failure [`lib/auth/otp-types.ts`](../../apps/web/src/lib/auth/otp-types.ts)
already warns about in its own comment on `destinationForOtpType`:

> `recovery` is the one that must not go to the dashboard: it signs you in
> only so you can pick a new password, and dropping the user on `/` turns it
> into an ordinary session with the old password still in force.

That guard exists in `/auth/confirm`. It did not exist in `/auth/callback`,
which is where `resetPasswordForEmail` actually sends people.

## Reproduction

1. On `/login`, choose "Forgot password?" and submit an email address that
   has an account.
2. Open the emailed reset link **in the same browser** (so PKCE succeeds —
   the cross-browser case is a different, now-also-fixed failure).
3. Expected: the `/auth/reset-password` form.
   Actual: the dashboard at `/`, signed in, with no password form and no
   indication the reset did not happen.

## Investigation

The chain, all pre-existing:

1. [`login/page.tsx`](../../apps/web/src/app/login/page.tsx) calls
   `resetPasswordForEmail(email, { redirectTo: ".../auth/callback?next=/auth/reset-password" })`.
2. [`auth/callback/route.ts`](../../apps/web/src/app/auth/callback/route.ts)
   did `const next = safeRedirectPath(url.searchParams.get("next"))` as its
   very first act.
3. [`lib/auth/redirect.ts:31`](../../apps/web/src/lib/auth/redirect.ts:31)
   rejects **every** `/auth/*` path and returns `/`:
   ```ts
   if (next.startsWith("/login") || next.startsWith("/auth/")) return DEFAULT_DESTINATION;
   ```
4. So by the time the route redirects on success, `next` is `/` — the
   recovery destination has been erased, silently, on every single reset.

`safeRedirectPath` is **not** wrong: it closes an open redirect on an
attacker-suppliable parameter, and `/auth/*` endpoints genuinely are not
pages. The mistake was routing this app's own fixed recovery destination
through a sanitiser built for untrusted input, and then having no way to tell
afterwards that it had been rewritten.

Found because the cross-browser fix needed to answer "is this a recovery
flow?" and discovered the answer was unknowable after sanitising — the
branch written for it was dead code that could never execute.

## Impact

Every password reset via the emailed link, for as long as both routes have
existed. Severity is higher than it looks: the failure is **silent and
looks like success**. The user is signed in, so there is no error to notice;
they believe the reset happened, and a password they were trying to rotate
(possibly because they thought it was compromised) stays live.

No workaround existed from the UI — the reset form at `/auth/reset-password`
is reachable by typing the URL while signed in, but nothing pointed there.

## Resolution

Fixed in `fix/auth-signup-reset-and-tab-order` alongside the cross-browser
work, since the two share a root cause (the callback route could not
distinguish a recovery flow from any other).

`/auth/callback` now reads the **raw** `next` before sanitising, decides
`recovery` from it via `isRecoveryNext()`, and uses the fixed literal
`RECOVERY_DESTINATION` for that case rather than passing the user's value
through:

```ts
const rawNext = url.searchParams.get("next");
const recovery = isRecoveryNext(rawNext);
const next = recovery ? RECOVERY_DESTINATION : safeRedirectPath(rawNext);
```

This is safe against the open redirect `safeRedirectPath` guards: the
recovery branch substitutes a hard-coded constant and never echoes attacker
input. It also brings `/auth/callback` in line with `/auth/confirm`, which
has always done the equivalent via `destinationForOtpType`.

New helper and tests in
[`lib/auth/cross-browser-link.ts`](../../apps/web/src/lib/auth/cross-browser-link.ts)
/ `.test.ts`, including an explicit regression guard asserting that
`safeRedirectPath(RECOVERY_DESTINATION) === "/"` and that
`isRecoveryNext()` therefore **must** be read before sanitising — the
ordering constraint is the whole bug, so it is pinned by a test rather than
left to a comment.

**Verified:** `pnpm --filter web typecheck` clean, 459/459 tests passing.
Live via `agent-browser` on port 3030: hitting
`/auth/callback?code=<bad>&next=/auth/reset-password` now takes the recovery
branch and shows the recovery-specific message, proving `recovery` evaluates
true for a real request against the running route — the same variable that
selects the destination on the success path.

**Not directly exercised:** the successful-exchange redirect itself, which
needs a genuinely emailed reset link and a real PKCE round trip; the built-in
Supabase mailer only delivers to project-org member addresses
([`doc/runbooks/email-delivery.md`](../runbooks/email-delivery.md)), so a
disposable `@sparstrow.test` account cannot receive one. The branch condition
is live-proven; the one line it selects is unit-tested only. Worth a
confirming click-through next time a real reset email is sent.
