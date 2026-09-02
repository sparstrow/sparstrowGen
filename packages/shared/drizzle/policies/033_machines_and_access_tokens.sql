-- 033_machines_and_access_tokens.sql
--
-- The machine credential moves from {one workspace, one runtime} to the PERSON
-- who owns the machine. doc/specs/2026-09-02-computers-that-are-just-there.md
-- and doc/plans/2026-09-02-computers-that-are-just-there.md have the design;
-- doc/security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md has
-- the trust-boundary change this represents and the controls it depends on.
-- Read that one before loosening anything here.
--
-- Supersedes 031 (pairing_attempts) and 008's descendants entirely. Both of
-- those tables are dropped by migration 0012; their policies and functions go
-- with them at the bottom of this file.
--
-- Two tables, two postures:
--
--   machines       — owner-only. Nobody else needs to read it: everything a
--                    workspace member sees about a computer already lives on
--                    the workspace-scoped `runtimes` row, so granting members
--                    read here would widen exposure for no feature.
--
--   access_tokens  — owner-only AND column-restricted. `token_hash` is never
--                    granted to `authenticated` at all (same posture the
--                    dropped daemon_tokens had): RLS is row-level, so keeping
--                    the hash unreadable is a GRANT problem, not a policy one.

-- ── machines ────────────────────────────────────────────────────────────────
--
-- `(select auth.uid())` rather than a bare `auth.uid()`, per the InitPlan rule
-- in 001's header: wrapped, it is evaluated once per query instead of once per
-- row.
--
-- No insert or update policy for `authenticated`. Rows here are written only by
-- `claim_machine` below, which runs as definer. A signed-in user able to insert
-- a machine row directly could fabricate a computer they do not have, and a
-- user able to UPDATE one could re-point `user_id` at somebody else.

alter table public.machines enable row level security;

drop policy if exists machines_owner_read on public.machines;
create policy machines_owner_read on public.machines
  for select to authenticated
  using (user_id = (select auth.uid())::text);

-- Renaming is the one field a person edits by hand, so it gets the one write
-- policy — narrowed by WITH CHECK to rows that stay theirs.
drop policy if exists machines_owner_rename on public.machines;
create policy machines_owner_rename on public.machines
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists machines_owner_delete on public.machines;
create policy machines_owner_delete on public.machines
  for delete to authenticated
  using (user_id = (select auth.uid())::text);

-- ── access_tokens ───────────────────────────────────────────────────────────
--
-- INSERT is allowed for `authenticated` deliberately, unlike machines: minting
-- a token for yourself is exactly what the Settings -> API Tokens page and the
-- desktop claim flow do, and both run as the signed-in user. The WITH CHECK is
-- what keeps it honest — you may only ever create a token that acts as you.
--
-- The raw token is generated in Node (32 bytes of CSPRNG) and only its sha256
-- reaches the database, so "insert" here never means "the database chose a
-- credential".

alter table public.access_tokens enable row level security;

drop policy if exists access_tokens_owner_read on public.access_tokens;
create policy access_tokens_owner_read on public.access_tokens
  for select to authenticated
  using (user_id = (select auth.uid())::text);

drop policy if exists access_tokens_owner_insert on public.access_tokens;
create policy access_tokens_owner_insert on public.access_tokens
  for insert to authenticated
  with check (
    user_id = (select auth.uid())::text
    -- ...and bound to one of YOUR machines, or to none yet. Without this
    -- second clause, a member of a shared workspace could mint a token naming
    -- somebody else's machine_id; `resolveRuntimeScope` would then match that
    -- machine against a runtime in the workspace they legitimately share, and
    -- they would be impersonating a computer that is not theirs. The token
    -- still acts as them, which is why this is narrow rather than critical —
    -- but narrow is not the same as closed.
    and (
      machine_id is null
      or machine_id in (
        select m.id from public.machines m
        where m.user_id = (select auth.uid())::text
      )
    )
  );

