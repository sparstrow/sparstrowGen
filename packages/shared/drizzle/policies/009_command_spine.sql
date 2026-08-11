-- 009_command_spine.sql
--
-- M4. Dispatch: how a row in Postgres becomes a process on someone's machine.
--
-- Four functions, split down one line — who is allowed to call them:
--
--   start_run / cancel_run      called with the USER's session. They check
--                               membership internally and are granted to
--                               `authenticated`.
--   claim_runtime_commands      called by /api/daemon/* with the SERVICE ROLE,
--   ack_runtime_command         after a bearer token has already been resolved
--                               to a runtime. They take a runtime id as an
--                               argument and therefore trust their caller
--                               completely, which is exactly why `authenticated`
--                               must never hold them: any signed-in user could
--                               otherwise drain another machine's queue by
--                               naming its id.
--
-- SECURITY DEFINER on start_run/cancel_run is NOT there to escape RLS. It is
-- there because each writes two tables in one transaction, and the invariant is
-- that both writes happen or neither does. Membership is still checked, by the
-- same private.current_workspace_ids() helper every policy in 001 uses.
--
-- Error contract. Callers must be able to tell these apart without matching on
-- English — apps/web maps each to a reason token the UI switches on:
--
--   SPG10  agent not found in any workspace you belong to
--   SPG11  agent exists but is disabled or not active
--   SPG12  no runtime is online and capable of running this agent
--   SPG13  no online runtime has this project on disk
--   SPG14  project not found in this workspace
--   SPG15  run not found
--
-- SPG01–SPG03 are 008's (pairing). Do not reuse them.
--
-- Idempotent and re-runnable, like every file in this directory.

-- ── Claim index ────────────────────────────────────────────────────────────
--
-- The claim predicate is (runtime_id, status in ('pending','claimed')) ordered
-- by created_at. `idx_runtime_commands_claim` from M1 covers it, but it indexes
-- every row forever — and `done` rows accumulate for the life of the workspace
-- while the number of OPEN commands stays near zero. A partial index stays
-- proportional to the work in flight rather than the work ever done.
--
-- The M1 index is deliberately left in place: it is declared in
-- packages/shared/src/db/schema.ts, and dropping it here would make that file
-- lie about the database. Retire it there, with a drizzle migration, or not at
-- all.
create index if not exists idx_runtime_commands_open
  on public.runtime_commands (runtime_id, created_at)
  where status in ('pending', 'claimed');


-- ═══════════════════════════════════════════════════════════════════════════
-- start_run — create the run and the command that dispatches it, atomically
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two inserts that must not be split. M2's defect 2 was precisely this shape
-- (three PostgREST inserts with no transaction), and the failure here is worse
-- than an orphan row: a run with no command is a spinner in the browser that
-- never resolves and no machine will ever pick up.
--
-- Returns the run row as jsonb rather than `returns table (...)`, for 008's
-- reason: OUT parameters named after columns shadow those columns inside the
-- body, and jsonb hands PostgREST one object instead of a one-element array.

create or replace function public.start_run(
  p_agent_id          text,
  p_prompt            text,
  p_project_id        text default null,
  p_task_id           text default null,
  p_target_runtime_id text default null,
  p_trigger           text default 'manual',
  p_trigger_ref       text default null,
  p_lane              text default 'foreground'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Mirrors HEARTBEAT_STALE_AFTER_MS in packages/shared/src/cloud.ts. SQL
  -- cannot import it; if one changes, change both. The daemon beats every 30s,
  -- so this is three intervals — one dropped request must not make a live
  -- machine un-runnable.
  v_stale_after  constant interval := interval '90 seconds';
  v_agent        public.agents%rowtype;
  v_project      public.projects%rowtype;
  v_runtime_id   text;
  v_candidates   integer;
  v_run_id       text;
  v_run          public.runs%rowtype;
begin
  if p_prompt is null or pg_catalog.btrim(p_prompt) = '' then
    raise exception 'A prompt is required to start a run.' using errcode = 'SPG10';
  end if;

  -- Agent, membership-scoped. "Not yours" and "does not exist" deliberately
  -- collapse into one error: distinguishing them would turn this into an
  -- oracle for ids in other workspaces.
  select a.* into v_agent
  from public.agents a
  where a.id = p_agent_id
    and a.workspace_id in (select private.current_workspace_ids());

  if not found then
    raise exception 'That agent does not exist.' using errcode = 'SPG10';
  end if;

  -- Checked here as well as at spawn. run-manager.createRun() refuses a
  -- disabled or non-active agent too (P9 defence in depth), but by then a run
  -- row exists and a command has already crossed the network to fail on
  -- someone's laptop. Refusing at enqueue costs one round trip and no rows.
  if not v_agent.enabled then
    raise exception 'That agent is disabled.' using errcode = 'SPG11';
  end if;
  if v_agent.status <> 'active' then
    raise exception 'That agent is %, not active.', v_agent.status using errcode = 'SPG11';
  end if;

  if p_project_id is not null then
    select p.* into v_project
    from public.projects p
    where p.id = p_project_id
      and p.workspace_id = v_agent.workspace_id;

    if not found then
      raise exception 'That project does not exist.' using errcode = 'SPG14';
    end if;
  end if;

  -- ── Target selection ────────────────────────────────────────────────────
  --
  -- An explicit target is obeyed EXACTLY: no fallback to another machine. A
  -- user who pinned work to their desktop did so for a reason, and quietly
  -- running it on the laptop is the worst thing this function could do.
  --
  -- It must still be online, though, and that is not a contradiction. "Obey
  -- exactly" means never substitute a different machine; it does not mean
  -- queue work against a machine that is switched off. Pending work for an
  -- offline daemon is how someone closes their laptop on Friday and finds
  -- eleven runs starting on Monday.
  if p_target_runtime_id is not null then
    select r.id into v_runtime_id
    from public.runtimes r
    where r.id = p_target_runtime_id
      and r.workspace_id = v_agent.workspace_id
      and r.last_heartbeat > pg_catalog.now() - v_stale_after;

    if not found then
      raise exception 'That machine is offline.' using errcode = 'SPG12';
    end if;

    if p_project_id is not null and not exists (
      select 1 from public.runtime_projects rp
      where rp.runtime_id = v_runtime_id
        and rp.project_id = p_project_id
        and rp.state = 'bound'
    ) then
      raise exception 'That machine does not have this project.' using errcode = 'SPG13';
    end if;
  else
    -- Online AND capable, before considering the project. Counted separately so
    -- "no machine can run this agent" (SPG12) stays distinguishable from "no
    -- machine has this project" (SPG13) — they lead to completely different
    -- actions in the UI, and one error for both would be useless.
    --
    -- `capabilities` is what M3's probe found ACTUALLY runnable on that host,
    -- not the static provider registry, which is the whole reason it is
    -- trustworthy here.
    select pg_catalog.count(*) into v_candidates
    from public.runtimes r
    where r.workspace_id = v_agent.workspace_id
      and r.last_heartbeat > pg_catalog.now() - v_stale_after
      and pg_catalog.jsonb_exists(r.capabilities, v_agent.provider);

    if v_candidates = 0 then
      raise exception 'No machine is online that can run %.', v_agent.provider
        using errcode = 'SPG12';
    end if;

    select r.id into v_runtime_id
    from public.runtimes r
    where r.workspace_id = v_agent.workspace_id
      and r.last_heartbeat > pg_catalog.now() - v_stale_after
      and pg_catalog.jsonb_exists(r.capabilities, v_agent.provider)
      and (
        p_project_id is null
        or exists (
          select 1 from public.runtime_projects rp
          where rp.runtime_id = r.id
            and rp.project_id = p_project_id
            and rp.state = 'bound'
        )
      )
    order by r.last_heartbeat desc
    limit 1;

    if v_runtime_id is null then
      raise exception 'No online machine has this project on disk.'
        using errcode = 'SPG13';
    end if;
  end if;

  -- ── The two writes ──────────────────────────────────────────────────────
  --
  -- The id is generated HERE and the daemon adopts it for its local run row
  -- (M4 decision 4). One id end to end means M5's run_events attach to the run
  -- the browser is already watching, with no translation on the hot path.
  v_run_id := 'run_' || pg_catalog.substr(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
  );

  insert into public.runs (
    id, workspace_id, agent_id, project_id, task_id, target_runtime_id,
    trigger, trigger_ref, mode, prompt, status, lane
  )
  values (
    v_run_id, v_agent.workspace_id, v_agent.id, p_project_id, p_task_id,
    v_runtime_id, coalesce(nullif(p_trigger, ''), 'manual'), p_trigger_ref,
    'headless', p_prompt, 'queued', coalesce(nullif(p_lane, ''), 'foreground')
  );

  -- Slugs travel WITH the ids on purpose. The daemon resolves a cloud agent to
  -- a local one by slug (M4 decision 5, D-9) and links it by id; sending only
  -- the id would force a second round trip, on the dispatch path, for data this
  -- function already has in hand.
  insert into public.runtime_commands (
    id, workspace_id, runtime_id, kind, payload, status, idempotency_key
  )
  values (
    'cmd_' || pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
    ),
    v_agent.workspace_id,
    v_runtime_id,
    'run.start',
    pg_catalog.jsonb_build_object(
      'runId',       v_run_id,
      'agentId',     v_agent.id,
      'agentSlug',   v_agent.slug,
      'projectId',   p_project_id,
      'projectSlug', v_project.slug,
      'taskId',      p_task_id,
      'prompt',      p_prompt,
      'trigger',     coalesce(nullif(p_trigger, ''), 'manual'),
      'lane',        coalesce(nullif(p_lane, ''), 'foreground')
    ),
    'pending',
    'run.start:' || v_run_id
  );

  if p_task_id is not null then
    update public.tasks t
    set status = 'in_progress',
        run_id = v_run_id,
        updated_at = pg_catalog.now()
    where t.id = p_task_id
      and t.workspace_id = v_agent.workspace_id;
  end if;

  select r.* into v_run from public.runs r where r.id = v_run_id;
  return pg_catalog.to_jsonb(v_run);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- cancel_run — ask the machine to stop
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A cancel that arrives after the run finished is ORDINARY, not an error. The
-- user pressed a button that was correct when the page rendered. Return the run
-- unchanged and enqueue nothing.

create or replace function public.cancel_run(p_run_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.runs%rowtype;
begin
  select r.* into v_run
  from public.runs r
  where r.id = p_run_id
    and r.workspace_id in (select private.current_workspace_ids());

  if not found then
    raise exception 'That run does not exist.' using errcode = 'SPG15';
  end if;

  if v_run.status in ('succeeded', 'failed', 'cancelled', 'timeout') then
    return pg_catalog.to_jsonb(v_run);
  end if;

  -- No target runtime means nothing ever claimed it: cancel it here rather than
  -- enqueueing a command for a machine that was never chosen.
  if v_run.target_runtime_id is null then
    update public.runs r
    set status = 'cancelled', finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where r.id = p_run_id;
    select r.* into v_run from public.runs r where r.id = p_run_id;
    return pg_catalog.to_jsonb(v_run);
  end if;

  -- ON CONFLICT, not a pre-check: two clicks on Cancel race the same way two
  -- daemons race a pairing code, and the unique index is the thing that
  -- actually decides.
  insert into public.runtime_commands (
    id, workspace_id, runtime_id, kind, payload, status, idempotency_key
  )
  values (
    'cmd_' || pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
    ),
    v_run.workspace_id,
    v_run.target_runtime_id,
    'run.cancel',
    pg_catalog.jsonb_build_object('runId', p_run_id),
    'pending',
    'run.cancel:' || p_run_id
  )
  on conflict (idempotency_key) do nothing;

  return pg_catalog.to_jsonb(v_run);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- claim_runtime_commands — the daemon's poll
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One UPDATE ... RETURNING, never SELECT-then-UPDATE. Two pollers — or one
-- daemon whose previous poll is still in flight — would otherwise both see the
-- same pending row and dispatch it twice.
--
-- FOR UPDATE SKIP LOCKED is what makes concurrent claims disjoint instead of
-- serialised: the second caller steps over the rows the first is holding rather
-- than waiting behind them.
--
-- Expired leases are reclaimed by the same statement, which is why nothing
-- sweeps them on a timer. A daemon killed between claim and ack has its work
-- picked up when the lease runs out, and that is the entire crash-recovery
-- story for dispatch.

create or replace function public.claim_runtime_commands(
  p_runtime_id text,
  p_limit      integer default 10,
  p_lease_ms   integer default 60000
)
returns setof public.runtime_commands
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- A command abandoned this many times is not going to work on the next
  -- attempt. Without a ceiling it is redispatched forever, which is how one
  -- poison row keeps a machine permanently busy failing.
  v_max_attempts constant integer := 5;
begin
  -- Retire the poison rows first, so they stop being counted as open work and
  -- the board says what happened instead of showing `claimed` for ever.
  update public.runtime_commands c
  set status = 'expired',
      completed_at = pg_catalog.now(),
      error = coalesce(c.error, 'abandoned after ' || v_max_attempts || ' attempts')
  where c.runtime_id = p_runtime_id
    and c.status = 'claimed'
    and c.lease_expires_at < pg_catalog.now()
    and c.attempts >= v_max_attempts;

  -- Data-modifying CTE rather than a bare `return query update ... returning`:
  -- both work, but this form is unambiguously a query to RETURN QUERY and reads
  -- as one.
  --
  -- greatest/least are bare, not pg_catalog-qualified: like coalesce and nullif
  -- they are SQL constructs rather than catalog functions, so the qualified form
  -- does not resolve. They are also not name-resolved through search_path and
  -- therefore cannot be hijacked. Same note as 004 and 008.
  return query
  with claimed as (
    update public.runtime_commands c
    set status = 'claimed',
        claimed_at = pg_catalog.now(),
        lease_expires_at = pg_catalog.now()
          + pg_catalog.make_interval(secs => p_lease_ms / 1000.0),
        attempts = c.attempts + 1
    where c.id in (
      select inner_c.id
      from public.runtime_commands inner_c
      where inner_c.runtime_id = p_runtime_id
        and inner_c.attempts < v_max_attempts
        and (
          inner_c.status = 'pending'
          or (inner_c.status = 'claimed' and inner_c.lease_expires_at < pg_catalog.now())
        )
      order by inner_c.created_at
      limit greatest(1, least(coalesce(p_limit, 10), 50))
      for update skip locked
    )
    returning c.*
  )
  select * from claimed order by created_at;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ack_runtime_command — the daemon reports what happened
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scoped by runtime id so a token for machine A cannot close machine B's work.
--
-- Idempotent by design: the daemon retries an ack whose response was lost to a
-- dropped connection, and an error on the second attempt would tell it to retry
-- work it has already finished. An ack for an already-completed command is a
-- no-op that reports success.
--
-- What this function deliberately does NOT do is touch tasks or runs. A daemon
-- that could set board state from an ack reason could mark every task in a
-- workspace done. The reason token is carried up to the route, which owns that
-- translation. See doc/tasks/M4/T-M4-02.

create or replace function public.ack_runtime_command(
  p_id         text,
  p_runtime_id text,
  p_status     text,
  p_error      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.runtime_commands%rowtype;
begin
  if p_status not in ('done', 'failed') then
    raise exception 'ack status must be done or failed, got %', p_status
      using errcode = 'SPG10';
  end if;

  select c.* into v_command
  from public.runtime_commands c
  where c.id = p_id
    and c.runtime_id = p_runtime_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_command.status in ('done', 'failed', 'expired') then
    return pg_catalog.jsonb_build_object('ok', true, 'alreadyCompleted', true);
  end if;

  update public.runtime_commands c
  set status = p_status,
      completed_at = pg_catalog.now(),
      lease_expires_at = null,
      error = nullif(p_error, '')
  where c.id = p_id;

  return pg_catalog.jsonb_build_object('ok', true, 'alreadyCompleted', false);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Grants
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.start_run(text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.start_run(text, text, text, text, text, text, text, text)
  to authenticated;

revoke all on function public.cancel_run(text) from public, anon;
grant execute on function public.cancel_run(text) to authenticated;

-- Service role only. `authenticated` holding either of these would let any
-- signed-in user name another machine's runtime id and drain or close its
-- queue — the token check in /api/daemon/* is the only thing establishing that
-- the caller IS that machine, and it happens outside the database.
revoke all on function public.claim_runtime_commands(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.ack_runtime_command(text, text, text, text)
  from public, anon, authenticated;

comment on function public.start_run(text, text, text, text, text, text, text, text) is
  'Creates a run and its run.start command in one transaction, choosing an online, capable, project-bound runtime. Membership checked internally; an explicit target runtime is never substituted. Raises SPG10 (no agent), SPG11 (agent disabled/inactive), SPG12 (no capable machine online), SPG13 (no machine has the project), SPG14 (no project).';

comment on function public.cancel_run(text) is
  'Enqueues run.cancel for the run''s target runtime, or cancels outright if none was chosen. Returns the run unchanged when it is already terminal — a cancel racing a completion is ordinary, not an error. Raises SPG15 when the run is not visible to the caller.';

comment on function public.claim_runtime_commands(text, integer, integer) is
  'Atomically claims up to p_limit pending or lease-expired commands for one runtime, incrementing attempts and setting a lease. FOR UPDATE SKIP LOCKED makes concurrent claims disjoint. Commands abandoned 5 times are retired to expired. Service-role only.';

comment on function public.ack_runtime_command(text, text, text, text) is
  'Closes a command as done or failed, scoped to the runtime that claimed it. Idempotent: acking an already-completed command reports success so a retried ack after a dropped response is not an error. Does not touch runs or tasks. Service-role only.';
