-- 003_bootstrap_fix.sql
--
-- Fixes a chicken-and-egg deadlock in the M1 policies that made it impossible
-- for a new user to create their first workspace. Apply after 001_rls.sql.
--
-- M1's isolation test seeded its fixtures as the table owner, which bypasses
-- RLS, and then only asserted on cross-workspace READS. That left the very
-- first write a real user ever makes — bootstrapping their own workspace —
-- completely unexercised. Both defects below were found the first time that
-- path was actually run as `authenticated`.
--
-- Defect 1 — workspaces: INSERT ... RETURNING is refused.
--   `workspaces_member_read` allows SELECT only on workspaces you are already
--   a member of. Postgres evaluates SELECT policies against the RETURNING row,
--   so `insert ... returning id` fails with 42501 even though the INSERT
--   itself is permitted. The membership row does not exist yet — it cannot,
--   the workspace id is what RETURNING was supposed to hand back.
--   Plain `insert` with no RETURNING succeeds, which is what pins the cause.
--
-- Defect 2 — workspace_members: the first membership can never be inserted.
--   `workspace_members_member_all` checks
--       workspace_id in (select private.current_workspace_ids())
--   and current_workspace_ids() reads workspace_members. So inserting your
--   first membership requires already holding a membership. Unsatisfiable.
--
-- Both are fixed by treating `workspaces.owner_id` as an independent source of
-- authority, so ownership stands on its own rather than being derived from a
-- membership row that does not exist yet.

-- ── Helper: workspaces you own ─────────────────────────────────────────────
-- Reads workspaces, not workspace_members, which is what breaks the cycle.
-- SECURITY DEFINER so the function body is not itself subject to the SELECT
-- policy it exists to unblock. Same shape as the M1 helpers: zero-arg and
-- set-returning, so `x in (select ...)` stays a single InitPlan rather than a
-- per-row call, and `search_path = ''` keeps the body un-hijackable.

create or replace function private.current_owned_workspace_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
  from public.workspaces w
  where w.owner_id = (select auth.uid())::text;
$$;

revoke all on function private.current_owned_workspace_ids() from public, anon;
grant execute on function private.current_owned_workspace_ids() to authenticated;

-- ── workspaces: let an owner read their own workspace ──────────────────────
-- Membership stays the general rule; ownership is an additional, independent
-- grant. This is what makes INSERT ... RETURNING work, and it is also correct
-- on its own terms — an owner losing their membership row should not lose
-- sight of the workspace they own.

drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read on public.workspaces
  for select to authenticated
  using (
    id in (select private.current_workspace_ids())
    or owner_id = (select auth.uid())::text
  );

-- ── workspace_members: split ALL into per-command policies ─────────────────
-- The M1 policy was a single FOR ALL, which also meant any member could add or
-- remove any other member. Splitting it fixes the bootstrap deadlock and
-- tightens writes to admins/owners at the same time.

drop policy if exists workspace_members_member_all on public.workspace_members;

-- Read: your own workspaces, plus any you own.
drop policy if exists workspace_members_read on public.workspace_members;
create policy workspace_members_read on public.workspace_members
  for select to authenticated
  using (
    workspace_id in (select private.current_workspace_ids())
    or workspace_id in (select private.current_owned_workspace_ids())
  );

-- Insert: admins of an existing workspace, or the owner of the target
-- workspace. The owner branch is the bootstrap case — at that instant the
-- caller has no membership anywhere, but they do own the row they just wrote.
drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (
    workspace_id in (select private.current_admin_workspace_ids())
    or workspace_id in (select private.current_owned_workspace_ids())
  );

drop policy if exists workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (
    workspace_id in (select private.current_admin_workspace_ids())
    or workspace_id in (select private.current_owned_workspace_ids())
  )
  with check (
    workspace_id in (select private.current_admin_workspace_ids())
    or workspace_id in (select private.current_owned_workspace_ids())
  );

drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (
    workspace_id in (select private.current_admin_workspace_ids())
    or workspace_id in (select private.current_owned_workspace_ids())
  );

-- ── Index supporting the new helper ────────────────────────────────────────
-- current_owned_workspace_ids() filters workspaces on owner_id, and it now
-- runs inside the SELECT policy for that table, so it is on the hot path for
-- every workspace read. owner_id had no index.

create index if not exists idx_workspaces_owner on public.workspaces (owner_id);
