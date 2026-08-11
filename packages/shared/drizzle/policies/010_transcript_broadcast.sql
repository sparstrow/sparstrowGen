-- 010_transcript_broadcast.sql
--
-- M5. Who may listen to a run's live transcript.
--
-- Transcripts take a dual path: every batch is written durably to
-- public.run_events AND fanned out as a Realtime BROADCAST on
-- `run:<workspace_id>:<run_id>`. This file governs the second half — and only
-- the SUBSCRIBE side of it.
--
-- ── Who sends ───────────────────────────────────────────────────────────────
--
-- Only /api/daemon/runs/:id/events, with the service role, after a bearer token
-- has already been resolved to a runtime and a workspace. The service role
-- bypasses RLS, so there is deliberately NO insert policy below.
--
-- That absence is the point, not an omission. A client able to write to a
-- transcript channel could forge agent output, and the browser merges broadcast
-- events into the same list as fetched ones — a forged event would be
-- indistinguishable from a real one in the UI. If you are adding an insert
-- policy here, stop.
--
-- The daemon itself never touches Realtime. It has no auth.uid(), so giving it
-- send rights would mean a second authentication model for it — a custom
-- runtime_id JWT, a minting endpoint, a refresh timer, and policies below that
-- understand two kinds of principal. See doc/tasks/M5/README.md decision 1, and
-- D-10 for the dispatch doorbell that decision leaves parked.
--
-- ── Why the workspace id is in the topic ────────────────────────────────────
--
-- So this policy is a membership check with no join, exactly like every policy
-- in 001. `run:<run_id>` alone would force a join against public.runs on every
-- subscribe, and a workspace-wide topic would deliver every run's transcript to
-- every open tab in that workspace.
--
-- The id in the topic is NOT what grants access. This policy is. A non-member
-- who guesses or is told a topic is refused at subscribe.
--
-- Apply AFTER 001 (which creates private.current_workspace_ids). See ./README.md.

-- Realtime Authorization is enforced by RLS on realtime.messages. Without RLS
-- enabled there, `private: true` channels are NOT actually private and the
-- policy below is decoration.
--
-- Supabase enables it on the table by default and owns the table as
-- `supabase_realtime_admin`, which `postgres` is not a member of — so this
-- cannot turn it on, only refuse to proceed if someone has turned it off.
-- Creating the policy itself does not require ownership; the ALTER would.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass) then
    raise exception
      'RLS is disabled on realtime.messages — every private channel is readable by anyone. '
      'Re-enable it from the Supabase dashboard before applying this policy, which would '
      'otherwise give false assurance.';
  end if;
end $$;

drop policy if exists "transcript_broadcast_member_read" on realtime.messages;

create policy "transcript_broadcast_member_read"
on realtime.messages
for select
to authenticated
using (
  -- Scope this policy to the transcript channels only. Other features may add
  -- their own topics later, and a policy that authorised every topic shaped
  -- like anything would silently grant them too.
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'run'
  -- `in (select ...)` and not `= any(...)` or a function taking the value as an
  -- argument: the set-returning form is hoisted into a single InitPlan. 001
  -- documents why at length; the shape is load-bearing, not stylistic.
  and split_part(realtime.topic(), ':', 2) in (select private.current_workspace_ids())
);

-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- Rerunnable: `enable row level security` is idempotent and the policy is
-- dropped first. Applying this twice is a no-op.
--
-- After applying, confirm the policy exists and that nothing granted an insert
-- path alongside it:
--
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'realtime' and tablename = 'messages';
--
-- Expect exactly one row for `transcript_broadcast_member_read` with cmd
-- 'SELECT'. Any INSERT policy on this table is a finding, not a feature.
--
-- The live cross-workspace assertion — a member of B subscribing to an A topic
-- is refused, and a member of A is not — is T-M5-06 §E. A policy that denies
-- everyone passes half of that test on its own, which is why both halves are
-- asserted.
