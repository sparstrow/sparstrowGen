-- 028_restore_no_invented_names_after_020_regression.sql
--
-- Found 2026-08-29 while replaying the full policy history onto a fresh
-- production project (doc/plans/2026-08-29-two-channel-desktop-release.md,
-- Band C). Full account: doc/bug/BUG-2026-08-29-bootstrap-workspace-020-reverted-012.md.
--
-- 020_bootstrap_refuses_daemon.sql's own header says it is "004's function
-- verbatim with the guard inserted" and warns: "if 004 has changed since this
-- file was written, this file is stale and re-copying it is the fix." It had
-- changed -- 012_no_invented_names.sql rewrote it nine days earlier -- and
-- nobody re-copied it. Applying 020 after 012 silently reverted 012's fix:
-- new signups went back to getting an invented name (email local-part or
-- 'User') and an invented workspace name ('Personal Workspace'), which is
-- indistinguishable from a name the person actually typed and breaks the M10
-- setup-guide completeness check (FR-019).
--
-- Confirmed live on staging before applying this file: `pg_proc.prosrc` for
-- `public.bootstrap_workspace()` still had `'Personal Workspace'` and the
-- split_part/'User' fallback, meaning every workspace bootstrapped since 020
-- landed (2026-08-28) carries an invented name indistinguishable from a real
-- one.
--
-- This is 020's body (the daemon-identity guard, applied first — DI-5 must
-- still hold) with 012's fix layered back on top. Not a revert of 020: the
-- guard clause stays. Diff against 020, not 004 or 012 alone, if this ever
-- needs to change again.

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

  if exists (
    select 1 from public.daemon_identities di
    where di.user_id = v_user_id::uuid
  ) then
    raise exception 'daemon identities cannot bootstrap a workspace'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sparstrow.bootstrap_workspace:' || v_user_id, 0)
  );

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
           ''
         )
    into v_email, v_name
  from auth.users u
  where u.id = v_user_id::uuid;

  insert into public.users (id, email, name)
  values (v_user_id, v_email, v_name)
  on conflict (id) do nothing;

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

revoke all on function public.bootstrap_workspace() from public, anon;
grant execute on function public.bootstrap_workspace() to authenticated;

-- ── Clear names invented since 020's regression ─────────────────────────────
-- Same narrow shape as 012's own cleanup: only a name that is EXACTLY the
-- email local part with no provider-supplied name, only the literal bootstrap
-- workspace name with a still-bootstrap-generated slug. A person genuinely
-- named that way, or one who typed "Personal Workspace" themselves (and so
-- also set a real slug), keeps it.

update public.users u
   set name = ''
  from auth.users a
 where a.id::text = u.id
   and u.name = pg_catalog.split_part(u.email, '@', 1)
   and coalesce(a.raw_user_meta_data ->> 'full_name', '') = ''
   and coalesce(a.raw_user_meta_data ->> 'name', '') = '';

update public.workspaces
   set name = ''
 where name = 'Personal Workspace'
   and slug ~ '^personal-[0-9a-f]{8}$';

-- ── Verify ──────────────────────────────────────────────────────────────────
--
--   select prosrc from pg_proc where proname = 'bootstrap_workspace' and pronamespace = 'public'::regnamespace;
--   -- expect '' name/workspace-name defaults, NOT 'Personal Workspace' or split_part/'User'
--
--   -- as a genuinely new human user with no membership:
--   select public.bootstrap_workspace();
--   -- returns a workspace id; the row's name and the user's name are both ''
--
--   -- as a daemon identity: still raises 42501 (DI-5 unchanged)
