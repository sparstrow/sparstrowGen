-- 026_chat_attachments_dispatch.sql
--
-- CS5 (Band 26, T-CS5-03) — carries a turn's attachments from upload
-- (T-CS5-02) into its `chat.turn` dispatch payload.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A real ordering bug found while writing this, not assumed away
-- ═══════════════════════════════════════════════════════════════════════════
--
-- T-CS5-02 shipped `postChatTurnAction` inserting `chat_message_attachments`
-- rows AFTER `enqueue_chat_turn` returns. That is wrong: `enqueue_chat_turn`
-- calls `private.assign_or_park_chat_turn` SYNCHRONOUSLY, inside its own
-- transaction (014_chat_turn_dispatch.sql line ~484) -- for the common case
-- (an online runtime available right now), dispatch happens and the payload
-- is built BEFORE `postChatTurnAction`'s later, separate insert ever runs.
-- The attachments array in the payload would be empty every time a runtime
-- was already online, which is the common case, not the edge case.
--
-- Fixed by moving the attachment-row insert INSIDE `enqueue_chat_turn`
-- itself, in the same transaction, before it calls
-- `assign_or_park_chat_turn` -- not by asking the browser to call things in
-- a different order, which would just move the race instead of closing it.
-- `postChatTurnAction`'s own separate insert step (T-CS5-02) is superseded
-- by this and removed in the same change.
--
-- `retry_chat_turn` is NOT extended to carry the original attachments
-- forward to its own new message row, deliberately -- out of this phase's
-- Definition of Done (never mentions retry), and re-attaching stored files
-- to a different message is a product decision (does a retry still "see"
-- the original file, should the owner be told it doesn't) this phase does
-- not answer. A retried turn's `attachments` payload is empty; the turn
-- still runs, it just proceeds without the file. Recorded as a deliberate
-- scope boundary in T-CS5-03's own task file, not a silent gap.
--
-- Apply after 025_chat_attachments_storage.sql.

-- ═══════════════════════════════════════════════════════════════════════════
-- enqueue_chat_turn — gains p_attachments, inserted before dispatch
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adding a parameter changes the function's signature, so `create or
-- replace` on the old 2-arg form would leave a stale duplicate overload
-- behind rather than replacing it -- drop it explicitly first, same
-- reasoning `020_bootstrap_refuses_daemon.sql`'s header gives for replacing
-- a function wholesale. The default value keeps every existing 2-arg caller
-- working unchanged.

drop function if exists public.enqueue_chat_turn(text, text);

create or replace function public.enqueue_chat_turn(
  p_session_id   text,
  p_content      text,
  p_attachments  jsonb default '[]'::jsonb
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

  -- T-CS5-03. In the SAME transaction, before dispatch -- see this file's
  -- header. `att->>'size_bytes'` arrives as text inside jsonb regardless of
  -- how the caller encoded the number; cast explicitly rather than relying
  -- on an implicit conversion `jsonb_array_elements` does not perform.
  insert into public.chat_message_attachments (
    id, workspace_id, message_id, storage_path, filename, mime_type, size_bytes
  )
  select
    'cma_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16),
    v_session.workspace_id,
    v_msg_id,
    att->>'storage_path',
    att->>'filename',
    att->>'mime_type',
    (att->>'size_bytes')::integer
  from pg_catalog.jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as att;

  update public.chat_sessions set last_message_at = pg_catalog.now() where id = v_session.id;

  perform private.assign_or_park_chat_turn(v_turn_id);

  return (select pg_catalog.to_jsonb(t) from public.chat_turns t where t.id = v_turn_id);
end;
$$;

comment on function public.enqueue_chat_turn(text, text, jsonb) is
  'Creates a chat turn, its user message, and any attachment rows in one transaction, then attempts immediate assignment. Never raises for "nothing online" -- parks with a waiting_reason instead. Raises SPG16 (turn already in flight), SPG17 (session not found).';

revoke all on function public.enqueue_chat_turn(text, text, jsonb) from public, anon;
grant execute on function public.enqueue_chat_turn(text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- assign_or_park_chat_turn — embeds the turn's attachments in the payload
-- ═══════════════════════════════════════════════════════════════════════════
--
-- No signed URL here -- see `ChatTurnStartPayload.attachments`'s own TS
-- comment for why: a parked turn can wait indefinitely for
-- `rescan_waiting_chat_turns` to find a runtime, and a short-lived URL
-- minted once here would already have expired by then. Only the durable
-- `storagePath`/`filename` travel; the daemon mints its own signed URL on
-- demand, immediately before downloading (`POST /api/daemon/chat/attachments/sign`).
--
-- Reads whatever `chat_message_attachments` rows already exist for this
-- turn's user message -- inserted by `enqueue_chat_turn` above, in the SAME
-- transaction on first dispatch, or already durable from that same insert
-- by the time a LATER `rescan_waiting_chat_turns` re-invokes this function
-- for a turn that was parked. Same function body handles both cases with
-- no special-casing, because the attachments were never transient.

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
  v_attachments jsonb;
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

    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', m.role, 'content', m.content) order by m.created_at asc)
    into v_messages
    from (
      select role, content, created_at
      from public.chat_messages
      where session_id = v_session.id
      order by created_at desc
      limit 50
    ) m;

    -- T-CS5-03. This turn's user message and its attachments, if any.
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('storagePath', a.storage_path, 'filename', a.filename))
    into v_attachments
    from public.chat_message_attachments a
    join public.chat_messages m on m.id = a.message_id
    where m.turn_id = v_turn.id and m.role = 'user';

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
        'messages',    coalesce(v_messages, '[]'::jsonb),
        'attachments', coalesce(v_attachments, '[]'::jsonb)
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

    update public.chat_turns
    set waiting_reason = v_reason,
        wait_expires_at = coalesce(wait_expires_at, pg_catalog.now() + interval '24 hours'),
        updated_at = pg_catalog.now()
    where id = p_turn_id;
  end if;
end;
$$;

comment on function private.assign_or_park_chat_turn(text) is
  'Dispatches a chat_turns row to an eligible runtime (with a windowed message-history payload and any attachments), or records why it cannot be served yet. Never raises. Not reachable via PostgREST.';

-- ── Verify ──────────────────────────────────────────────────────────────────
--
--   select payload ? 'attachments' from runtime_commands where kind = 'chat.turn' order by created_at desc limit 1;
--   -- expect true; payload->'attachments' is [] for a turn with no files,
--   -- or [{storagePath, filename}, ...] for one with attachments.
--
--   select has_function_privilege('anon', 'public.enqueue_chat_turn(text,text,jsonb)', 'execute'),
--          has_function_privilege('authenticated', 'public.enqueue_chat_turn(text,text,jsonb)', 'execute');
--   -- expect f, t -- same lockdown shape 014 already established.
--
--   select proname, pronargs from pg_proc where proname = 'enqueue_chat_turn';
--   -- expect exactly ONE row, pronargs = 3 -- confirms the old 2-arg
--   -- overload was actually dropped, not left behind alongside the new one.
