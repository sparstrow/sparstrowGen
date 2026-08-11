-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase Realtime publication — board-level change notifications.
--
-- These are the tables whose row changes the web UI reacts to by invalidating a
-- React Query key (see apps/web/src/components/providers.tsx). The payload is
-- only a signal; the client refetches.
--
-- Apply AFTER the drizzle migration. See ./README.md for order.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Deliberately EXCLUDED ──────────────────────────────────────────────────
--
-- run_events — live transcript deltas ride a Realtime BROADCAST channel, not
--   postgres_changes. Publishing them here would deliver every event twice and
--   spend the entire 2M message/month budget on transcripts: measured volume is
--   ~23 events per run, so the publication alone would carry the full stream
--   while the broadcast path carried it again.
--
-- system_health — no such table exists. The previous hand-written migration
--   listed it, which made the whole ALTER PUBLICATION statement fail; the UI's
--   `system_health` subscription in providers.tsx is a leftover from when core
--   pushed health over its local /ws and needs rewiring, not a publication row.
--
-- daemon_tokens, pairing_codes — credentials. Never broadcast.

do $$
declare
  t text;
  realtime_tables text[] := array[
    'runs',
    'tasks',
    'task_questions',
    'goals',
    'plan_nodes',
    'messages',
    'chat_messages',
    'chat_sessions',
    'runtimes',
    'runtime_projects',
    'memory_contradictions'
  ];
begin
  foreach t in array realtime_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'realtime target table public.% does not exist', t;
    end if;

    -- ADD TABLE errors if the table is already published, so this is guarded
    -- to keep the script rerunnable.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Replica identity is intentionally left at DEFAULT (primary key only).
-- REPLICA IDENTITY FULL would ship every old column value on each UPDATE and
-- DELETE; the client only needs "this row changed, refetch it", so the extra
-- WAL volume and payload size would buy nothing.
