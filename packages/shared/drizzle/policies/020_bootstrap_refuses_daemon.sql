-- 020_bootstrap_refuses_daemon.sql
--
-- DI, T-DI-02. Plan decision DI-5. Apply AFTER 004 (which defines the function)
-- and 019 (which defines the table this checks).
--
-- ── The hole this closes ─────────────────────────────────────────────────────
--
-- 019 gives each paired machine a real Supabase Auth identity, so its access
-- token is a genuine `authenticated` JWT and can reach PostgREST like any
-- other. That is fine everywhere except here.
--
-- Everything else denies it for lack of a workspace_members row:
-- `private.current_workspace_ids()` is empty, so every table policy 001 wrote
-- matches nothing, and 010/015 refuse it on run transcripts and chat.
-- `public.bootstrap_workspace()` is the single exception — it is SECURITY
-- DEFINER and it exists *precisely* to serve a caller who has no membership
-- yet. Left alone, a leaked daemon token could call it and mint a junk
-- workspace, which `getActiveWorkspaceId` would then happily find.
--
-- One guard clause, in the same change that creates the identities rather than
-- filed as a follow-up: the two belong to one decision even though they are two
-- files.
--
-- ── Why a whole-function replace rather than an ALTER ─────────────────────────
--
-- Postgres has no way to patch a function body in place. This is 004's function
-- verbatim with the guard inserted after the authentication check and before
-- the advisory lock — refuse before taking a lock, not after. Diff it against
-- 004 before applying; if 004 has changed since this file was written, this
-- file is stale and re-copying it is the fix, not editing around it.

create or replace function public.bootstrap_workspace()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      text;
  v_email        text;
  v_name         text;
  v_workspace_id text;
  v_existing     text;
begin
  v_user_id := (select auth.uid())::text;
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- DI-5. A daemon identity is not a person and must never acquire a
  -- workspace. Deliberately raises rather than returning null: a silent no-op
  -- would surface to the caller as "bootstrap failed for an unknown reason",
  -- and the whole point of this branch is that it is a known reason.
  if exists (
    select 1 from public.daemon_identities di
    where di.user_id = v_user_id::uuid
  ) then
    raise exception 'daemon identities cannot bootstrap a workspace'
      using errcode = '42501';
  end if;

  -- Transaction-scoped, so it releases on commit or rollback with no unlock.
  -- NOTE: `coalesce` below is deliberately unqualified. It is a SQL construct,
  -- not a catalog function, so pg_catalog.coalesce(...) does not resolve -- and
  -- it is not name-resolved through search_path, so it cannot be hijacked.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sparstrow.bootstrap_workspace:' || v_user_id, 0)
  );

  -- Re-check under the lock. The loser of a race returns the winner's
  -- workspace instead of creating a duplicate.
  select m.workspace_id into v_existing
  from public.workspace_members m
  where m.user_id = v_user_id
  order by m.created_at asc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select u.email,
         coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           pg_catalog.split_part(u.email, '@', 1),
           'User'
         )
    into v_email, v_name
  from auth.users u
  where u.id = v_user_id::uuid;

  insert into public.users (id, email, name)
  values (v_user_id, v_email, v_name)
  on conflict (id) do nothing;

  -- Adopt a workspace this user owns but has no membership in -- one orphaned
  -- by a previously half-completed bootstrap -- rather than stacking another
  -- on top. Makes the path self-healing.
  select w.id into v_workspace_id
  from public.workspaces w
  where w.owner_id = v_user_id
    and not exists (
      select 1 from public.workspace_members m where m.workspace_id = w.id
    )
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null then
    v_workspace_id := pg_catalog.gen_random_uuid()::text;
    insert into public.workspaces (id, name, slug, owner_id)
    values (
      v_workspace_id,
      'Personal Workspace',
      'personal-' || pg_catalog."left"(v_workspace_id, 8),
      v_user_id
    );
  end if;

  insert into public.workspace_members (id, workspace_id, user_id, role)
  values (pg_catalog.gen_random_uuid()::text, v_workspace_id, v_user_id, 'owner');

  return v_workspace_id;
end;
$$;

-- Unchanged from 004, restated because `create or replace` does not reset
-- grants but a future reader should not have to check 004 to know what they are.
revoke all on function public.bootstrap_workspace() from public, anon;
grant execute on function public.bootstrap_workspace() to authenticated;

-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- Rerunnable. Applying twice is a no-op.
--
-- Both halves must be asserted — a guard that also breaks signup is worse than
-- the hole it closes:
--
--   * as a daemon identity (a user_id present in public.daemon_identities):
--       select public.bootstrap_workspace();
--     → raises 42501 'daemon identities cannot bootstrap a workspace'
--
--   * as a genuinely new human user with no membership:
--       select public.bootstrap_workspace();
--     → returns a workspace id, exactly as before this file
--
--   * as an existing human user who already has a membership:
--     → returns their existing workspace id, not a second one (004's race
--       behaviour, unchanged)
--
-- Run inside a transaction ending in ROLLBACK.
