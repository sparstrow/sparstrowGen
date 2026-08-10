-- 005_harden_legacy_functions.sql
--
-- Supabase security advisor findings on two functions that predate M1.
--
-- Both are trigger / event-trigger functions, so a PostgREST RPC call against
-- them would error rather than accomplish anything -- but a SECURITY DEFINER
-- function with a mutable search_path is a real hijack risk regardless of how
-- it is reached, and neither belongs in the exposed API surface at all.
--
-- Run `get_advisors(type: "security")` after applying; both lints clear.

-- auto_confirm_user: SECURITY DEFINER with no search_path pinned.
alter function public.auto_confirm_user() set search_path = '';

revoke all on function public.auto_confirm_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- NOTE (not fixed here -- dashboard setting, no SQL equivalent):
-- "Leaked Password Protection Disabled". Now that magic-link auth is gone and
-- password sign-in is the primary path, this matters more than it did. Enable
-- at Authentication -> Policies -> Password protection, which checks new
-- passwords against HaveIBeenPwned.
--
-- NOTE (staging-only behaviour worth revisiting before production):
-- auto_confirm_user() marks every new signup's email as confirmed. Combined
-- with the "Create One" signup path in the login UI, anyone who can reach the
-- app can create a usable account without controlling the email address. That
-- is fine for staging and must not ship to production.
