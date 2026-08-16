# BUG-2026-08-16-signup-auto-confirms

**Status:** 🟡 investigating
**Reported by:** owner
**Reported:** 2026-08-16

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

Current leading theory, not yet confirmed: **the app may be pointed at a
different Supabase project than the one being edited in the dashboard.**
`apps/web/.env.local` resolves to project ref `pnymngoqseltgigcfevq`
(`https://pnymngoqseltgigcfevq.supabase.co`). The dashboard screenshot showed
org `sparstrowgen` → project `sparstrowgen-staging` → branch `main
PRODUCTION`. Waiting on the owner to confirm whether that project's **Project
Settings → General → Reference ID** actually reads `pnymngoqseltgigcfevq`.

Relevant code path: `apps/web/src/app/login/page.tsx` — the auto-login is
driven entirely by whether Supabase's `signUp()` response includes
`data.session`; see the comment at the call site.

## Impact

If real: anyone can create an account with an email they don't control and be
signed in immediately, with no proof of ownership — regardless of the
project's "Confirm email" setting. Worth re-checking against
[`../security/README.md`](../security/README.md)'s criteria once the root
cause is confirmed; a project-ref mismatch is a config bug, but "confirm email
doesn't actually gate signup" would be a trust-boundary issue.

## Resolution

Not yet resolved — see Investigation.
