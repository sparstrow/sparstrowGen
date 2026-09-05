-- 035_chat_turn_activities.sql
--
-- Exposes background agent activities (thinking, tool use, tool results, status)
-- in the chat stream and message history.
--
-- 1. Adds `activities` jsonb column to `chat_turns` (default '[]'::jsonb).
-- 2. Updates `ingest_chat_turn_reply` to accept `p_activities jsonb default '[]'::jsonb`.
-- 3. Attaches activities to `chat_messages.meta` when the turn completes.

alter table public.chat_turns
  add column if not exists activities jsonb not null default '[]'::jsonb;

drop function if exists public.ingest_chat_turn_reply(text, text, integer, text, text, text);
drop function if exists public.ingest_chat_turn_reply(text, text, integer, text, text, text, jsonb);
drop function if exists public.ingest_chat_turn_reply(text, text, integer, text, text, text, jsonb, jsonb);

create or replace function public.ingest_chat_turn_reply(
  p_turn_id     text,
  p_runtime_id  text,
  p_seq         integer,
  p_reply_text  text,
  p_status      text,
  p_error       text default null,
  p_produced    jsonb default '[]'::jsonb,
  p_activities  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turn public.chat_turns%rowtype;
  v_message_id text;
  v_final_activities jsonb;
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

  v_final_activities := case
    when p_activities is not null and pg_catalog.jsonb_array_length(p_activities) > 0 then p_activities
    else coalesce(v_turn.activities, '[]'::jsonb)
  end;

  update public.chat_turns
  set reply_text = p_reply_text,
      reply_seq = p_seq,
      status = case p_status when 'running' then 'in_progress' else p_status end,
      error = nullif(p_error, ''),
      activities = v_final_activities,
      finished_at = case when p_status in ('succeeded', 'failed') then pg_catalog.now() else finished_at end,
      updated_at = pg_catalog.now()
  where id = p_turn_id;

  -- Create assistant message if succeeded or if partial files were produced
  if p_status = 'succeeded' or pg_catalog.jsonb_array_length(coalesce(p_produced, '[]'::jsonb)) > 0 then
    v_message_id := 'msg_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16);

    insert into public.chat_messages (id, workspace_id, session_id, role, content, turn_id, meta)
    values (
      v_message_id,
      v_turn.workspace_id, v_turn.session_id, 'assistant', p_reply_text, p_turn_id,
      pg_catalog.jsonb_build_object(
        'provider', v_turn.provider,
        'model', v_turn.model,
        'activities', v_final_activities
      )
    );

    insert into public.chat_message_attachments (
      id, workspace_id, message_id, storage_path, filename, mime_type, size_bytes
    )
    select
      'cma_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16),
      v_turn.workspace_id,
      v_message_id,
      coalesce(f->>'storage_path', f->>'storagePath'),
      coalesce(f->>'filename', f->>'fileName'),
      coalesce(f->>'mime_type', f->>'mimeType'),
      coalesce(f->>'size_bytes', f->>'sizeBytes')::integer
    from pg_catalog.jsonb_array_elements(coalesce(p_produced, '[]'::jsonb)) as f;

    update public.chat_sessions set last_message_at = pg_catalog.now() where id = v_turn.session_id;
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'alreadyCompleted', false);
end;
$function$;

revoke all on function public.ingest_chat_turn_reply(text, text, integer, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_chat_turn_reply(text, text, integer, text, text, text, jsonb, jsonb) to service_role;

comment on function public.ingest_chat_turn_reply(text, text, integer, text, text, text, jsonb, jsonb) is
  'Durable write of a chat turn''s streamed or terminal reply and background activities (thinking, tool calls). Idempotent under replayed seq. Persists activities to chat_turns and chat_messages.meta.';
