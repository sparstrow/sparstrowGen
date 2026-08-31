-- 031_pairing_attempts.sql
--
-- Browser-loopback pairing: replaces 008's pairing-code redemption with a
-- three-step attempt lifecycle (pending -> approved -> consumed), so a
-- machine and workspace get linked by one click on an already-signed-in
-- browser tab instead of a human reading a code off one screen and typing it
-- into another. doc/specs/2026-08-31-browser-loopback-pairing.md and
-- doc/plans/2026-08-31-browser-loopback-pairing.md have the full design.
--
-- Same "PostgREST cannot span statements" reasoning as 004/006/007/008: the
-- exchange step is check-status, upsert runtime, revoke old token, insert new
-- token, mark consumed -- five statements that must happen together or not at
-- all, or a failure partway leaves a runtime with no working credential (the
-- same failure mode 008's header names for its own two-insert sequence).
--
-- What is genuinely new here, not just carried over from 008: minting the
-- real daemon token is split into its OWN step (exchange), separate from the
-- authenticated approval that only ever marks a row `approved`. A person's
-- browser session decides which workspace a machine joins; the machine's own
-- process is the only thing that ever mints or receives the real credential,
-- and only once it has proof (this exchange call succeeding) that the
-- browser's redirect actually reached it. See the plan's Decisions section
-- ("Two-phase approve-then-exchange, not mint-then-redirect") for the
-- ghost-machine race this closes.

-- ── RLS: the two authenticated-member transitions ───────────────────────────
--
-- pending -> approved is the ONLY transition a signed-in member may ever
-- perform directly, via plain PostgREST UPDATE (no RPC needed -- same
-- reasoning as 004's README note that member-scoped writes are ordinary
-- table access under RLS, not a security-definer function). approved ->
-- consumed happens exclusively inside exchange_pairing_attempt below, which
-- authenticated/anon can never call.
--
-- Reading a row requires already knowing its id: `id` is a 32-byte CSPRNG
-- token embedded in the confirm URL the daemon's own process constructs, not
-- something a client discovers by listing -- exactly the same "the secret IS
-- the credential" shape 008's own pairing code had, just machine-generated
-- and never displayed instead of human-typed. The USING clause below adds
-- only "still live" (pending, unexpired) on top of that: it does not scope by
-- workspace, because at read/approve time no workspace has been chosen yet --
-- that is what this policy's WITH CHECK decides.

alter table public.pairing_attempts enable row level security;

drop policy if exists pairing_attempts_pending_read on public.pairing_attempts;
create policy pairing_attempts_pending_read on public.pairing_attempts
  for select to authenticated
  using (status = 'pending' and expires_at > pg_catalog.now());

drop policy if exists pairing_attempts_approve on public.pairing_attempts;
create policy pairing_attempts_approve on public.pairing_attempts
  for update to authenticated
  using (status = 'pending' and expires_at > pg_catalog.now())
  with check (
    status = 'approved'
    and workspace_id in (select private.current_workspace_ids())
    and approved_by_user_id = (select auth.uid())::text
  );

-- No insert or delete policy for anon/authenticated, deliberately. Rows are
-- created only by the service role (POST /api/daemon/pair/attempts, called by
-- the daemon before it ever opens a browser) -- an authenticated user able to
-- insert their own "approved" row would skip the daemon holding the id
-- entirely, minting a runtime the daemon never asked for. Nothing deletes an
-- expired/consumed row today; it just stops matching either policy above and
-- becomes unreachable. A sweep job is future work if the table's row count
-- ever matters, not a correctness requirement -- same posture 008 shipped
-- with for pairing_codes.

-- ── exchange_pairing_attempt: the only place the real token is minted ──────
--
-- SECURITY DEFINER for the same reason redeem_pairing_code (008) was: the
-- caller here is the daemon's own local HTTP listener making a
-- server-to-server call with no Supabase session at all, so auth.uid() is
-- null and every ordinary policy denies it. The attempt id IS the credential
-- -- reachable from service_role only, exactly 008's posture, for exactly
-- 008's reason: reachable from anon it would be brute-forceable at
-- PostgREST's rate rather than the app's, and authenticated holding it would
-- let any signed-in user mint a token for an attempt they merely guessed the
-- id of rather than one their own daemon process created.
--
-- `select ... for update` rather than an advisory lock, matching 008: the
-- contended thing is one existing row with a primary key, not an absence of
-- rows. Fetched without filtering on status, for the same reason 008 fetches
-- the code row unfiltered on consumed_at -- filtering would make the loser of
-- a race see zero rows and report "unknown attempt" for a request that was
-- actually just late, instead of the specific "already consumed" it should
-- report.

create or replace function public.exchange_pairing_attempt(
  p_attempt_id   text,
  p_token_hash   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.pairing_attempts%rowtype;
begin
  if p_attempt_id is null or p_token_hash is null then
    raise exception 'attempt id and token hash are both required'
      using errcode = 'SPA00';
  end if;

  select * into v_attempt
  from public.pairing_attempts a
  where a.id = p_attempt_id
  for update;

  if not found then
    raise exception 'That pairing attempt is not valid.' using errcode = 'SPA01';
  end if;

  if v_attempt.status = 'pending' then
    raise exception 'That pairing attempt has not been approved yet.' using errcode = 'SPA02';
  end if;

  if v_attempt.status = 'consumed' then
    raise exception 'That pairing attempt has already been used.' using errcode = 'SPA03';
  end if;

  -- now() is the database clock, never a caller-supplied timestamp -- same
  -- reasoning as 008: a daemon with a skewed clock must not decide for
  -- itself whether its own attempt had expired.
  if v_attempt.expires_at <= pg_catalog.now() then
    raise exception 'That pairing attempt has expired.' using errcode = 'SPA04';
  end if;

  -- status = 'approved' from here on. workspace_id and approved_by_user_id
  -- are guaranteed non-null: the only path to 'approved' is
  -- pairing_attempts_approve's WITH CHECK above, which requires both.

  -- Upsert, not insert: FR-008 (spec) -- re-pairing an already-paired machine
  -- replaces its runtime row rather than erroring. runtime_id is stable
  -- across re-pairs (the CLI generates it once and keeps it), so a second
  -- pairing attempt for the same machine lands on the same primary key.
  insert into public.runtimes (
    id, workspace_id, name, os, hostname, is_electron,
    capabilities, status, core_version, last_heartbeat
  )
  values (
    v_attempt.runtime_id,
    v_attempt.workspace_id,
    coalesce(nullif(v_attempt.name, ''), nullif(v_attempt.hostname, ''), 'Unnamed machine'),
    coalesce(nullif(v_attempt.os, ''), 'unknown'),
    coalesce(nullif(v_attempt.hostname, ''), 'unknown'),
    coalesce(v_attempt.is_electron, false),
    coalesce(v_attempt.capabilities, '[]'::jsonb),
    'online',
    nullif(v_attempt.core_version, ''),
    pg_catalog.now()
  )
  on conflict (id) do update set
    workspace_id    = excluded.workspace_id,
    name            = excluded.name,
    os              = excluded.os,
    hostname        = excluded.hostname,
    is_electron     = excluded.is_electron,
    capabilities    = excluded.capabilities,
    status          = 'online',
    core_version    = excluded.core_version,
    last_heartbeat  = pg_catalog.now();

  -- Revoke any prior token for this runtime before minting the new one, so a
  -- re-pair leaves exactly one live credential rather than two.
  update public.daemon_tokens
  set revoked_at = pg_catalog.now()
  where runtime_id = v_attempt.runtime_id
    and revoked_at is null;

  insert into public.daemon_tokens (id, workspace_id, runtime_id, token_hash, label)
  values (
    pg_catalog.gen_random_uuid()::text,
    v_attempt.workspace_id,
    v_attempt.runtime_id,
    p_token_hash,
    coalesce(nullif(v_attempt.hostname, ''), 'daemon')
  );

  update public.pairing_attempts
  set status = 'consumed',
      consumed_at = pg_catalog.now()
  where id = p_attempt_id;

  return pg_catalog.jsonb_build_object(
    'runtimeId', v_attempt.runtime_id,
    'workspaceId', v_attempt.workspace_id
  );
end;
$$;

-- Service-role only. Same grant shape and reasoning as 008 -- see this file's
-- header. Verify after applying:
--   select has_function_privilege('anon', oid, 'EXECUTE'),
--          has_function_privilege('authenticated', oid, 'EXECUTE')
--   from pg_proc where proname = 'exchange_pairing_attempt';   -- must be f, f
revoke all on function public.exchange_pairing_attempt(text, text)
  from public, anon, authenticated;

comment on function public.exchange_pairing_attempt(text, text) is
  'Exchanges an approved pairing attempt for a real daemon token, exactly once: upserts the runtime (replacing an existing pairing for the same runtime_id), revokes any prior token, mints the new one, and marks the attempt consumed -- all in one transaction, serialised by a row lock on the attempt. Raises SPA01 (unknown), SPA02 (not yet approved), SPA03 (already consumed) or SPA04 (expired). Service-role only -- the attempt id is a bearer credential and this must not be reachable from anon or authenticated.';
