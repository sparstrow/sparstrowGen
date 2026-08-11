-- 007_delete_own_account.sql
--
-- "Delete my account" as one atomic statement.
--
-- This has to live in the database for the reason 004 and 006 already
-- established: PostgREST cannot span statements, and deleting an account is
-- irreducibly several. Half-completing it is the worst possible outcome --
-- an auth user with no workspace can never sign in usefully again, and app
-- rows with no auth user are invisible to RLS and therefore unreachable by
-- anyone, forever.
--
-- The cleanup is explicit rather than FK-driven because public.users.id is a
-- plain `text` column with NO foreign key to auth.users. Deleting the auth row
-- on its own leaves public.users, workspaces.owner_id and workspace_members
-- pointing at a user that no longer exists.
--
-- Ownership of a SHARED workspace blocks the delete. There is no
-- transfer-ownership flow yet, so the alternatives were to cascade (destroying
-- co-members' data because one person left) or to orphan the workspace behind
-- an owner_id nobody holds. Refusing, with a message that says why, is the
-- only one of the three that is not a bug.

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

  -- Serialise against bootstrap_workspace (004), which takes the same lock.
  -- Without it, a delete racing an in-flight first request can re-create the
  -- membership row after we have removed it, leaving a workspace bound to a
  -- user id that is about to stop existing.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sparstrow.bootstrap_workspace:' || v_user_id, 0)
  );

  -- Workspaces this user owns that somebody else is also a member of.
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
  -- skills, tasks, pairing codes -- all of them declare ON DELETE CASCADE).
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

  -- Also sweep up workspaces owned by this user that have no members at all.
  -- 004 adopts these when it finds them; if we leave one behind pointing at a
  -- deleted owner, nothing will ever adopt it again.
  delete from public.workspaces w
  where w.owner_id = v_user_id
    and not exists (
      select 1 from public.workspace_members m where m.workspace_id = w.id
    );

  -- Anything still standing is a shared workspace this user merely belonged
  -- to. Detach them from it without disturbing the other members' data.
  delete from public.pairing_codes p where p.created_by_user_id = v_user_id;
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