-- Revocation is an UPDATE of `revoked_at`, not a DELETE: a revoked row is the
-- record that something HAD access and no longer does, which is most of what
-- the tokens page is for. Deleting it would erase the audit trail at exactly
-- the moment it becomes interesting.
drop policy if exists access_tokens_owner_revoke on public.access_tokens;
create policy access_tokens_owner_revoke on public.access_tokens
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

-- Column grants. `token_hash` is absent from both lists on purpose — it is
-- readable only by the service role, which is the only thing that ever needs
-- to match one. Re-granting it here would make every signed-in session able to
-- read the verifier for its own machines' credentials.
revoke select on public.access_tokens from authenticated;
grant select (
  id, user_id, machine_id, name, last_used_at, revoked_at, created_at
) on public.access_tokens to authenticated;

revoke insert on public.access_tokens from authenticated;
grant insert (
  id, user_id, machine_id, name, token_hash, created_at
) on public.access_tokens to authenticated;

revoke update on public.access_tokens from authenticated;
grant update (revoked_at, name) on public.access_tokens to authenticated;

-- ── connect_attempts ────────────────────────────────────────────────────────
--
-- Carried over from 031 with one change: no workspace is chosen. A machine
-- belongs to a person and reaches every workspace that person is in, so the
-- approval step records WHO approved and nothing else.
--
-- The second disjunct in the read policy is not decoration. It was found by
-- running the real flow: PostgREST compiles `.update().select()` into
-- `UPDATE ... RETURNING`, and that re-select is gated by the SELECT policy,
-- not the UPDATE policy's WITH CHECK. Without it, flipping `status` to
-- 'approved' makes the row stop matching `status = 'pending'`, the re-select
-- returns nothing, and Postgres reports 42501 "new row violates row level
-- security policy" — indistinguishable from a real WITH CHECK failure until
-- you trace it. Scoped to the approver so it only ever reveals the row that
-- person just approved.

alter table public.connect_attempts enable row level security;

drop policy if exists connect_attempts_pending_read on public.connect_attempts;
create policy connect_attempts_pending_read on public.connect_attempts
  for select to authenticated
  using (
    (status = 'pending' and expires_at > pg_catalog.now())
    or (status = 'approved' and approved_by_user_id = (select auth.uid())::text)
  );

drop policy if exists connect_attempts_approve on public.connect_attempts;
create policy connect_attempts_approve on public.connect_attempts
  for update to authenticated
  using (status = 'pending' and expires_at > pg_catalog.now())
  with check (
    status = 'approved'
    and approved_by_user_id = (select auth.uid())::text
  );

-- ── claim_machine: the whole of "this computer is mine" ─────────────────────
--
-- SECURITY DEFINER and service-role-only, for the same reason 004/031's RPCs
-- are: this is four-to-six statements that must land together or not at all.
-- A partial application would leave a machine row with no runtimes (invisible
-- and unusable) or runtimes in a workspace the caller has since left.
--
-- Called by POST /api/daemon/claim AFTER that route has verified the bearer
-- token and resolved it to `p_user_id`. The user id is therefore server-
-- asserted, never client-supplied — the same invariant `daemon/auth.ts`'s
-- banner states for workspace ids, applied to the identity that replaced it.
--
-- What it does, in order:
--   1. upsert the machine, moving `user_id` if a different person signed in
--   2. if the owner CHANGED, drop every runtime the machine had — the previous
--      owner's workspaces must not keep an entry that now answers to somebody
--      else (spec FR-004)
--   3. upsert one runtime per workspace the new owner belongs to
--   4. delete runtimes in workspaces they are no longer a member of
--
-- Step 4 is what stops a machine keeping a presence in a workspace after the
-- person left it. Without it, leaving a workspace would silently leave an
-- executable runtime behind in it.

