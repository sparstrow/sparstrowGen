-- 011_drop_auto_confirm.sql
--
-- Removes the auto-confirm trigger on auth.users, closing the decision 005 left
-- open ("fine for staging and must not ship to production") and
-- doc/plans/2026-08-10-auth-completeness.md left to the owner. Owner decided
-- 2026-08-16: drop it now.
--
-- What it did: `auto_confirm_user()` ran BEFORE INSERT on auth.users and set
-- NEW.email_confirmed_at := coalesce(NEW.email_confirmed_at, now()). Every new
-- user was therefore born confirmed, so GoTrue skipped the confirmation email
-- and issued a session immediately -- anyone reaching the signup form could make
-- a working account for an address they did not control.
--
-- The part that cost real time, and the reason this file exists rather than a
-- dashboard click: the trigger silently overrode the "Confirm email" setting.
-- The dashboard and GoTrue's own /auth/v1/settings BOTH reported confirmation as
-- enforced (mailer_autoconfirm: false) while the database did the opposite.
-- Toggling the setting off and on changed nothing, because the setting was never
-- the thing deciding. Full account: doc/security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md
--
-- AFTER APPLYING, signup depends on email delivery, which has never been
-- observed working (KnownGaps G-11). Supabase's built-in mailer only delivers to
-- members of the project's Supabase org; both accounts in use qualify. If mail
-- does not arrive, signup is impossible rather than merely unverified -- recover
-- by confirming the user by hand in Authentication -> Users, and see
-- doc/runbooks/email-delivery.md for the custom-SMTP path that is required
-- before any non-org user, or any deployment.

-- Idempotent, like every file in this directory: re-running is how you check it.
-- Trigger first -- the function cannot be dropped while a trigger depends on it.
drop trigger if exists on_auth_user_created_auto_confirm on auth.users;
drop function if exists public.auto_confirm_user();

-- Fail loudly rather than reporting success on a no-op. `drop ... if exists`
-- cannot distinguish "removed it" from "it was never there", and this file's
-- whole purpose is that the object is gone -- a silent pass would be
-- indistinguishable from applying it against the wrong database.
do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and t.tgname = 'on_auth_user_created_auto_confirm'
  ) then
    raise exception
      'on_auth_user_created_auto_confirm still exists on auth.users -- the drop did not take. Check the connecting role owns the trigger.';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'auto_confirm_user'
  ) then
    raise exception
      'public.auto_confirm_user() still exists -- the drop did not take.';
  end if;
end
$$;
