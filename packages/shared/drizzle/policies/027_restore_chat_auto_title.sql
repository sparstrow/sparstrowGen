-- 027_restore_chat_auto_title.sql
--
-- T-CS6-02 found US2 dead on this band branch: every new session's title
-- stayed '' (rendered as "New conversation"), which is the exact complaint
-- this whole band exists to fix.
--
-- Cause, and it is worth stating precisely because it will recur otherwise:
-- `public.enqueue_chat_turn` is redefined by FOUR migrations in this repo --
-- 014 (created it), 016, 022, 024 and 026. Each later one was written by
-- copying an EARLIER version of the body and adding to it, rather than
-- adding to the version actually in the database. So:
--
--   022_chat_auto_title.sql       added the title block  (US2 works)
--   024_provider_model_dispatch   re-created from 016's body -> title lost
--   026_chat_attachments_dispatch re-created from 024's body -> still lost
--
-- `create or replace function` is silent about this. Nothing failed, no
-- advisor fired, and both later migrations verified their OWN feature and
-- passed. Only a cross-story pass that re-walked an earlier story's
-- acceptance scenario could catch it, which is what T-CS6-02 is for.
--
-- Confirmed live before writing this: `private.chat_auto_title` exists in
-- the database, and the live `public.enqueue_chat_turn` body contains no
-- occurrence of the string 'title' at all.
--
-- This file re-creates 026's function verbatim -- same 3-arg signature, same
-- attachment insert -- with 022's title block restored in its original
-- position, after `last_message_at` is touched and before dispatch.
--
-- Signature is unchanged from 026, so no `drop function` is needed here.

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

  -- T-CS5-03. In the SAME transaction, before dispatch -- see 026's header.
  -- `att->>'size_bytes'` arrives as text inside jsonb regardless of how the
  -- caller encoded the number; cast explicitly rather than relying on an
  -- implicit conversion `jsonb_array_elements` does not perform.
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

  -- T-CS2-01 (US2), restored. Placed exactly where 022 put it: after the
  -- user message exists and `last_message_at` is touched, before dispatch.
  -- `v_session` is the row as it was READ at the top, so this tests the
  -- pre-update title -- which is what makes "never overwrite a manual
  -- title" hold.
  if v_session.title = '' then
    update public.chat_sessions
    set title = private.chat_auto_title(p_content)
    where id = v_session.id;
  end if;

  perform private.assign_or_park_chat_turn(v_turn_id);

  return (select pg_catalog.to_jsonb(t) from public.chat_turns t where t.id = v_turn_id);
end;
$$;

comment on function public.enqueue_chat_turn(text, text, jsonb) is
  'Creates a chat turn, its user message, and any attachment rows in one transaction, auto-titles a still-untitled session from the first message (US2), then attempts immediate assignment. Never raises for "nothing online" -- parks with a waiting_reason instead. Raises SPG16 (turn already in flight), SPG17 (session not found). NOTE: this function is redefined by several migrations; anything replacing it MUST start from the CURRENT database body, not an older migration file -- 024 and 026 each silently dropped the auto-title block by copying an older version.';
