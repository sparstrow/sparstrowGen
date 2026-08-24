-- 015_chat_broadcast.sql
--
-- M12. Who may listen to a chat turn's live reply.
--
-- Same dual-path shape as 010_transcript_broadcast.sql: every ingest call
-- writes durably to public.chat_turns AND fans out as a Realtime BROADCAST on
-- `chat:<workspace_id>:<session_id>`. This file governs the SUBSCRIBE side.
--
-- ── Who sends ───────────────────────────────────────────────────────────────
--
-- Only /api/daemon/chat/turns/:id/events and .../result, with the service
-- role, after a bearer token has already been resolved to a runtime and a
-- workspace. The service role bypasses RLS, so there is deliberately NO
-- insert policy below.
--
-- That absence is the point, not an omission -- see 010's header for the full
-- reasoning, which applies unchanged: a client able to write to a chat
-- channel could forge a reply the browser cannot distinguish from a real one.
--
-- ── Why the topic is per SESSION, not per turn ──────────────────────────────
--
-- doc/plans/2026-08-23-chat-message-sending.md DD-10: navigating within a
-- conversation should not churn channels, and a retry's deltas should arrive
-- on the channel already open. The workspace id in the topic is what grants
-- access (this policy), not the session id -- same shape as 010, and for the
-- same reason: a per-session check would add no real access control, since
-- any workspace member can already SELECT any chat_turns/chat_sessions row in
-- that workspace via RLS.
--
-- Apply AFTER 001 (which creates private.current_workspace_ids) and 014
-- (chat_turns' own RLS). See ./README.md.

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass) then
    raise exception
      'RLS is disabled on realtime.messages — every private channel is readable by anyone. '
      'Re-enable it from the Supabase dashboard before applying this policy, which would '
      'otherwise give false assurance.';
  end if;
end $$;

drop policy if exists "chat_turn_broadcast_member_read" on realtime.messages;

create policy "chat_turn_broadcast_member_read"
on realtime.messages
for select
to authenticated
using (
  -- Scoped to chat channels only -- a policy authorising every topic shaped
  -- like anything would silently grant those too. 010 makes the same point.
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'chat'
  and split_part(realtime.topic(), ':', 2) in (select private.current_workspace_ids())
);

-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- Rerunnable: `enable row level security` is idempotent and the policy is
-- dropped first. Applying this twice is a no-op.
--
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'realtime' and tablename = 'messages';
--
-- Expect one row for `transcript_broadcast_member_read` (010) and one for
-- `chat_turn_broadcast_member_read` (this file), both cmd 'SELECT'. Any
-- INSERT policy on this table is a finding, not a feature.
--
-- The live cross-workspace assertion -- a member of B subscribing to an A
-- topic is refused, a member of A is not -- is T-M12-06's, matching M5's
-- T-M5-06 §E precedent.
