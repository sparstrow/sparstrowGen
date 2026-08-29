-- 022_chat_auto_title.sql
--
-- T-CS2-01 (Band 26, CS chat session & conversation UX). Ports the
-- title-on-first-message logic `packages/core/src/chat/service.ts`'s local
-- `postChatTurn` already has into the CLOUD dispatch path the browser's
-- `/chat` actually calls — `enqueue_chat_turn` (014_chat_turn_dispatch.sql)
-- has no equivalent, which is why a fresh session's title never updates
-- from "New conversation" in the deployed app.
--
-- `private.chat_auto_title` is its own function (not inlined into
-- `enqueue_chat_turn`) so the truncation logic is independently testable
-- and not duplicated if a second call site ever needs it. Unlike the local
-- path's hard 60-character cut, this trims at a word boundary with an
-- ellipsis — the spec (US2 scenario 3) asks for "short and readable," not
-- "exactly 60 characters."

create or replace function private.chat_auto_title(p_content text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_max constant int := 60;
  v_trimmed text := trim(p_content);
  v_cut text;
  v_last_space int;
begin
  if length(v_trimmed) <= v_max then
    return v_trimmed;
  end if;
  v_cut := substr(v_trimmed, 1, v_max);
  v_last_space := length(v_cut) - position(' ' in reverse(v_cut)) + 1;
  if v_last_space > 1 then
    v_cut := substr(v_cut, 1, v_last_space - 1);
  end if;
  return v_cut || '…';
end;
$$;

comment on function private.chat_auto_title(text) is
  'US2: derives a short, word-boundary-safe title from a chat message''s first line of content. Not reachable via PostgREST (private schema).';

-- `enqueue_chat_turn` (014_chat_turn_dispatch.sql) re-created with one
-- addition: after the user message is inserted and `last_message_at` is
-- touched, a still-untitled session (the column's own '' default) gets its
-- title set from that message, before the turn is dispatched. Every other
-- line is unchanged from 014's version.
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

  if v_session.title = '' then
    update public.chat_sessions
    set title = private.chat_auto_title(p_content)
    where id = v_session.id;
  end if;

  perform private.assign_or_park_chat_turn(v_turn_id);

  return (select pg_catalog.to_jsonb(t) from public.chat_turns t where t.id = v_turn_id);
end;
$$;

comment on function public.enqueue_chat_turn(text, text) is
  'Inserts a user chat message + waiting turn, auto-titles a still-untitled session from it (US2), and dispatches. Never raises for "nothing is online" (DD-3) -- a waiting turn with a waitingReason comes back instead.';

-- ── Verify ──────────────────────────────────────────────────────────────────
--
--   select private.chat_auto_title('short');                        -- 'short'
--   select private.chat_auto_title(repeat('word ', 20));             -- ≤61 chars, ends in '…', no mid-word cut
--   -- live: create a session, send a first message, confirm chat_sessions.title
--   -- updates in the same call; rename a session then send a message, confirm
--   -- the manual title is not overwritten.
