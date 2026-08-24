-- 016_chat_turn_transcript.sql
--
-- M12, T-M12-04. `014_chat_turn_dispatch.sql`'s `chat.turn` command payload
-- carried turnId/sessionId/agent+project ids+slugs/provider/model/attempt --
-- everything DD-6 needs for the daemon to resolve WHO answers, but nothing
-- for WHAT the conversation actually said. A daemon has no local record of a
-- cloud session's `chat_messages` (they live in Postgres, not this machine's
-- SQLite) and per the phase's own Trap must never be given one to write into
-- -- the transcript the daemon needs to build a prompt from has to travel IN
-- the command payload itself, the same way `start_run`'s payload already
-- carries the full `prompt` string rather than making the daemon fetch it.
--
-- Discovered while building T-M12-04 (the executor that actually needs this
-- data), not at spec time -- recorded here rather than silently worked around
-- with a second HTTP round trip, which would be a second way to get the same
-- fact and a second thing to keep in sync with `chat_messages`' own RLS.
--
-- Windowed to the last 50 messages, DESCENDING then re-ordered ascending in
-- the same query -- a `limit` on an ascending scan would keep the OLDEST 50
-- instead of the newest. 50 rather than the local `TRANSCRIPT_WINDOW` (40):
-- `buildTranscriptPrompt` (packages/core/src/chat/service.ts) already does
-- its own count- and byte-budget trim on whatever it is handed, so this only
-- needs to be "comfortably more than the daemon will actually use," not the
-- exact final window -- the daemon's existing, unmodified function is what
-- performs the real trim.
--
-- Only `private.assign_or_park_chat_turn` changes; `enqueue_chat_turn`,
-- `retry_chat_turn`, `rescan_waiting_chat_turns`, `ingest_chat_turn_reply`,
-- `claim_runtime_commands` are untouched -- the user/assistant message rows
-- those functions already write are exactly what this SELECT reads back.

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
  v_messages    jsonb;
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

    -- Newest 50 first (so LIMIT keeps the right end of the conversation),
    -- then re-aggregated oldest-first -- a prompt built newest-first would
    -- read backwards.
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', m.role, 'content', m.content) order by m.created_at asc)
    into v_messages
    from (
      select role, content, created_at
      from public.chat_messages
      where session_id = v_session.id
      order by created_at desc
      limit 50
    ) m;

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
        'attempt',     v_turn.attempt,
        'messages',    coalesce(v_messages, '[]'::jsonb)
      ),
      'pending',
      'chat.turn:' || v_turn.id
    )
    on conflict (idempotency_key) do nothing;

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
  'Dispatches a chat_turns row to an eligible runtime (with a windowed message-history payload), or records why it cannot be served yet. Never raises. Not reachable via PostgREST.';

-- ── Verify ──────────────────────────────────────────────────────────────────
--
--   select payload ? 'messages' from runtime_commands where kind = 'chat.turn' order by created_at desc limit 1;
--   -- expect true, and payload->'messages' to be an ascending-by-time array.
