# SEC-2026-08-16-auth-users-auto-confirm-trigger

**Status:** 🟡 investigating — owner has decided to remove it; fix not yet applied
**Severity:** medium today (contained: not deployed, owner-only access) — **critical the moment the app deploys**
**Reported by:** agent (found while investigating [`BUG-2026-08-16-signup-auto-confirms`](../bug/BUG-2026-08-16-signup-auto-confirms.md))
**Reported:** 2026-08-16

## What's exposed / what's possible

Email ownership is **never verified on sign-up**. A `BEFORE INSERT` trigger on
`auth.users` stamps `email_confirmed_at` on every new row before it is written:

```sql
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auto_confirm_user();
```

GoTrue sees an already-confirmed user, so it skips the confirmation email and
issues a session immediately. Anyone who can reach the sign-up form can register
**an address they do not control** and be signed straight in with a working
session and their own workspace.

## This was known and deliberate — what was *not* known

**This is not a rogue object.** It is a pre-M1 legacy function, deliberately
kept, and recorded in three tracked places:

- [`packages/shared/drizzle/policies/005_harden_legacy_functions.sql`](../../packages/shared/drizzle/policies/005_harden_legacy_functions.sql)
  — hardened it (`set search_path = ''`, revoked `public`/`anon`/`authenticated`
  grants) and noted: *"That is fine for staging and must not ship to production."*
- [`packages/shared/drizzle/policies/README.md`](../../packages/shared/drizzle/policies/README.md)
  — listed under "Still open".
- [`doc/plans/2026-08-10-auth-completeness.md`](../plans/2026-08-10-auth-completeness.md)
  — "Left for the owner: **Decide what happens to `auto_confirm_user()` before
  production.**" That decision was never made, so the trigger simply stayed.

**The genuine gap is different, and it is a documentation failure, not a code
one:** nothing anywhere recorded that this trigger makes the dashboard's
"Confirm email" toggle a **complete no-op**. That omission has a concrete cost:

- The 2026-08-10 investigation concluded "Confirm email is OFF" and
  [`runbooks/email-delivery.md`](../runbooks/email-delivery.md) told the owner to
  turn it on. **Turning it on could never have worked** — the trigger overrides
  it — but nothing said so.
- On 2026-08-16 the owner toggled it off and on, correctly, and observed no
  change. Both the dashboard *and* GoTrue's `/auth/v1/settings`
  (`mailer_autoconfirm: false`) report the control as enforced. Every reasonable
  check an operator can run says confirmation is on; the database overrides the
  behaviour silently.
- Hours were spent ruling out the wrong project, Auth Hooks, a mis-scoped
  `service_role` key, and stale accounts — none of which were ever the cause.

## Who can trigger it

Anyone who can reach the sign-up form. "Allow new users to sign up" is ON.
Today that is the owner's machine only: the web app is not deployed (see
[`../runbooks/README.md`](../runbooks/README.md), deploy row still pending).
**Exposure becomes public on deploy** — `https://staging.sparstrow.com` is
already configured as the Site URL.

## Evidence

Verified live against project `pnymngoqseltgigcfevq` on 2026-08-16 via read-only
queries over `pg_trigger` / `pg_proc` (`DATABASE_URL`, no writes):

- The trigger exists and is enabled (`tgenabled = 'O'`). It is the only
  non-internal trigger in the `auth` schema, and `auto_confirm_user` is the only
  function in the database whose body mentions `confirmed_at`.
- The reproduction row (`domains@sparstrow.com`, created `07:18:00.684Z`) shows
  `email_confirmed_at = 07:18:00.682Z` — 2.5ms *before* `created_at`, the
  signature of a `BEFORE INSERT` trigger — with `confirmation_sent_at` null and
  no confirmation token.
- The browser session cookie for that account decoded to a full `authenticated`
  session issued 42ms after row creation.
- `/auth/v1/settings` returned `mailer_autoconfirm: false` at the same moment.

**Not directly callable as an RPC.** It is a trigger function, so PostgREST will
not expose it and a direct call errors — and `005` additionally revoked
`public`/`anon`/`authenticated` execute grants. The exposure is the trigger's
effect, not the function's reachability.

## Impact

Worst case, once deployed: unverified account creation against arbitrary
addresses, and any logic that trusts `email_confirmed_at` (access grants,
invitations, notifications) is trusting a value that means nothing.

Secondary: it masked [`G-11`](../KnownGaps.md). Email delivery has still never
been observed working, and this trigger guaranteed sign-up would never exercise
the SMTP path — so the delivery gap could not surface through sign-up even in
principle.

## Resolution

Owner decided 2026-08-16: **drop it now** and rely on Supabase's built-in mailer,
which serves addresses that are members of the project's Supabase org (both
accounts in use qualify). This closes the open decision from the 2026-08-10 plan.

```sql
drop trigger if exists on_auth_user_created_auto_confirm on auth.users;
drop function if exists public.auto_confirm_user();
```

Delivered as tracked SQL under `packages/shared/drizzle/policies/`, applied with
`node scripts/apply-sql.mjs`, per that directory's README.

**Consequence to watch:** sign-up now depends on email delivery, which is
unproven (`G-11`). If the built-in mailer does not deliver, sign-up becomes
impossible rather than merely unverified — recoverable in seconds by confirming
the user by hand in the dashboard, or by re-applying the trigger. Custom SMTP
([`../runbooks/email-delivery.md`](../runbooks/email-delivery.md)) remains
required before any non-org user can sign up, and before deployment.

## Known Limitations & Boundaries

This report covers the `auth` schema only. Objects in `public` and other schemas
were not audited beyond searching for `confirmed_at` references. Note the
process lesson: the first pass of this investigation searched the *repo* for
triggers and concluded there were none, when the authoritative source is the
*live database* — and, separately, `005` did document this function but was not
read. Both halves of that mistake are worth avoiding next time: query the
database, and follow up every file a grep surfaces.
