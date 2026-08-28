-- 024_provider_model_dispatch.sql
--
-- T-CS3-03 (Band 26, CS chat session & conversation UX). Completes the
-- providers.discover_models dispatch loop T-CS3-01 (the provider capability)
-- and T-CS3-02 (the cache table) set up for: a browser server action calls
-- request_model_discovery to ask an online, capable runtime to check;
-- record_provider_models is what actually lands the result, but — unlike
-- enqueue_chat_turn's family of functions — it is NEVER called via
-- PostgREST/supabase-js RPC. It is called from
-- apps/web/src/app/api/daemon/providers/discover-models/route.ts, the same
-- /api/daemon/* pattern every other daemon-to-cloud write already uses
-- (see apps/web/src/lib/daemon/auth.ts's header): a daemon has no
-- auth.uid() at all under this token scheme, so `current_workspace_ids()`
-- would find nothing for it. The route authenticates the daemon's bearer
-- token itself and passes workspace_id explicitly, already validated --
-- record_provider_models trusts its caller the same way
-- ingest_chat_turn_reply already does, not by re-deriving the workspace
-- inside Postgres.

create or replace function public.request_model_discovery(p_workspace_id text, p_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_id text;
begin
  -- Defense in depth, same shape enqueue_chat_turn already uses for its own
  -- session row: p_workspace_id came from the caller's own ctx.workspaceId
  -- (already scoped to a workspace they belong to), but this is cheap and
  -- the whole point of not trusting a bare argument.
  if p_workspace_id not in (select private.current_workspace_ids()) then
    raise exception 'Not a member of that workspace.';
  end if;

  v_runtime_id := private.pick_runtime_for(p_workspace_id, p_provider, null);
  if v_runtime_id is null then
    -- No online, capable runtime right now. CS4 reads whatever is already
    -- cached (possibly nothing/stale) and says so -- no error surface
    -- needed here, matching chat.turn's own "waiting" framing rather than
    -- failing outright.
    return;
  end if;

  insert into public.runtime_commands (
    id, workspace_id, runtime_id, kind, payload, status, idempotency_key
  )
  values (
    'cmd_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16),
    p_workspace_id, v_runtime_id, 'providers.discover_models',
    pg_catalog.jsonb_build_object('provider', p_provider),
    'pending',
    -- Deliberately includes a timestamp, unlike chat.turn's stable
    -- per-turn key: repeated discovery requests are expected (the picker
    -- may trigger one every time it opens on a stale cache) and each
    -- should dispatch fresh, not `on conflict do nothing` against a
    -- request from minutes ago.
    'providers.discover_models:' || p_workspace_id || ':' || p_provider || ':' || pg_catalog.now()::text
  );
end;
$$;

comment on function public.request_model_discovery(text, text) is
  'US3: asks an online, capable runtime to check its live model list. No-op (not an error) when none is available -- CS4 reads the existing cache and says so.';

-- Same lockdown shape 014_chat_turn_dispatch.sql already uses for
-- enqueue_chat_turn/retry_chat_turn: revoke the PUBLIC-default grant (which
-- anon inherits) entirely, then grant back only to authenticated. Without
-- this, `get_advisors` flags it live as callable by `anon` -- confirmed,
-- not assumed: an earlier version of this migration had no such grant at
-- all and the advisor caught it immediately after applying.
revoke all on function public.request_model_discovery(text, text) from public, anon;
grant execute on function public.request_model_discovery(text, text) to authenticated;

create or replace function public.record_provider_models(
  p_workspace_id text, p_provider text, p_models jsonb, p_live boolean, p_detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.provider_model_cache (workspace_id, provider, models, live, detail, checked_at)
  values (p_workspace_id, p_provider, p_models, p_live, p_detail, pg_catalog.now())
  on conflict (workspace_id, provider) do update
    set models = excluded.models, live = excluded.live, detail = excluded.detail, checked_at = excluded.checked_at;
end;
$$;

comment on function public.record_provider_models(text, text, jsonb, boolean, text) is
  'US3: lands a providers.discover_models result. Callable ONLY from apps/web''s /api/daemon/providers/discover-models route (service role, daemon bearer-token auth already validated there) -- never via direct PostgREST RPC, which is why this trusts p_workspace_id as given rather than re-deriving it. Not reachable via PostgREST as a normal RPC target for the authenticated role (see the REVOKE in 023).';

-- ── Lock down execution — from PUBLIC, not just anon/authenticated ──────────
--
-- Postgres grants EXECUTE to PUBLIC by default on every new function, and
-- `authenticated`/`anon` INHERIT from PUBLIC. Revoking only from
-- `anon, authenticated` (what an earlier draft of this migration did)
-- looks correct and does NOTHING: `has_function_privilege('authenticated',
-- ..., 'execute')` still returned true afterward, confirmed live against
-- this exact function before this line was added. `record_provider_models`
-- has NO internal check that the caller is a real daemon acting for the
-- workspace it names — it trusts p_workspace_id entirely, on the
-- assumption that only the /api/daemon route (service role, having already
-- validated the bearer token) can call it. Without this REVOKE, any
-- signed-in user could call it directly via PostgREST RPC and overwrite
-- ANY workspace's cache with a forged result, not even limited to their
-- own.
revoke execute on function public.record_provider_models(text, text, jsonb, boolean, text) from public;

-- ── Verify ──────────────────────────────────────────────────────────────────
--
--   select request_model_discovery('<a real workspace id>', 'antigravity');
--   select * from runtime_commands where kind = 'providers.discover_models'
--     order by created_at desc limit 1;
--   -- expect a pending row IF an online antigravity-capable runtime exists,
--   -- otherwise no row and no error.
