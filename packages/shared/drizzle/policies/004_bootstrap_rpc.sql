-- 004_bootstrap_rpc.sql
--
-- Atomic, race-safe workspace bootstrap. Apply after 003_bootstrap_fix.sql.
--
-- 003 made the first workspace *possible* to create. This makes it correct to
-- create. The client-side version issued three separate PostgREST inserts
-- (users, workspaces, workspace_members) with no transaction, because
-- PostgREST cannot span statements. Two failure modes, both observed on
-- staging:
--
--   1. Partial failure orphans a workspace: the workspaces row commits, the
--      membership insert fails, and the next attempt creates a SECOND
--      workspace rather than reusing the first. This is exactly what happened
--      when 003 had not yet been applied.
--   2. Two concurrent first-requests both observe zero memberships and both
--      bootstrap. The user ends up a member of two workspaces, and
--      getActiveWorkspaceId then returns 400 "Multiple workspaces found" on
--      every subsequent request -- permanently, with no picker UI to recover
--      through (deferred, D-7). A double-click on Sign In is enough.
--
-- One function means one transaction. The advisory lock serializes concurrent
-- callers for the same user, and the membership re-check *inside* the lock is
-- what actually closes the race: without it both callers pass the initial
-- check before either has inserted.

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

-- Callable only by signed-in users, and it can only ever act on auth.uid(),
-- so a caller cannot bootstrap on anyone else's behalf. Unlike the private.*
-- helpers this one is deliberately in `public`: it is meant to be reached as
-- an RPC endpoint.
revoke all on function public.bootstrap_workspace() from public, anon;
grant execute on function public.bootstrap_workspace() to authenticated;
