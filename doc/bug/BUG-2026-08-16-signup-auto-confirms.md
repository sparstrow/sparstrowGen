# BUG-2026-08-16-signup-auto-confirms

**Status:** 🟡 investigating — root cause found, fix not yet applied
**Reported by:** owner
**Reported:** 2026-08-16

> **Root cause: the `BEFORE INSERT` trigger `on_auth_user_created_auto_confirm`
> on `auth.users` stamps `email_confirmed_at` on every new row, so GoTrue never
> sends a confirmation and issues a session immediately.** It is a deliberate,
> tracked pre-M1 legacy object (`policies/005_harden_legacy_functions.sql`), kept
> for staging with an explicit "must not ship to production" note — and an owner
> decision from 2026-08-10 that was never made. What nobody recorded is that it
> makes the dashboard's "Confirm email" toggle a **no-op**, which is why toggling
> it changed nothing. Full write-up:
> [`../security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md`](../security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md).

## Symptom

Creating a new account on `/login` (sign-up tab) never sends a confirmation
email and immediately signs the new user in — even with "Confirm email"
verified **ON** and saved in the Supabase dashboard (Authentication → Sign In /
Providers).

## Reproduction

1. Supabase dashboard → Authentication → Users → delete all existing users.
2. `/login` → Create an account → `agent@sparstrow.com` + password → submit.
3. Observed: no redirect to "check your inbox" — straight into the app.
4. Dashboard row for the new user: `Created at`, `Confirmed at`, `Updated at`,
   and `Last signed in` are all the same timestamp (16 Aug 2026 00:54).
   `Confirmation sent at` is blank.

This is a genuinely first-time signup for that email — not a reused/previously
confirmed account (that explanation was checked and ruled out first).

## Investigation

Ruled out so far:
- **"Confirm email" toggle off** — checked via screenshot, it's on and saved.
- **Stale/previously-confirmed user reused** — ruled out; this run used a
  freshly created email with matching `Created at` / `Confirmed at`.
- **Client using a `service_role` key instead of `anon`** — decoded the JWT in
  `apps/web/.env.local`'s `NEXT_PUBLIC_SUPABASE_ANON_KEY`; role is genuinely
  `anon`. Not the cause.
- **A Postgres trigger on `auth.users` auto-confirming new rows** — searched
  `packages/shared/drizzle/**` and found no such trigger; `bootstrap_workspace()`
  only runs post-auth and requires `auth.uid()` to already exist.

Also ruled out during the second pass:
- **Wrong Supabase project.** Owner confirmed the dashboard project ref matches
  `.env.local`'s `pnymngoqseltgigcfevq`.
- **Auth Hooks.** Owner confirmed none are configured (screenshot).
- **`mailer_autoconfirm` actually being on.** `/auth/v1/settings` on the live
  project returns `mailer_autoconfirm: false` — the dashboard toggle is real and
  correctly applied at the GoTrue level.

**Root cause (2026-08-16):** the `BEFORE INSERT` trigger
`on_auth_user_created_auto_confirm` on `auth.users`, calling
`public.auto_confirm_user()`, which sets
`NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now())`. GoTrue then
sees an already-confirmed user, skips the confirmation email, and issues a
session. Found by querying `pg_trigger` on the live database. Evidence and fix:
[`../security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md`](../security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md).

**Two investigation mistakes worth not repeating**, both mine:
1. The first pass searched the **repo** for a trigger and concluded there was
   none. The authoritative source for "what triggers exist" is the **live
   database** (`pg_trigger`), not the migration files.
2. That same grep surfaced `policies/005_harden_legacy_functions.sql`, which
   documents this function explicitly — and I did not open it. Following up
   every file a search returns would have found this in the first minutes.

The app code was never at fault. `apps/web/src/app/login/page.tsx` correctly
branches on whether `signUp()` returned `data.session` — it was handed a real
session and did the right thing with it.

## Impact

If real: anyone can create an account with an email they don't control and be
signed in immediately, with no proof of ownership — regardless of the
project's "Confirm email" setting. Worth re-checking against
[`../security/README.md`](../security/README.md)'s criteria once the root
cause is confirmed; a project-ref mismatch is a config bug, but "confirm email
doesn't actually gate signup" would be a trust-boundary issue.

## Resolution

Not yet resolved — see Investigation.
