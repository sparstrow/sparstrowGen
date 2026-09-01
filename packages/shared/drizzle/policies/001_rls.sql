-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security — the security boundary for the cloud control plane.
--
-- Once dispatch is cloud-canonical, anyone who can write a task row targeting a
-- runtime can cause code to run on that machine. RLS is therefore not a
-- nice-to-have here: it is the thing standing between workspace isolation and
-- remote code execution on someone else's laptop.
--
-- Apply AFTER the drizzle migration. See ./README.md for order.
--
-- Daemons are NOT covered by these policies. They authenticate with a daemon
-- token, not a Supabase session, so auth.uid() is null and every policy denies
-- them. They reach the database exclusively through SECURITY DEFINER RPCs
-- (added in M3/M4) that verify the token hash themselves.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper schema ──────────────────────────────────────────────────────────
--
-- `private` rather than `public` on purpose: PostgREST only exposes `public`,
-- so a helper living here cannot be invoked as a REST RPC endpoint no matter
-- what EXECUTE grants it carries. Policies still need to resolve the name, so
-- `authenticated` gets USAGE on the schema.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

-- ── Membership helpers ─────────────────────────────────────────────────────
--
-- These take NO arguments and return a set. That shape is the whole point:
-- a policy written as `workspace_id in (select private.current_workspace_ids())`
-- is constant per query, so Postgres evaluates it ONCE as an InitPlan and then
-- does a cheap hashed membership test per row.
--
-- The obvious alternative — `is_workspace_member(workspace_id)` — takes the
-- row's own column as an argument, which makes it a per-row function call that
-- cannot be hoisted. On a large tasks or run_events table that is the
-- difference between one lookup and one lookup per row.
--
-- SECURITY DEFINER is also load-bearing for correctness, not just speed: these
-- read workspace_members, which itself has RLS enabled below. An INVOKER
-- function would re-enter that policy and recurse. `set search_path = ''`
-- forces fully-qualified names so the body cannot be hijacked by a shadowed
-- schema, and auth.uid() is wrapped in a scalar subquery so it is evaluated
-- once rather than per candidate row inside the helper.

create or replace function private.current_workspace_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid())::text;
$$;

create or replace function private.current_admin_workspace_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid())::text
    and m.role in ('owner', 'admin');
$$;

create or replace function private.current_co_member_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct them.user_id
  from public.workspace_members me
  join public.workspace_members them on them.workspace_id = me.workspace_id
  where me.user_id = (select auth.uid())::text;
$$;

-- ── Baseline hardening ─────────────────────────────────────────────────────
-- Nothing in the control plane is world-readable. RLS gates authenticated
-- users; anon gets no table grants at all.

revoke all on all tables in schema public from anon;

-- ── Workspace-scoped tables ────────────────────────────────────────────────
--
-- Every one of these carries a denormalized workspace_id precisely so the
-- policy is a flat membership test rather than a recursive join. Driven from an
-- explicit list: a loop cannot typo a table name the way 31 copy-pasted blocks
-- can, and a missing table raises instead of silently shipping without RLS.

do $$
declare
  t text;
  workspace_scoped text[] := array[
    'agent_instances', 'agent_skills', 'agents',
    'chat_messages', 'chat_sessions', 'cron_jobs',
    'goals', 'memory_contradictions', 'memory_notes', 'messages',
    'pipeline_runs', 'pipeline_steps', 'pipelines',
    'plan_edges', 'plan_nodes', 'project_directives', 'projects',
    'run_events', 'runs', 'runtime_projects', 'runtimes',
    'skill_files', 'skill_imports', 'skills',
    'task_questions', 'tasks',
    'team_members', 'team_projects', 'teams',
    'workspace_members', 'workspace_settings'
  ];
begin
  foreach t in array workspace_scoped loop
    if to_regclass('public.' || t) is null then
      raise exception 'RLS target table public.% does not exist', t;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (workspace_id in (select private.current_workspace_ids()))
         with check (workspace_id in (select private.current_workspace_ids()))',
      t || '_member_all', t
    );
  end loop;
end $$;

