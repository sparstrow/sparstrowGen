-- 023_provider_model_cache.sql
--
-- T-CS3-02 (Band 26, CS chat session & conversation UX). One row per
-- (workspace_id, provider) caching the last live model-discovery result
-- (T-CS3-01's antigravity.discoverModels()), so the chat composer's model
-- picker (CS4) never blocks on a dispatch round trip.
--
-- Deliberately NOT added to 001_rls.sql's shared `workspace_scoped` loop:
-- that loop grants `for all` (every verb) to workspace members, which is
-- right for tables members write themselves (a session, a message) but
-- wrong here. Every write to this table goes through
-- `public.record_provider_models` (T-CS3-03, SECURITY DEFINER, which
-- bypasses RLS by design) -- a workspace member gets SELECT only, so a
-- client can't forge a fake "live" result straight past that function's
-- own validation. This follows daemon_identities' precedent
-- (019_daemon_realtime_identity.sql) of a bespoke policy for a table with
-- an asymmetric read/write shape, not the shared loop.

create table if not exists public.provider_model_cache (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  provider     text not null,
  models       jsonb not null default '[]'::jsonb,
  live         boolean not null default false,
  detail       text,
  checked_at   timestamptz not null default now(),
  primary key (workspace_id, provider)
);

alter table public.provider_model_cache enable row level security;

drop policy if exists provider_model_cache_member_select on public.provider_model_cache;
create policy provider_model_cache_member_select
  on public.provider_model_cache
  for select
  to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

-- No insert/update/delete policy for authenticated -- see the header. Only
-- record_provider_models (SECURITY DEFINER) writes here.
revoke insert, update, delete on public.provider_model_cache from authenticated;

-- ── Verify ──────────────────────────────────────────────────────────────────
--
--   select tablename, policyname, cmd from pg_policies
--   where tablename = 'provider_model_cache';
--   -- expect exactly one row: provider_model_cache_member_select, SELECT.
