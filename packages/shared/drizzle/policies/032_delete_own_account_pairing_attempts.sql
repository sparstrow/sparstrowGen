-- 032_delete_own_account_pairing_attempts.sql
--
-- 007's delete_own_account() explicitly swept pairing_codes rows the
-- deleting user had created, for a shared workspace they merely belonged to
-- (sole-owned workspaces already cascade via workspace_id ON DELETE CASCADE
-- -- see 007's own comment). pairing_attempts has no equivalent "created by"
-- column -- rows are created by the daemon (service role, anonymous) and
-- only ever gain a user reference on approval, via approved_by_user_id. The
-- analogous leftover case is an attempt this user approved in a shared
-- workspace, not yet consumed by the time they delete their account.
--
-- A still-pending, never-approved attempt needs no line here: it carries no
-- user reference at all and simply expires on its own TTL, same as an
-- unconsumed pairing code did.
--
-- Postgres cannot patch a function body in place (020's note, still true) --
-- this is 007's body verbatim, plus the one added line, in a fresh
-- create-or-replace. Diff against 007 before applying if 007 has changed
-- since; re-copy rather than editing around it.

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
  -- skills, tasks, pairing attempts -- all of them declare ON DELETE CASCADE).
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
  delete from public.pairing_attempts p where p.approved_by_user_id = v_user_id;
  delete from public.workspace_members m where m.user_id = v_user_id;

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
  'Deletes the calling user: sole-member workspaces (cascading), memberships, public.users and auth.users, in one transaction. Raises 23503 if the caller owns a workspace shared with others. SECURITY DEFINER is required to reach auth.users; it takes no arguments and always acts on auth.uid(), so a caller cannot aim it at anyone else.';