-- ── workspaces ─────────────────────────────────────────────────────────────
-- Scoped on `id` rather than `workspace_id`. Any authenticated user may create
-- one (becoming its owner); only admins may rename or delete it.

alter table public.workspaces enable row level security;

drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read on public.workspaces
  for select to authenticated
  using (id in (select private.current_workspace_ids()));

drop policy if exists workspaces_self_insert on public.workspaces;
create policy workspaces_self_insert on public.workspaces
  for insert to authenticated
  with check ((select auth.uid()) is not null and owner_id = (select auth.uid())::text);

drop policy if exists workspaces_admin_update on public.workspaces;
create policy workspaces_admin_update on public.workspaces
  for update to authenticated
  using (id in (select private.current_admin_workspace_ids()))
  with check (id in (select private.current_admin_workspace_ids()));

drop policy if exists workspaces_admin_delete on public.workspaces;
create policy workspaces_admin_delete on public.workspaces
  for delete to authenticated
  using (id in (select private.current_admin_workspace_ids()));

-- ── users ──────────────────────────────────────────────────────────────────
-- The one table with no workspace column. You can always see yourself, and you
-- can see people you share a workspace with — nobody else.

alter table public.users enable row level security;

drop policy if exists users_visible_read on public.users;
create policy users_visible_read on public.users
  for select to authenticated
  using (
    id = (select auth.uid())::text
    or id in (select private.current_co_member_ids())
  );

drop policy if exists users_self_insert on public.users;
create policy users_self_insert on public.users
  for insert to authenticated
  with check (id = (select auth.uid())::text);

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update to authenticated
  using (id = (select auth.uid())::text)
  with check (id = (select auth.uid())::text);

-- ── daemon_tokens ──────────────────────────────────────────────────────────
-- Credentials that let a machine claim work. Admin-only, and the hash column is
-- withheld: RLS filters rows, never columns, so a `select *` by an admin would
-- otherwise hand the hash to the browser.

alter table public.daemon_tokens enable row level security;

drop policy if exists daemon_tokens_admin_all on public.daemon_tokens;
create policy daemon_tokens_admin_all on public.daemon_tokens
  for all to authenticated
  using (workspace_id in (select private.current_admin_workspace_ids()))
  with check (workspace_id in (select private.current_admin_workspace_ids()));

-- Column privileges do not override table privileges: while `authenticated`
-- holds table-level SELECT, a column-level REVOKE on token_hash is silently
-- ineffective. The table grant has to go first, then the safe columns back.
revoke select on public.daemon_tokens from authenticated;
grant select (
  id, workspace_id, runtime_id, label, last_used_at, revoked_at, created_at
) on public.daemon_tokens to authenticated;

-- ── pairing_codes ──────────────────────────────────────────────────────────
-- REMOVED 2026-08-31: the table itself is dropped (migration 0009), replaced
-- by pairing_attempts -- see policies/031_pairing_attempts.sql for its RLS.
-- This block is deleted rather than left dead, because this file is
-- documented as "safe to re-run" (see ./README.md); a policy statement
-- against a table that no longer exists would break that guarantee the next
-- time anyone replays it, on any environment, fresh or existing.

-- ── runtime_commands ───────────────────────────────────────────────────────
-- The dispatch queue. Members may read status and enqueue work; the claim/ack
-- lifecycle belongs to the daemon and happens inside SECURITY DEFINER RPCs, so
-- no general UPDATE is granted to users beyond admin intervention.

alter table public.runtime_commands enable row level security;

drop policy if exists runtime_commands_member_read on public.runtime_commands;
create policy runtime_commands_member_read on public.runtime_commands
  for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

drop policy if exists runtime_commands_member_insert on public.runtime_commands;
create policy runtime_commands_member_insert on public.runtime_commands
  for insert to authenticated
  with check (workspace_id in (select private.current_workspace_ids()));

drop policy if exists runtime_commands_admin_update on public.runtime_commands;
create policy runtime_commands_admin_update on public.runtime_commands
  for update to authenticated
  using (workspace_id in (select private.current_admin_workspace_ids()))
  with check (workspace_id in (select private.current_admin_workspace_ids()));
