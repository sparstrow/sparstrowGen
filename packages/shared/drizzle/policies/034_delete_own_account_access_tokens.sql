-- 034_delete_own_account_access_tokens.sql
--
-- Repairs `delete_own_account()` after 0012 dropped `pairing_attempts`, and
-- closes the hole that dropping it exposed.
--
-- TWO separate defects, one urgent and one serious:
--
-- 1. **It was broken outright.** 032's version ends with
--    `delete from public.pairing_attempts ...`. Migration 0012 dropped that
--    table, so from the moment 0012 applied, ANY attempt to delete an account
--    raised `relation "public.pairing_attempts" does not exist` and rolled
--    back. Loud, and caught immediately -- but it made account deletion
--    impossible until this file runs.
--
-- 2. **It never swept the credential tables, and now that matters far more.**
--    `access_tokens` and `machines` are keyed on `user_id`, which has no
--    foreign key to `public.users` or `auth.users` -- the columns are `text`
--    and `uuid` in different schemas, exactly the mismatch
--    `BUG-2026-08-18-orphaned-account-rows-on-staging` records for the profile
--    and workspace rows. So deleting an account left its tokens behind.
--
--    Under the OLD workspace-scoped credential that was untidy: the token's
--    workspace was cascade-deleted with it, so the row was inert.
--    Under a PERSON-scoped credential it is a security hole. `access_tokens`
--    carries no workspace at all, and `authenticateMachine` checks only
--    `revoked_at` -- never whether the user still exists. A deleted account's
--    machines would have gone on authenticating indefinitely, against an
--    identity with no way left to revoke them: the tokens page resolves
--    through a session that no longer exists.
--
--    `machines` is swept for the same reason, and it cascades to `runtimes`.
--
-- Ordering matters: tokens and machines go BEFORE `public.users`, and
-- `auth.users` stays last, exactly as 032 documents.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_blocking int;
begin
  v_user_id := (select auth.uid())::text;
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sparstrow.bootstrap_workspace:' || v_user_id, 0)
  );

  select pg_catalog.count(*) into v_blocking
  from public.workspaces w
  where w.owner_id = v_user_id
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = w.id and m.user_id <> v_user_id
    );

  if v_blocking > 0 then
    raise exception
      'Cannot delete this account while it owns % workspace(s) shared with other members. Transfer ownership or remove the other members first.',
      v_blocking
      using errcode = '23503';
  end if;

  -- Workspaces where this user is the only member: the whole workspace goes,
  -- and every workspace-scoped table cascades from it (agents, runs, memory,
  -- skills, tasks -- all of them declare ON DELETE CASCADE).
  delete from public.workspaces w
  where w.id in (
    select m.workspace_id
    from public.workspace_members m
    where m.user_id = v_user_id
      and not exists (
        select 1 from public.workspace_members o
        where o.workspace_id = m.workspace_id and o.user_id <> v_user_id
      )
  );

  delete from public.workspaces w
  where w.owner_id = v_user_id
    and not exists (
      select 1 from public.workspace_members m where m.workspace_id = w.id
    );

  -- Anything still standing is a shared workspace this user merely belonged
  -- to. Detach them from it without disturbing the other members' data.
  delete from public.connect_attempts c where c.approved_by_user_id = v_user_id;
  delete from public.workspace_members m where m.user_id = v_user_id;

  -- The credentials. See this file's header: without these two statements a
  -- deleted account's machines keep authenticating forever, because nothing
  -- else references `user_id` and nothing checks that the user still exists.
  --
  -- Tokens first: `access_tokens.machine_id` is ON DELETE SET NULL, so
  -- deleting machines first would leave the token rows behind with a null
  -- machine rather than removing them.
  delete from public.access_tokens t where t.user_id = v_user_id;
  delete from public.machines mc where mc.user_id = v_user_id;

  update public.tasks set assignee_user_id = null where assignee_user_id = v_user_id;
  update public.tasks set user_id = null where user_id = v_user_id;
  update public.goals set user_id = null where user_id = v_user_id;
  update public.chat_sessions set user_id = null where user_id = v_user_id;
  update public.plan_nodes set user_id = null where user_id = v_user_id;
  update public.plan_edges set user_id = null where user_id = v_user_id;
  update public.task_questions set user_id = null where user_id = v_user_id;

  delete from public.users u where u.id = v_user_id;

  -- Last, because it is the row auth.uid() above resolves through. Cascades
  -- to sessions, identities, refresh tokens and MFA factors, so every device
  -- signed in as this user is logged out by the same statement.
  delete from auth.users a where a.id = v_user_id::uuid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Deletes the caller''s account: sole-member workspaces and everything cascading from them, '
  'their connect attempts, memberships, access tokens and machines, then their profile and auth row. '
  'Refuses while they own a workspace shared with other members.';
