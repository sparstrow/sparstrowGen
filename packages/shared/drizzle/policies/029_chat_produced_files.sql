-- 029_chat_produced_files.sql
--
-- AM1 (band 27, T-AM1-03) -- files an AGENT hands back during a chat turn.
-- `ingest_chat_turn_reply` gains a `p_produced` parameter and binds each
-- produced file to the assistant message it creates, the same shape
-- `026_chat_attachments_dispatch.sql` already established for the OWNER's
-- own attachments on `enqueue_chat_turn`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Two corrections made BEFORE writing this file, recorded because the
-- planning docs originally got both wrong
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. `ingest_chat_turn_reply` has NO clobber history. It is defined exactly
--    once, in `014_chat_turn_dispatch.sql` -- the function that actually got
--    silently reverted three times is the DIFFERENT function
--    `enqueue_chat_turn` (see `027_restore_chat_auto_title.sql`). This is
--    this function's SECOND definition, not a fourth. The habit of dumping
--    the live body before writing `create or replace` is followed anyway, on
--    principle -- confirmed via `select pg_get_functiondef(oid) from pg_proc
--    where proname = 'ingest_chat_turn_reply'` against staging
--    (pnymngoqseltgigcfevq) immediately before writing this file, and it
--    matches `014`'s body exactly, with no drift.
--
-- 2. This migration is numbered 029, not 028. Staging already has an
--    APPLIED migration named `028_restore_no_invented_names_after_020_regression`
--    that does not exist on `development` or on this band's branch -- it came
--    from an unrelated, unmerged branch that wrote directly to the live
--    database (staging AND prod, per its own commit message) with no PR.
--    Not this task's problem to fix, but `028` is not a safe number to reuse.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Why `drop function` first, not just `create or replace`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Same reasoning `026_chat_attachments_dispatch.sql`'s header gives for
-- `enqueue_chat_turn`: adding a parameter changes the function's signature,
-- so `create or replace` on the old 6-arg form would leave a stale duplicate
-- overload behind rather than replacing it, and PostgREST's RPC resolution
-- would then have two same-named functions to disambiguate between. Drop the
-- old signature explicitly first. The new parameter defaults to `'[]'::jsonb`,
-- so every existing 6-arg caller keeps working unchanged.

drop function if exists public.ingest_chat_turn_reply(text, text, integer, text, text, text);

create or replace function public.ingest_chat_turn_reply(
  p_turn_id     text,
  p_runtime_id  text,
  p_seq         integer,
  p_reply_text  text,
  p_status      text,
  p_error       text default null,
  p_produced    jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turn public.chat_turns%rowtype;
  v_message_id text;
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

  -- AM1 (T-AM1-03), phase decision 3 + FR-013: the message is created when
  -- the turn succeeded OR when it failed having produced something -- partial
  -- work is not thrown away. A `failed` turn's own status/error (set above)
  -- is untouched by this; the message is additional, not a re-classification.
  if p_status = 'succeeded' or pg_catalog.jsonb_array_length(coalesce(p_produced, '[]'::jsonb)) > 0 then
    v_message_id := 'msg_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16);

    insert into public.chat_messages (id, workspace_id, session_id, role, content, turn_id, meta)
    values (
      v_message_id,
      v_turn.workspace_id, v_turn.session_id, 'assistant', p_reply_text, p_turn_id,
      pg_catalog.jsonb_build_object('provider', v_turn.provider, 'model', v_turn.model)
    );

    -- Bind each produced file to the message just created. `role = 'assistant'`
    -- on that message is what tells a produced file from an owner-attached one
    -- apart at read time -- deliberately no `uploader_type` column (plan,
    -- Decision 2). `f->>'size_bytes'` arrives as text inside jsonb regardless
    -- of how the daemon encoded the number; cast explicitly, same reasoning
    -- `026`'s own attachment insert gives for its identical cast.
    insert into public.chat_message_attachments (
      id, workspace_id, message_id, storage_path, filename, mime_type, size_bytes
    )
    select
      'cma_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16),
      v_turn.workspace_id,
      v_message_id,
      f->>'storage_path',
      f->>'filename',
      f->>'mime_type',
      (f->>'size_bytes')::integer
    from pg_catalog.jsonb_array_elements(coalesce(p_produced, '[]'::jsonb)) as f;

    update public.chat_sessions set last_message_at = pg_catalog.now() where id = v_turn.session_id;
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'alreadyCompleted', false);
end;
$function$;

-- Same lockdown as `014`'s original grant: service-role only. A workspace
-- member holding this would let them name another machine's runtime id and
-- forge a chat reply -- and now also forge produced-file rows -- onto any
-- turn assigned to it. `create or replace` does not reset grants, but the
-- signature changed (the drop above removed them), so they are restated here
-- rather than assumed to have survived.
revoke all on function public.ingest_chat_turn_reply(text, text, integer, text, text, text, jsonb)
  from public, anon, authenticated;

-- Warns the NEXT agent, not just this one -- the exact habit that would have
-- prevented `enqueue_chat_turn`'s three-times clobber if it had existed
-- there from the start. See `027_restore_chat_auto_title.sql`'s identical
-- comment on its neighbour.
comment on function public.ingest_chat_turn_reply(text, text, integer, text, text, text, jsonb) is
  'Durable write of a chat turn''s streamed or terminal reply, scoped to (turn id, assigned runtime id). Idempotent under a replayed/reordered seq. Creates the assistant chat_messages row when status=succeeded OR when p_produced is non-empty (partial work survives a failed turn, FR-013); binds each p_produced entry to that message via chat_message_attachments. Service-role only. WARNING: before replacing this function again, dump its CURRENT database body (`select pg_get_functiondef(oid) from pg_proc where proname = ''ingest_chat_turn_reply''`) and start from that text, not from this migration file -- a later migration copying an OLDER file''s body is exactly how enqueue_chat_turn silently lost its auto-title block three times.';

-- ── Verify after applying ────────────────────────────────────────────────────
--
--   select proname, pronargs from pg_proc where proname = 'ingest_chat_turn_reply';
--   -- expect exactly ONE row, pronargs = 7 -- confirms the old 6-arg
--   -- overload was actually dropped, not left behind alongside the new one.
--
--   select has_function_privilege('anon', 'public.ingest_chat_turn_reply(text,text,integer,text,text,text,jsonb)', 'execute'),
--          has_function_privilege('authenticated', 'public.ingest_chat_turn_reply(text,text,integer,text,text,text,jsonb)', 'execute');
--   -- expect f, f -- service-role only, matching 014's original shape.
--
--   -- A files-only turn (no text, one produced file) creates a message with
--   -- empty content and one bound attachment:
--   select m.content, a.filename
--   from public.chat_messages m
--   join public.chat_message_attachments a on a.message_id = m.id
--   where m.role = 'assistant'
--   order by m.created_at desc limit 5;
