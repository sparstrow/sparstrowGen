-- 018_terminal_channels.sql
--
-- M16, T-M16-03. Who may listen to, and who may send on, the two terminal
-- Realtime channels — the control channel (`machine:<workspace_id>:<runtime_id>`)
-- and a session's own bytes
-- (`terminal:<workspace_id>:<runtime_id>:<session_id>`). Topic helpers and
-- event constants: packages/shared/src/cloud.ts. Message shapes:
-- packages/shared/src/schemas/terminal.ts.
--
-- ── This file is the BROWSER's half only ────────────────────────────────────
--
-- Amended by T-DI-01. The machine's half — a daemon publishing `reply` and
-- `output` — lives in 019_daemon_realtime_identity.sql and is the mirror
-- image of this file: the same topics, the opposite two events, resolved
-- through `private.current_daemon_scope()` instead of admin membership.
-- Read the two together; neither is the whole picture.
--
-- The session topic gained a runtime id (plan decision DI-2) so 019's `output`
-- policy can confine a machine to its OWN sessions. A session id is
-- machine-local and D-26 means no cloud row exists to join it against, so
-- without it the machine-side check could only reach "some daemon in this
-- workspace". **Nothing in THIS file checks the runtime id**: an admin may
-- already reach every machine in their workspace, and narrowing that here
-- would be a behaviour change smuggled into a rename.
--
-- ── Why this file grants a client send right at all ─────────────────────────
--
-- 010 and 015 each carry a deliberate "no insert policy" — a client able to
-- write to those channels could forge agent output or a chat reply the
-- browser cannot tell from the real thing. That reasoning is KEPT here, not
-- overridden: this file still refuses to let a client publish machine
-- REPLIES or terminal OUTPUT. What it adds is narrower than either — a client
-- may send a terminal keystroke (`input`) or a control REQUEST (`request`),
-- both of which only ever act on a machine the sender is already an admin
-- of. Sending one is not materially different from what that admin could
-- already do by opening a shell on the machine directly; it is the transport
-- that is new, not the privilege.
--
-- ── Why ADMIN, not member ────────────────────────────────────────────────────
--
-- The first channel policy in this app gating on role rather than plain
-- workspace membership. `private.current_admin_workspace_ids()` (001) is the
-- same helper the M18 access-model policies use (017) — a machine's shell is
-- reachable by workspace admins, not every member, per that phase's US4.
--
-- ── Why the event pin is the whole reason a send policy is safe here ────────
--
-- Without `event = 'input'` / `event = 'request'`, an admin's own client
-- could publish an `output` or `reply` message and forge what another tab
-- watching the same channel displays — exactly the forgery 010's header
-- warns a send policy invites. With it, the only things a client can put on
-- the wire are a keystroke on a machine it may already open a shell on, and a
-- control request the machine is free to refuse on its own terms. Confirmed
-- against the Realtime schema (supabase/realtime's `Realtime.Api.Message`
-- schema) that `realtime.messages` carries an `event` column holding the
-- broadcast event name verbatim — see Result in T-M16-03 for how this was
-- checked, since this project has no live query access from the agent that
-- wrote this file.
--
-- ── Why the workspace id is in the topic ─────────────────────────────────────
--
-- Same shape as 010 and 015: a membership check with no join. The id in the
-- topic is NOT what grants access — these four policies are. A non-admin, or
-- an admin of a different workspace, who guesses or is told a topic is
-- refused at both subscribe and send.
--
-- Apply AFTER 001 (private.current_admin_workspace_ids) and 017 (the access
-- model these policies borrow their role check from). See ./README.md.

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass) then
    raise exception
      'RLS is disabled on realtime.messages — every private channel is readable by anyone. '
      'Re-enable it from the Supabase dashboard before applying this policy, which would '
      'otherwise give false assurance.';
  end if;
end $$;

drop policy if exists "terminal_channel_admin_read" on realtime.messages;
drop policy if exists "machine_channel_admin_read" on realtime.messages;
drop policy if exists "terminal_channel_admin_send" on realtime.messages;
drop policy if exists "machine_channel_admin_send" on realtime.messages;

create policy "terminal_channel_admin_read"
on realtime.messages
for select
to authenticated
using (
  -- Scoped to terminal-session channels only — 010's and 015's header make
  -- the same point: a policy authorising every topic shaped like anything
  -- would silently grant those too.
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'terminal'
  and split_part(realtime.topic(), ':', 2) in (select private.current_admin_workspace_ids())
);

create policy "machine_channel_admin_read"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'machine'
  and split_part(realtime.topic(), ':', 2) in (select private.current_admin_workspace_ids())
);

create policy "terminal_channel_admin_send"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'terminal'
  and split_part(realtime.topic(), ':', 2) in (select private.current_admin_workspace_ids())
  -- Load-bearing, not decoration: this is what stops the same admin from
  -- publishing `output` and forging another tab's terminal display.
  and realtime.messages.event = 'input'
);

create policy "machine_channel_admin_send"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'machine'
  and split_part(realtime.topic(), ':', 2) in (select private.current_admin_workspace_ids())
  -- Stops the same admin from publishing `reply` and forging a machine's
  -- answer to a control request it never actually received.
  and realtime.messages.event = 'request'
);

-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- Rerunnable: `enable row level security` is idempotent and every policy is
-- dropped before it is recreated. Applying this file twice is a no-op.
--
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'realtime' and tablename = 'messages';
--
-- Expect six rows from 010, 015 and this file: `transcript_broadcast_member_read`
-- (010, SELECT), `chat_turn_broadcast_member_read` (015, SELECT), and this
-- file's four — `terminal_channel_admin_read` / `machine_channel_admin_read`
-- (SELECT), `terminal_channel_admin_send` / `machine_channel_admin_send`
-- (INSERT). **Ten once 019 is applied**, which adds the machine's four.
-- Confirm the project ref before and after running this — applying to the
-- wrong project succeeds silently and returns the same rows there too.
--
-- Negative tests both directions, both channels (`r` below is any runtime id —
-- these policies deliberately do not look at it):
--   * a non-admin member of workspace A: SELECT and INSERT on
--     `terminal:<A>:r:x` / `machine:<A>:r` both refused
--   * an admin of A: SELECT and INSERT on `terminal:<A>:r:x` / `machine:<A>:r`
--     both succeed
--   * an admin of workspace B: SELECT and INSERT on an A topic refused,
--     regardless of B's own admin status
--   * an admin of A inserting `event = 'output'` on `terminal:<A>:r:x`, or
--     `event = 'reply'` on `machine:<A>:r`, is refused; the same admin
--     inserting `event = 'input'` / `event = 'request'` succeeds
--
-- The live browser-side assertion — a real second session refused at
-- subscribe and at send — is T-M16-06 §D, matching T-M5-06 §E and T-M12-06's
-- precedent.
