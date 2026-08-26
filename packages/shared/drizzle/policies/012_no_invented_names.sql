-- 012_no_invented_names.sql
--
-- Stop the database from inventing a person's name and a workspace's name, and
-- clear -- once, narrowly -- the ones it already invented.
--
-- FR-019 / spec decision 6 of doc/specs/2026-08-16-setup-and-machines.md.
--
-- Two expressions in 004_bootstrap_rpc.sql were filling in fields nobody
-- supplied:
--
--   coalesce(..., split_part(u.email, '@', 1), 'User')   -> users.name
--   'Personal Workspace'                                 -> workspaces.name
--
-- Both look harmless and both are load-bearing in the wrong direction. The
-- setup guide (M10) decides whether a step is done by asking "is this name
-- empty?", which is only an honest question if nothing else is answering it
-- first. A name derived from an email address is indistinguishable, after the
-- fact, from a name someone typed -- so the guide would report the profile step
-- complete for an account whose owner has never seen the field.
--
-- The fix is to write '' and let the emptiness mean what it says. Both columns
-- are `text not null` with no default, so '' is the only available "unset"
-- (plan decision 6 chose this over making them nullable, so no consumer's type
-- changes).
--
-- WHAT IS DELIBERATELY KEPT:
--
--   * A provider-supplied name. GitHub and Google ask the person for their name,
--     so raw_user_meta_data->>'full_name' WAS supplied -- just not by us.
--     Someone signing in that way arrives with their profile step legitimately
--     done. (Both providers are parked as D-8, so this is future-proofing.)
--   * The generated slug. It is `not null unique` and is a machine identifier,
--     not a name; a workspace must have one from the moment it exists. It
--     becomes a name-derived slug on the first real naming and freezes there
--     (plan decision 8).
--
-- Apply after 011_drop_auto_confirm.sql, and after drizzle migration
-- 0003_setup_identity_fields.sql (which adds users.bio, workspaces.context and
-- workspaces.logo_url -- unrelated to the function, but the same task).
--
-- Rerunnable: `create or replace` for the function, and both UPDATEs are
-- self-limiting (after the first run nothing matches). Rerunning changes
-- nothing further -- but note it does NOT restore what it cleared.

-- ── 1. The function, with the two inventions removed ────────────────────────
--
-- Copied verbatim from 004_bootstrap_rpc.sql. Only the `coalesce` tail and the
-- workspaces `values` list differ; everything else -- security definer, the
-- pinned empty search_path, the advisory lock, the re-check under it, the
-- orphan adoption -- is unchanged and load-bearing. Read 004's header for why
-- each of those is there.

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

  -- CHANGED (012): whatever the PROVIDER actually gave us, and nothing else.
  -- The removed tail was `split_part(u.email, '@', 1), 'User'`.
  select u.email,
         coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           ''
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
    -- CHANGED (012): '' instead of 'Personal Workspace'. The slug is unchanged --
    -- see the header for why it keeps its generated value.
    insert into public.workspaces (id, name, slug, owner_id)
    values (
      v_workspace_id,
      '',
      'personal-' || pg_catalog."left"(v_workspace_id, 8),
      v_user_id
    );
  end if;

  insert into public.workspace_members (id, workspace_id, user_id, role)
  values (pg_catalog.gen_random_uuid()::text, v_workspace_id, v_user_id, 'owner');

  return v_workspace_id;
end;
$$;

-- Grants are re-asserted rather than assumed: `create or replace` preserves the
-- existing ACL, but a function that silently lost its grant 500s every endpoint
-- for every new account, and re-stating two lines is cheaper than finding that
-- out from a user. Same reasoning as 004's own trailing grants.
revoke all on function public.bootstrap_workspace() from public, anon;
grant execute on function public.bootstrap_workspace() to authenticated;

-- ── 2. Clear the names bootstrap already invented ───────────────────────────
--
-- A DATA MUTATION ON REAL ROWS. It is not undone by re-running this file.
-- Deliberately narrow: it clears what bootstrap wrote, not what anyone chose.

-- Only a name that is EXACTLY the email local part, and only where no provider
-- ever supplied one. A person genuinely called by that string, or one whose
-- GitHub name happens to match it, keeps it.
--
-- The `a.id::text = u.id` cast is required, not cosmetic: auth.users.id is uuid
-- and public.users.id is text. Without it the update matches nothing and
-- appears to succeed.
update public.users u
   set name = ''
  from auth.users a
 where a.id::text = u.id
   and u.name = pg_catalog.split_part(u.email, '@', 1)
   and coalesce(a.raw_user_meta_data ->> 'full_name', '') = ''
   and coalesce(a.raw_user_meta_data ->> 'name', '') = '';

-- Only the literal bootstrap name, AND only where the slug is still the
-- bootstrap-generated one -- i.e. the workspace has demonstrably never been
-- named. Both conditions matter: someone who *typed* "Personal Workspace" set a
-- real slug at the same time, and keeps both.
update public.workspaces
   set name = ''
 where name = 'Personal Workspace'
   and slug ~ '^personal-[0-9a-f]{8}$';