create or replace function public.claim_machine(
  p_machine_id    text,
  p_user_id       text,
  p_name          text,
  p_os            text,
  p_hostname      text,
  p_is_electron   boolean,
  p_capabilities  jsonb,
  p_core_version  text,
  p_token_id      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_user text;
  v_result        jsonb;
begin
  if p_machine_id is null or p_user_id is null then
    raise exception 'machine id and user id are both required' using errcode = 'SCM00';
  end if;

  select m.user_id into v_previous_user
  from public.machines m
  where m.id = p_machine_id
  for update;

  -- `name` is set on insert only. A machine renamed in the UI must not have
  -- that name stomped by the next claim — the same reasoning the register
  -- route already applies to `runtimes.name`.
  insert into public.machines (
    id, user_id, name, os, hostname, is_electron, core_version, last_seen_at
  )
  values (
    p_machine_id,
    p_user_id,
    coalesce(nullif(p_name, ''), nullif(p_hostname, ''), 'Unnamed computer'),
    coalesce(nullif(p_os, ''), 'unknown'),
    coalesce(nullif(p_hostname, ''), 'unknown'),
    coalesce(p_is_electron, false),
    nullif(p_core_version, ''),
    pg_catalog.now()
  )
  on conflict (id) do update set
    user_id      = excluded.user_id,
    os           = excluded.os,
    hostname     = excluded.hostname,
    is_electron  = excluded.is_electron,
    core_version = excluded.core_version,
    last_seen_at = pg_catalog.now();

  -- A different person signed in on this computer. Everything the previous
  -- owner's workspaces knew about it goes, before anything new is written.
  if v_previous_user is not null and v_previous_user is distinct from p_user_id then
    delete from public.runtimes where machine_id = p_machine_id;
  end if;

  -- One runtime per workspace this person belongs to. The id is derived, not
  -- random, so a re-claim lands on the same row even if the unique index were
  -- ever rebuilt.
  insert into public.runtimes (
    id, workspace_id, machine_id, name, os, hostname, is_electron,
    capabilities, status, core_version, last_heartbeat
  )
  select
    p_machine_id || '_' || wm.workspace_id,
    wm.workspace_id,
    p_machine_id,
    coalesce(nullif(p_name, ''), nullif(p_hostname, ''), 'Unnamed computer'),
    coalesce(nullif(p_os, ''), 'unknown'),
    coalesce(nullif(p_hostname, ''), 'unknown'),
    coalesce(p_is_electron, false),
    coalesce(p_capabilities, '[]'::jsonb),
    'online',
    nullif(p_core_version, ''),
    pg_catalog.now()
  from public.workspace_members wm
  where wm.user_id = p_user_id
  on conflict (machine_id, workspace_id) do update set
    os             = excluded.os,
    hostname       = excluded.hostname,
    is_electron    = excluded.is_electron,
    capabilities   = excluded.capabilities,
    status         = 'online',
    core_version   = excluded.core_version,
    last_heartbeat = pg_catalog.now();

  -- Workspaces this person has left keep no runtime for this machine.
  delete from public.runtimes r
  where r.machine_id = p_machine_id
    and not exists (
      select 1 from public.workspace_members wm
      where wm.user_id = p_user_id and wm.workspace_id = r.workspace_id
    );

  -- Adopt the credential that made this call. A token created by hand on the
  -- tokens page starts with no machine (there was no machine yet when it was
  -- typed); this is where it learns which computer used it, so the tokens page
  -- can say "Sparstrow Desktop - DESKTOP-GJ8NLB8" instead of leaving a row
  -- that names no machine forever.
  if p_token_id is not null then
    update public.access_tokens
    set machine_id = p_machine_id
    where id = p_token_id
      and user_id = p_user_id
      and machine_id is distinct from p_machine_id;
  end if;

  select jsonb_build_object(
    'machineId', p_machine_id,
    'runtimes', coalesce(
      jsonb_agg(jsonb_build_object('runtimeId', r.id, 'workspaceId', r.workspace_id)),
      '[]'::jsonb
    )
  )
  into v_result
  from public.runtimes r
  where r.machine_id = p_machine_id;

  return v_result;
end;
$$;

revoke all on function public.claim_machine(text, text, text, text, text, boolean, jsonb, text, text) from public;
revoke all on function public.claim_machine(text, text, text, text, text, boolean, jsonb, text, text) from anon;
revoke all on function public.claim_machine(text, text, text, text, text, boolean, jsonb, text, text) from authenticated;
grant execute on function public.claim_machine(text, text, text, text, text, boolean, jsonb, text, text) to service_role;

-- The 8-argument shape existed briefly during development; drop it so two
-- overloads can never both be resolvable.
drop function if exists public.claim_machine(text, text, text, text, text, boolean, jsonb, text);

-- ── exchange_connect_attempt: where a remote machine's token is minted ──────
--
-- Same two-phase shape 031 established and for the same reason: the credential
-- is minted at CONSUME, not at approval, so it only exists once the browser's
-- redirect has already reached the machine's own loopback listener. A machine
-- that never came back never got a token.
--
-- Unlike 031's version this mints an access_token for the APPROVING PERSON and
-- creates no runtime — the machine calls claim_machine itself immediately
-- afterwards, with the credential it just received. Splitting those keeps one
-- claim path rather than two that can drift.
--
-- `select ... for update` without filtering on status, matching 031: filtering
-- would make the loser of a race see zero rows and report "unknown attempt"
-- for a request that was merely late, instead of the "already consumed" it
-- should report.

create or replace function public.exchange_connect_attempt(
  p_attempt_id  text,
  p_token_hash  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.connect_attempts%rowtype;
  v_token_id text;
begin
  if p_attempt_id is null or p_token_hash is null then
    raise exception 'attempt id and token hash are both required' using errcode = 'SCA00';
  end if;

  select * into v_attempt
  from public.connect_attempts a
  where a.id = p_attempt_id
  for update;

  if not found then
    raise exception 'That connection attempt is not valid.' using errcode = 'SCA01';
  end if;

  if v_attempt.status = 'pending' then
    raise exception 'That connection attempt has not been approved yet.' using errcode = 'SCA02';
  end if;

  if v_attempt.status = 'consumed' then
    raise exception 'That connection attempt has already been used.' using errcode = 'SCA03';
  end if;

  -- The database clock, never a caller-supplied timestamp: a machine with a
  -- skewed clock must not decide for itself whether its own attempt expired.
  if v_attempt.expires_at <= pg_catalog.now() then
    raise exception 'That connection attempt has expired.' using errcode = 'SCA04';
  end if;

  v_token_id := pg_catalog.gen_random_uuid()::text;

  insert into public.access_tokens (id, user_id, machine_id, name, token_hash)
  values (
    v_token_id,
    v_attempt.approved_by_user_id,
    null,  -- adopted by claim_machine on the machine's first call
    coalesce(nullif(v_attempt.hostname, ''), 'Connected computer'),
    p_token_hash
  );

  update public.connect_attempts
  set status = 'consumed', consumed_at = pg_catalog.now()
  where id = p_attempt_id;

  return jsonb_build_object(
    'tokenId', v_token_id,
    'userId', v_attempt.approved_by_user_id,
    'machineId', v_attempt.machine_id
  );
end;
$$;

revoke all on function public.exchange_connect_attempt(text, text) from public;
revoke all on function public.exchange_connect_attempt(text, text) from anon;
revoke all on function public.exchange_connect_attempt(text, text) from authenticated;
grant execute on function public.exchange_connect_attempt(text, text) to service_role;

-- ── Retire 031 ──────────────────────────────────────────────────────────────
--
-- Migration 0012 drops `pairing_attempts` and `daemon_tokens` with CASCADE,
-- which takes their policies with them. The function is not attached to either
-- table and would survive as a live, service-role-executable entry point that
-- references tables that no longer exist — so it is dropped explicitly.

drop function if exists public.exchange_pairing_attempt(text, text);
