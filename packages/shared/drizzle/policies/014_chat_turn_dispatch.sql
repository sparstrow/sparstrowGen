-- 014_chat_turn_dispatch.sql
--
-- M12. Chat turns: a durable cloud row the existing command spine (009)
-- dispatches as a `chat.turn` command, and streams its reply back the same
-- way M5 streams a run transcript. See
-- doc/plans/2026-08-23-chat-message-sending.md and
-- doc/tasks/M12/T-M12-01-schema-and-dispatch-functions.md.
--
-- Reuses 009's shape wholesale rather than inventing a parallel one:
--   enqueue_chat_turn / retry_chat_turn   called with the USER's session,
--                                         same as start_run/cancel_run.
--   ingest_chat_turn_reply                called by /api/daemon/chat/turns/*
--                                         with the SERVICE ROLE, same as
--                                         ack_runtime_command.
--
-- Diverges from 009 in exactly one place, deliberately: `enqueue_chat_turn`
-- never raises for "nothing is online". It parks the turn `waiting` with a
-- reason instead, because losing the owner's typed prose is worse than a
-- bounded wait -- start_run's `offline is not a queue` decision is correct
-- for runs and does not apply here. See the plan's DD-3.
--
-- Error contract, continuing 009's SPG numbering (SPG10-15 are 009's):
--
--   SPG16  a turn is already in flight for this session
--   SPG17  chat session not found in any workspace you belong to
--   SPG18  chat turn not found
--   SPG19  chat turn is not in a retryable state (not succeeded/failed)
--
-- Idempotent and re-runnable, like every file in this directory.

-- ── FR-004: at most one non-terminal turn per session ──────────────────────
--
-- A database constraint, not a handler check -- a read-then-write guard in a
-- route is exactly the shape M2's defect 9 was. enqueue_chat_turn and
-- retry_chat_turn both insert with `on conflict ... do nothing`, targeting
-- this index by its predicate; a NULL RETURNING means the conflict fired.
create unique index if not exists uq_chat_turns_session_active
  on public.chat_turns (session_id)
  where status in ('waiting', 'in_progress');

-- Proportional to turns actually waiting, not every turn ever sent -- the
-- assignment rescan's own working set. Same idea as idx_runtime_commands_open.
create index if not exists idx_chat_turns_waiting
  on public.chat_turns (workspace_id, created_at)
  where status = 'waiting';


-- ═══════════════════════════════════════════════════════════════════════════
-- private.pick_runtime_for — the one place "who may serve this?" is decided
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Extracted from start_run's existing inline predicate (009), now needed at
-- three call sites (start_run, chat's assignment, chat's rescan). Only the
-- SELECTION query is shared -- start_run's SPG12-vs-SPG13 error distinction
-- and chat's 3-way waiting_reason are each caller's own diagnostic logic
-- layered on top of the same underlying fact, not shared logic themselves.
--
-- Review this as a diff against start_run's prior inline query, not as new
-- code: it is security-critical (decides which physical machine a command
-- dispatches to) in exactly the way 001_rls.sql's helpers are.
create or replace function private.pick_runtime_for(
  p_workspace_id text,
  p_provider     text,
  p_project_id   text default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.runtimes r
  where r.workspace_id = p_workspace_id
    and r.last_heartbeat > pg_catalog.now() - interval '90 seconds'
    and pg_catalog.jsonb_exists(r.capabilities, p_provider)
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
$$;

comment on function private.pick_runtime_for(text, text, text) is
  'The online+capable+project-bound-if-set runtime selection, shared by start_run, chat turn assignment and the chat rescan. Not reachable via PostgREST (private schema). Behavior-identical to start_run''s prior inline query.';


-- ═══════════════════════════════════════════════════════════════════════════
-- start_run — updated to call private.pick_runtime_for
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Same signature, same SPG10-15 contract, same two-query shape (a count to
-- distinguish "no capable machine" from "no machine has the project", then
-- the actual selection) -- only the second query is now the shared function
-- instead of a third copy of it. Everything else is byte-for-byte 009's body.
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

  select a.* into v_agent
  from public.agents a
  where a.id = p_agent_id
    and a.workspace_id in (select private.current_workspace_ids());

  if not found then
    raise exception 'That agent does not exist.' using errcode = 'SPG10';
  end if;

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
    select pg_catalog.count(*) into v_candidates
    from public.runtimes r
    where r.workspace_id = v_agent.workspace_id
      and r.last_heartbeat > pg_catalog.now() - v_stale_after
      and pg_catalog.jsonb_exists(r.capabilities, v_agent.provider);

    if v_candidates = 0 then
      raise exception 'No machine is online that can run %.', v_agent.provider
        using errcode = 'SPG12';
    end if;

    v_runtime_id := private.pick_runtime_for(v_agent.workspace_id, v_agent.provider, p_project_id);

    if v_runtime_id is null then
      raise exception 'No online machine has this project on disk.'
        using errcode = 'SPG13';
    end if;
  end if;

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
-- private.assign_or_park_chat_turn — dispatch now, or park with a reason
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Looks the turn up by id and resolves session/project/agent itself, rather
-- than taking them as parameters -- called from three places (enqueue,
-- retry, rescan) and re-deriving is one join, not a burden worth pushing
-- onto every caller.
--
-- Never raises. A miss is recorded as a waiting_reason, not an exception --
-- this is the mechanism behind the spec's US2.2.
create or replace function private.assign_or_park_chat_turn(p_turn_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stale_after constant interval := interval '90 seconds';
  v_turn        public.chat_turns%rowtype;
  v_session     public.chat_sessions%rowtype;
  v_project     public.projects%rowtype;
  v_agent       public.agents%rowtype;
  v_runtime_id  text;
  v_command_id  text;
  v_provider    text;
  v_model       text;
  v_has_any     boolean;
  v_has_capable boolean;
  v_reason      text;
begin
  select t.* into v_turn from public.chat_turns t where t.id = p_turn_id;
  if not found then
    return;
  end if;

  select s.* into v_session from public.chat_sessions s where s.id = v_turn.session_id;

  if v_session.project_id is not null then
    select p.* into v_project from public.projects p where p.id = v_session.project_id;
  end if;
  if v_session.agent_id is not null then
    select a.* into v_agent from public.agents a where a.id = v_session.agent_id;
  end if;

  -- Turn's own override (a retry) beats the agent's configured default,
  -- which beats the session's stored provider/model (free/project sessions
  -- carry one from creation).
  v_provider := coalesce(v_turn.provider, v_agent.provider, v_session.provider);
  v_model := coalesce(v_turn.model, v_agent.model, v_session.model);

  v_runtime_id := private.pick_runtime_for(
    v_turn.workspace_id,
    v_provider,
    case when v_session.kind = 'project' then v_session.project_id else null end
  );

  if v_runtime_id is not null then
    v_command_id := 'cmd_' || pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
    );

    insert into public.runtime_commands (
      id, workspace_id, runtime_id, kind, payload, status, idempotency_key
    )
    values (
      v_command_id, v_turn.workspace_id, v_runtime_id, 'chat.turn',
      pg_catalog.jsonb_build_object(
        'turnId',      v_turn.id,
        'sessionId',   v_session.id,
        'sessionKind', v_session.kind,
        'projectId',   v_session.project_id,
        'projectSlug', v_project.slug,
        'agentId',     v_session.agent_id,
        'agentSlug',   v_agent.slug,
        'provider',    v_provider,
        'model',       v_model,
        'attempt',     v_turn.attempt
      ),
      'pending',
      'chat.turn:' || v_turn.id
    )
    on conflict (idempotency_key) do update
      set runtime_id = excluded.runtime_id,
          payload = excluded.payload,
          status = 'pending',
          lease_expires_at = null,
          attempts = 0
    returning id into v_command_id;

    update public.chat_turns
    set status = 'in_progress',
        assigned_runtime_id = v_runtime_id,
        command_id = v_command_id,
        provider = v_provider,
        model = v_model,
        started_at = pg_catalog.now(),
        waiting_reason = null,
        updated_at = pg_catalog.now()
    where id = p_turn_id;
  else
    select exists(
      select 1 from public.runtimes r where r.workspace_id = v_turn.workspace_id
    ) into v_has_any;

    if not v_has_any then
      v_reason := 'no_runtime_paired';
    else
      select exists(
        select 1 from public.runtimes r
        where r.workspace_id = v_turn.workspace_id
          and r.last_heartbeat > pg_catalog.now() - v_stale_after
          and pg_catalog.jsonb_exists(r.capabilities, v_provider)
      ) into v_has_capable;

      v_reason := case when not v_has_capable then 'all_runtimes_offline' else 'project_not_available' end;
    end if;

    -- coalesce is load-bearing: the deadline is set ONCE, never pushed out
    -- by a later recompute finding a different reason.
    update public.chat_turns
    set waiting_reason = v_reason,
        wait_expires_at = coalesce(wait_expires_at, pg_catalog.now() + interval '24 hours'),
        updated_at = pg_catalog.now()
    where id = p_turn_id;
  end if;
end;
$$;

comment on function private.assign_or_park_chat_turn(text) is
  'Dispatches a chat_turns row to an eligible runtime, or records why it cannot be served yet. Never raises. Not reachable via PostgREST.';


-- ═══════════════════════════════════════════════════════════════════════════
-- private.rescan_waiting_chat_turns — the existing poll adopts waiting turns
-- ═══════════════════════════════════════════════════════════════════════════
--
-- No new scheduler: called from claim_runtime_commands' own preamble below,
-- riding the 3s poll every runtime already performs. This is both the TTL
-- sweep (expire first) and the "a machine finally came online" adoption path
-- -- the same statement serves both, since assign_or_park_chat_turn already
-- recomputes the reason for anything still un-assignable.
--
-- FOR UPDATE SKIP LOCKED is what makes two concurrent rescans (two runtimes
-- polling at once) disjoint rather than racing the same row -- not a
-- restriction to "only the calling runtime may be assigned", which would add
-- complexity for no correctness benefit: a command row created for whichever
-- runtime pick_runtime_for selects is picked up on THAT runtime's own next
-- poll regardless of which runtime's poll triggered this rescan.
create or replace function private.rescan_waiting_chat_turns(p_workspace_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn record;
begin
  update public.chat_turns
  set status = 'failed',
      error = 'No machine picked up this message in time.',
      finished_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where workspace_id = p_workspace_id
    and status = 'waiting'
    and wait_expires_at < pg_catalog.now();

  for v_turn in
    select id from public.chat_turns
    where workspace_id = p_workspace_id and status = 'waiting'
    order by created_at
    for update skip locked
  loop
    perform private.assign_or_park_chat_turn(v_turn.id);
  end loop;
end;
$$;

comment on function private.rescan_waiting_chat_turns(text) is
  'TTL-expires overdue waiting turns and attempts to assign the rest. Called from claim_runtime_commands'' own preamble -- no separate scheduler. Not reachable via PostgREST.';


-- ═══════════════════════════════════════════════════════════════════════════
-- enqueue_chat_turn — the owner sends a message
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Never raises for "nothing is online" -- see this file's header. Only a bad
-- session id (SPG17) or an already-in-flight turn (SPG16) is a hard error.
--
-- Does not accept agent-creator sessions' `draft` payload. Agent-creator
-- sessions keep the local (non-dispatched) path entirely -- per the plan's
-- Scope boundaries, this function is not their entrypoint at all. The route
-- calling this (T-M12-03) is what must not call it for an agent-creator
-- session; nothing here re-derives that check, to avoid a second copy of the
-- session-kind branching apps/web already has to do to route the request.
create or replace function public.enqueue_chat_turn(
  p_session_id text,
  p_content    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.chat_sessions%rowtype;
  v_turn_id text;
  v_msg_id  text;
begin
  select s.* into v_session
  from public.chat_sessions s
  where s.id = p_session_id
    and s.workspace_id in (select private.current_workspace_ids());

  if not found then
    raise exception 'That chat session does not exist.' using errcode = 'SPG17';
  end if;

  v_turn_id := 'ct_' || pg_catalog.substr(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
  );

  insert into public.chat_turns (id, workspace_id, session_id, status, attempt)
  values (v_turn_id, v_session.workspace_id, v_session.id, 'waiting', 1)
  on conflict (session_id) where status in ('waiting', 'in_progress') do nothing
  returning id into v_turn_id;

  if v_turn_id is null then
    raise exception 'This session already has a reply in progress.' using errcode = 'SPG16';
  end if;

  v_msg_id := 'msg_' || pg_catalog.substr(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
  );

  insert into public.chat_messages (id, workspace_id, session_id, role, content, turn_id)
  values (v_msg_id, v_session.workspace_id, v_session.id, 'user', p_content, v_turn_id);

  update public.chat_sessions set last_message_at = pg_catalog.now() where id = v_session.id;

  perform private.assign_or_park_chat_turn(v_turn_id);

  return (select pg_catalog.to_jsonb(t) from public.chat_turns t where t.id = v_turn_id);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- retry_chat_turn — re-ask without retyping
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Always creates a NEW turn and a NEW user chat_messages row, copying the
-- original message's content -- never rewrites the original turn or message
-- in place. This is what makes "the previous reply stays in history" (spec
-- US3.2) just "don't touch the old rows" rather than a special case.
create or replace function public.retry_chat_turn(
  p_turn_id  text,
  p_provider text default null,
  p_model    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.chat_turns%rowtype;
  v_orig_msg public.chat_messages%rowtype;
  v_new_id   text;
  v_msg_id   text;
begin
  select t.* into v_original
  from public.chat_turns t
  where t.id = p_turn_id
    and t.workspace_id in (select private.current_workspace_ids());

  if not found then
    raise exception 'That chat turn does not exist.' using errcode = 'SPG18';
  end if;

  if v_original.status not in ('succeeded', 'failed') then
    raise exception 'This turn cannot be retried yet.' using errcode = 'SPG19';
  end if;

  select m.* into v_orig_msg
  from public.chat_messages m
  where m.turn_id = v_original.id and m.role = 'user'
  order by m.created_at asc
  limit 1;

  v_new_id := 'ct_' || pg_catalog.substr(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
  );

  insert into public.chat_turns (
    id, workspace_id, session_id, status, provider, model, attempt, retry_of_turn_id
  )
  values (
    v_new_id, v_original.workspace_id, v_original.session_id, 'waiting',
    coalesce(p_provider, v_original.provider), coalesce(p_model, v_original.model),
    v_original.attempt + 1, v_original.id
  )
  on conflict (session_id) where status in ('waiting', 'in_progress') do nothing
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'This session already has a reply in progress.' using errcode = 'SPG16';
  end if;

  v_msg_id := 'msg_' || pg_catalog.substr(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
  );

  insert into public.chat_messages (id, workspace_id, session_id, role, content, turn_id)
  values (v_msg_id, v_original.workspace_id, v_original.session_id, 'user', v_orig_msg.content, v_new_id);

  update public.chat_sessions set last_message_at = pg_catalog.now() where id = v_original.session_id;

  perform private.assign_or_park_chat_turn(v_new_id);

  return (select pg_catalog.to_jsonb(t) from public.chat_turns t where t.id = v_new_id);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- claim_runtime_commands — updated to also adopt waiting chat turns
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Same signature, same claim/lease/poison-row logic as 009's version --
-- byte-for-byte, apart from the new preamble. DD-4: the existing poll adopts
-- waiting turns; the daemon's loop shape does not change at all, it just
-- sees a new command `kind` once assigned.
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
  v_max_attempts constant integer := 5;
  v_workspace_id text;
begin
  -- M12 preamble. A cheap PK lookup -- this function previously trusted
  -- p_runtime_id for filtering only, never joined on it.
  select r.workspace_id into v_workspace_id
  from public.runtimes r
  where r.id = p_runtime_id;

  if v_workspace_id is not null then
    perform private.rescan_waiting_chat_turns(v_workspace_id);
  end if;

  update public.runtime_commands c
  set status = 'expired',
      completed_at = pg_catalog.now(),
      error = coalesce(c.error, 'abandoned after ' || v_max_attempts || ' attempts')
  where c.runtime_id = p_runtime_id
    and c.status = 'claimed'
    and c.lease_expires_at < pg_catalog.now()
    and c.attempts >= v_max_attempts;

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
-- ingest_chat_turn_reply — the daemon posts streamed/terminal output
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scoped by (turn id, assigned runtime id) so a token for machine A cannot
-- write machine B's turn -- same containment rule as ack_runtime_command,
-- which is the SECOND layer of that check; the FIRST is the bearer-token
-- resolution the route (T-M12-03) performs before ever calling this.
--
-- `p_reply_text` is always the FULL accumulated text as of `p_seq`, never a
-- delta (see the chat_turns table comment) -- one seq comparison makes this
-- idempotent under a replayed or reordered batch, no gap handling needed.
--
-- Only status = 'succeeded' inserts the assistant chat_messages row. This is
-- the ONLY place that row is ever created, and this function is
-- service-role-only -- a member can never forge a reply.
create or replace function public.ingest_chat_turn_reply(
  p_turn_id    text,
  p_runtime_id text,
  p_seq        integer,
  p_reply_text text,
  p_status     text,
  p_error      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn public.chat_turns%rowtype;
begin
  if p_status not in ('running', 'succeeded', 'failed') then
    raise exception 'status must be running, succeeded or failed, got %', p_status
      using errcode = 'SPG10';
  end if;

  select t.* into v_turn
  from public.chat_turns t
  where t.id = p_turn_id
    and t.assigned_runtime_id = p_runtime_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_turn.status in ('succeeded', 'failed') then
    return pg_catalog.jsonb_build_object('ok', true, 'alreadyCompleted', true);
  end if;

  if p_seq <= v_turn.reply_seq then
    return pg_catalog.jsonb_build_object('ok', true, 'alreadyCompleted', false, 'stale', true);
  end if;

  update public.chat_turns
  set reply_text = p_reply_text,
      reply_seq = p_seq,
      status = case p_status when 'running' then 'in_progress' else p_status end,
      error = nullif(p_error, ''),
      finished_at = case when p_status in ('succeeded', 'failed') then pg_catalog.now() else finished_at end,
      updated_at = pg_catalog.now()
  where id = p_turn_id;

  if p_status = 'succeeded' then
    insert into public.chat_messages (id, workspace_id, session_id, role, content, turn_id, meta)
    values (
      'msg_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16),
      v_turn.workspace_id, v_turn.session_id, 'assistant', p_reply_text, p_turn_id,
      pg_catalog.jsonb_build_object('provider', v_turn.provider, 'model', v_turn.model)
    );
    update public.chat_sessions set last_message_at = pg_catalog.now() where id = v_turn.session_id;
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'alreadyCompleted', false);
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — chat_turns gets its own read-only block, never the blanket array
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every write is a computed state transition through the functions above. A
-- member with raw UPDATE could set status='succeeded' and reply_text to
-- anything and it would render as a real assistant reply -- the same forgery
-- risk 010_transcript_broadcast.sql calls out for run_events.

alter table public.chat_turns enable row level security;

drop policy if exists chat_turns_member_read on public.chat_turns;
create policy chat_turns_member_read on public.chat_turns
  for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

-- No insert/update/delete policy for `authenticated`, deliberately.


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — chat_messages narrowed out of 001's blanket workspace_scoped array
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 001_rls.sql's blanket array grants `for all` to any workspace member,
-- which lets any member INSERT a row with role='assistant' and arbitrary
-- content directly via PostgREST -- indistinguishable in the UI from a real
-- reply the moment ingest_chat_turn_reply above starts writing real ones.
--
-- Narrowed here rather than in 001 itself, per this directory's own
-- precedent (005 alters a pre-M1 function from a later file; a later file
-- overriding an earlier policy is the established pattern, not a special
-- case). Confirmed before narrowing: neither apps/web's chat handler nor
-- core's agent-creator local flow inserts a chat_messages row through
-- PostgREST with the authenticated user's own session -- the cloud POST
-- /chat/sessions handler only ever inserts chat_sessions, and the local
-- Fastify chat routes write through core's own SQLite connection, never
-- through this table's PostgREST surface at all.

drop policy if exists chat_messages_member_all on public.chat_messages;

drop policy if exists chat_messages_member_read on public.chat_messages;
create policy chat_messages_member_read on public.chat_messages
  for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

drop policy if exists chat_messages_member_insert_user_only on public.chat_messages;
create policy chat_messages_member_insert_user_only on public.chat_messages
  for insert to authenticated
  with check (
    workspace_id in (select private.current_workspace_ids())
    and role = 'user'
  );

-- No update/delete policy for `authenticated` -- chat_messages becomes
-- append-only. Nothing in this codebase edits or deletes a chat message
-- today; if that ever changes, it needs its own reviewed policy, not a
-- silent re-widening back to `for all`.


-- ═══════════════════════════════════════════════════════════════════════════
-- Grants
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function private.pick_runtime_for(text, text, text) from public, anon, authenticated;
grant usage on schema private to authenticated; -- already granted by 001; explicit here for clarity

revoke all on function public.enqueue_chat_turn(text, text) from public, anon;
grant execute on function public.enqueue_chat_turn(text, text) to authenticated;

revoke all on function public.retry_chat_turn(text, text, text) from public, anon;
grant execute on function public.retry_chat_turn(text, text, text) to authenticated;

-- Service role only -- authenticated holding this would let any signed-in
-- user name another machine's runtime id and forge a chat reply onto any
-- turn assigned to it, same reasoning as claim_runtime_commands/ack_runtime_command.
revoke all on function public.ingest_chat_turn_reply(text, text, integer, text, text, text)
  from public, anon, authenticated;

-- claim_runtime_commands' grants are unchanged by this file (still
-- service-role-only per 009) -- restated here only as a reminder that
-- create-or-replace does not reset grants, so nothing needs re-revoking.

comment on function public.enqueue_chat_turn(text, text) is
  'Creates a chat turn and its user message, then attempts immediate assignment. Never raises for "nothing online" -- parks with a waiting_reason instead. Raises SPG16 (turn already in flight), SPG17 (session not found).';

comment on function public.retry_chat_turn(text, text, text) is
  'Creates a NEW turn (and new user message, copied) targeting the same session as a completed/failed turn, optionally overriding provider/model. Raises SPG16 (turn already in flight), SPG18 (turn not found), SPG19 (not retryable yet).';

comment on function public.ingest_chat_turn_reply(text, text, integer, text, text, text) is
  'Durable write of a chat turn''s streamed or terminal reply, scoped to (turn id, assigned runtime id). Idempotent under a replayed/reordered seq. Only status=succeeded inserts the assistant chat_messages row. Service-role only.';


-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- Function grants (must be f, f for ingest_chat_turn_reply; f, t for the
-- other two, matching 009's own verification pattern):
--
--   select proname,
--          has_function_privilege('anon', oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', oid, 'EXECUTE') as auth
--   from pg_proc
--   where proname in ('enqueue_chat_turn', 'retry_chat_turn', 'ingest_chat_turn_reply');
--
-- RLS policy shape on chat_turns and chat_messages:
--
--   select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'public' and tablename in ('chat_turns', 'chat_messages')
--   order by tablename, cmd;
--
-- Expect exactly one SELECT policy on chat_turns and no INSERT/UPDATE/DELETE;
-- exactly one SELECT and one INSERT policy on chat_messages, no UPDATE/DELETE.
