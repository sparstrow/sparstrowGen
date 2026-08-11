-- 008_redeem_pairing_code.sql
--
-- Turn a pairing code into a runtime + a daemon token, atomically, exactly once.
--
-- Redemption is four statements that must all happen or none: check the code,
-- create the runtime, create its token, mark the code consumed. Split across
-- PostgREST round trips -- which cannot span statements -- it fails two ways:
--
--   1. Two daemons redeeming the same code concurrently both read it as
--      unconsumed and both get a working token. A single-use credential that
--      worked twice, and the second machine is silently paired to a workspace
--      nobody meant to give it.
--   2. A failure between the runtime insert and the token insert leaves a
--      runtime that exists and can never authenticate -- a machine listed in
--      the UI that is permanently unreachable, with no way to retry into it
--      because the code is gone.
--
-- Same root cause as 004 and 006, and both of those were found as live defects
-- rather than predicted. Multi-statement invariants live in the database.
--
-- SECURITY DEFINER because a daemon has no auth.uid(): every RLS policy on
-- runtimes/daemon_tokens/pairing_codes resolves the caller through
-- workspace_members, and a daemon is not a member. The pairing code IS the
-- credential here, which is why this is service-role only (see the grants at
-- the bottom) -- an anon-callable redemption endpoint is brute-forceable
-- straight against PostgREST, bypassing whatever rate limit the app applies.
--
-- The workspace is taken from the code's own row and is NOT a parameter. A
-- caller cannot aim a valid code at a different workspace.

-- Two deviations from the task spec (T-M3-01), both decided while writing it:
--
-- * `select ... for update` rather than pg_advisory_xact_lock. 004 uses an
--   advisory lock because it serialises on a user id where the contended thing
--   is the ABSENCE of rows -- there is nothing to lock. Here the contended
--   thing is one existing row with a primary key, and a row lock is the precise
--   tool: no hash, no collision surface. The loser blocks, then re-reads the
--   committed row and sees consumed_at set.
--
-- * `returns jsonb` rather than `returns table (runtime_id, workspace_id)`.
--   OUT parameters named after columns shadow those columns inside the body,
--   so `returns table (runtime_id ...)` makes every unqualified reference to
--   daemon_tokens.runtime_id an ambiguity error. jsonb also gives PostgREST a
--   single object instead of a one-element array, which is what this is.

create or replace function public.redeem_pairing_code(
  p_code         text,
  p_runtime_id   text,
  p_token_hash   text,
  p_name         text,
  p_hostname     text,
  p_os           text,
  p_is_electron  boolean,
  p_capabilities jsonb,
  p_core_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.pairing_codes%rowtype;
begin
  if p_code is null or p_token_hash is null or p_runtime_id is null then
    raise exception 'code, runtime id and token hash are all required'
      using errcode = 'SPG01';
  end if;

  -- Row lock, not a filtered lookup. Selecting `where consumed_at is null`
  -- would make the loser of a race see zero rows and report "unknown code",
  -- which sends someone hunting for a typo in a code that was simply already
  -- used. Take the row, then judge its state.
  select * into v_code
  from public.pairing_codes p
  where p.code = p_code
  for update;

  if not found then
    raise exception 'That pairing code is not valid.' using errcode = 'SPG01';
  end if;

  if v_code.consumed_at is not null then
    raise exception 'That pairing code has already been used.' using errcode = 'SPG02';
  end if;

  -- now() is the database clock. Never a caller-supplied timestamp: a daemon
  -- with a skewed clock -- ordinary on a laptop resuming from sleep -- would
  -- otherwise decide for itself whether its code had expired.
  if v_code.expires_at <= pg_catalog.now() then
    raise exception 'That pairing code has expired.' using errcode = 'SPG03';
  end if;

  insert into public.runtimes (
    id, workspace_id, name, os, hostname, is_electron,
    capabilities, status, core_version, last_heartbeat
  )
  values (
    p_runtime_id,
    v_code.workspace_id,
    -- Unqualified coalesce/nullif are SQL constructs, not catalog functions --
    -- pg_catalog.coalesce(...) does not resolve, and they are not name-resolved
    -- through search_path, so they cannot be hijacked. Same note as 004.
    coalesce(nullif(p_name, ''), nullif(p_hostname, ''), 'Unnamed machine'),
    coalesce(nullif(p_os, ''), 'unknown'),
    coalesce(nullif(p_hostname, ''), 'unknown'),
    coalesce(p_is_electron, false),
    coalesce(p_capabilities, '[]'::jsonb),
    'online',
    nullif(p_core_version, ''),
    pg_catalog.now()
  );

  insert into public.daemon_tokens (id, workspace_id, runtime_id, token_hash, label)
  values (
    pg_catalog.gen_random_uuid()::text,
    v_code.workspace_id,
    p_runtime_id,
    p_token_hash,
    coalesce(nullif(p_hostname, ''), 'daemon')
  );

  update public.pairing_codes
  set consumed_at = pg_catalog.now(),
      consumed_by_runtime_id = p_runtime_id
  where code = p_code;

  return pg_catalog.jsonb_build_object(
    'runtimeId', p_runtime_id,
    'workspaceId', v_code.workspace_id
  );
end;
$$;

-- Service-role only. `authenticated` must NOT hold this: a signed-in user
-- reaching it directly could mint a daemon token for their workspace without
-- going through the app, and `anon` holding it would make the redemption
-- endpoint brute-forceable at PostgREST's rate rather than the app's.
revoke all on function public.redeem_pairing_code(
  text, text, text, text, text, text, boolean, jsonb, text
) from public, anon, authenticated;

comment on function public.redeem_pairing_code(
  text, text, text, text, text, text, boolean, jsonb, text
) is
  'Redeems a pairing code exactly once: creates the runtime and its daemon token and marks the code consumed, in one transaction, serialised by a row lock on the code. Workspace is taken from the code row, never from a parameter. Raises SPG01 (invalid), SPG02 (already used) or SPG03 (expired). Service-role only -- the pairing code is a bearer credential and this must not be reachable from anon or authenticated.';
