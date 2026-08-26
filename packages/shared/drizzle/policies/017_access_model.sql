-- 017_access_model.sql
-- M18 access model policies: machine_shared_locations and agent_machine_restrictions

alter table public.machine_shared_locations enable row level security;

drop policy if exists machine_shared_locations_member_read on public.machine_shared_locations;
create policy machine_shared_locations_member_read on public.machine_shared_locations
  for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

drop policy if exists machine_shared_locations_admin_insert on public.machine_shared_locations;
create policy machine_shared_locations_admin_insert on public.machine_shared_locations
  for insert to authenticated
  with check (workspace_id in (select private.current_admin_workspace_ids()));

drop policy if exists machine_shared_locations_admin_update on public.machine_shared_locations;
create policy machine_shared_locations_admin_update on public.machine_shared_locations
  for update to authenticated
  using (workspace_id in (select private.current_admin_workspace_ids()))
  with check (workspace_id in (select private.current_admin_workspace_ids()));

drop policy if exists machine_shared_locations_admin_delete on public.machine_shared_locations;
create policy machine_shared_locations_admin_delete on public.machine_shared_locations
  for delete to authenticated
  using (workspace_id in (select private.current_admin_workspace_ids()));


alter table public.agent_machine_restrictions enable row level security;

drop policy if exists agent_machine_restrictions_member_read on public.agent_machine_restrictions;
create policy agent_machine_restrictions_member_read on public.agent_machine_restrictions
  for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

drop policy if exists agent_machine_restrictions_admin_insert on public.agent_machine_restrictions;
create policy agent_machine_restrictions_admin_insert on public.agent_machine_restrictions
  for insert to authenticated
  with check (workspace_id in (select private.current_admin_workspace_ids()));

drop policy if exists agent_machine_restrictions_admin_update on public.agent_machine_restrictions;
create policy agent_machine_restrictions_admin_update on public.agent_machine_restrictions
  for update to authenticated
  using (workspace_id in (select private.current_admin_workspace_ids()))
  with check (workspace_id in (select private.current_admin_workspace_ids()));

drop policy if exists agent_machine_restrictions_admin_delete on public.agent_machine_restrictions;
create policy agent_machine_restrictions_admin_delete on public.agent_machine_restrictions
  for delete to authenticated
  using (workspace_id in (select private.current_admin_workspace_ids()));
