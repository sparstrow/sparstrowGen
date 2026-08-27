-- 019_daemon_realtime_identity.sql
--
-- DI, T-DI-02. The MACHINE's half of the terminal channels — the mirror image
-- of 018, which is the browser's half. Read the two together; neither is the
-- whole picture.
--
--   018  browser → may send `request` (control) and `input` (session)
--   019  machine → may send `reply`   (control) and `output` (session)
--
-- Plan: doc/plans/2026-08-27-the-daemon-gets-a-real-identity.md, decisions
-- DI-1, DI-3 and DI-5.
--
-- ── Why this file exists at all ──────────────────────────────────────────────
--
-- M16 shipped a daemon credential that could never have worked, for two
-- independent reasons found together on 2026-08-27:
--
--   1. It was self-signed with a key this project cannot obtain. Supabase
--      never exposes the private half of an asymmetric signing key —
--      confirmed in the dashboard on both the current ES256 key and a freshly
--      created standby one. (doc/KnownGaps.md G-48.)
--   2. Even correctly signed, it carried **no `sub`** — a deliberate choice,
--      to avoid `auth.uid()` raising on its uuid cast for a nanoid runtime id.
--      But 018's four policies resolve the caller through
--      `private.current_admin_workspace_ids()`, which is a workspace_members
--      lookup keyed on exactly that. No `sub` ⇒ `auth.uid()` null ⇒ zero rows
--      ⇒ refused, unconditionally, for all four.
--      (doc/bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md.)
--
-- The fix for both is one thing: give the daemon a real Supabase Auth identity,
-- so Supabase signs its token and `auth.uid()` resolves. A Supabase user id IS
-- a uuid, so reason 2's cast hazard disappears rather than being worked around.
--
-- ── Why this identity is NOT a workspace member ──────────────────────────────
--
-- doc/tasks/M3/README.md decision 1 rejected giving a runtime a real auth user,
-- on the grounds that it "would make it look like a member, which grants the
-- whole workspace." That objection is correct and is respected here, not
-- overridden: **this identity is never inserted into workspace_members.**
--
-- With no membership row, `private.current_workspace_ids()` returns nothing for
-- it, so every table policy 001 wrote denies it exactly as it denies an
-- anonymous caller, and 010/015 deny it on run transcripts and chat. It is an
-- identity with zero inherited privilege. The only thing it can do is what the
-- four policies below say, on its own machine's two topics.
--
-- A Custom Access Token Hook injecting workspace_id/runtime_id claims was
-- considered and rejected: a hook runs against EVERY token the project mints,
-- so a scoping mistake in it is a claim-injection bug on ordinary human
-- sessions. A mapping table read by one SECURITY DEFINER helper achieves the
-- same result with a blast radius of one function.
--
-- ── Why the event pin is load-bearing here too ───────────────────────────────
--
-- Same argument 018's header makes, pointing the other way. Without
-- `event = 'reply'` / `event = 'output'`, a compromised machine could publish
-- `input` onto its own session topic and forge what the operator appears to
-- have typed, or `request` onto its control topic. Pinning the event means the
-- only things a machine can put on the wire are the two kinds a machine is
-- supposed to produce.
--
-- Apply AFTER 001 (the private schema and its helpers), 004 (bootstrap, which
-- 020 then guards) and 018. See ./README.md.

-- ── The identity map ─────────────────────────────────────────────────────────
--
-- **In `public`, with RLS on and ZERO policies** — not a column on `runtimes`,
-- and not in `private`. Both alternatives were tried first:
--
--   * A column on `runtimes` is wrong: that table is readable by every
--     workspace member, so it would hand every member the daemon's identity.
--   * `private` is where 001 puts things only policies should read, and was
--     the obvious home — but PostgREST only exposes configured schemas, so a
--     table there is unreachable by supabase-js. The token route (T-DI-03)
--     resolves-or-creates this mapping with the service-role client, exactly
--     as `auth.ts` already reads `daemon_tokens`, and could not do so.
--
-- `public` + RLS + no policies is equally closed and actually usable: RLS with
-- no policy denies every `anon` and `authenticated` caller by default, and
-- `service_role` bypasses RLS. The explicit revoke below makes that intent
-- legible rather than inherited, per the Supabase security checklist's rule
-- that every table in an exposed schema has RLS enabled.
--
-- `runtime_id` is UNIQUE because one machine has exactly one identity — that is
-- what lets the token route treat creation as an upsert rather than a
-- check-then-insert race (T-DI-03).
--
-- Every FK cascades: removing a machine (or its workspace) removes the mapping,
-- and `current_daemon_scope()` then returns nothing for that auth user forever.

create table if not exists public.daemon_identities (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  runtime_id   text not null unique references public.runtimes(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now()
);

alter table public.daemon_identities enable row level security;

-- No policies, deliberately: nothing but the service role may read or write
-- this. Unlike every other table in this directory, there is no member-scoped
-- policy to add — a workspace member has no business knowing which auth user
-- backs their machine.
revoke all on public.daemon_identities from anon, authenticated;

-- ── The lookup ───────────────────────────────────────────────────────────────
--
-- Shaped exactly like `private.current_admin_workspace_ids()` in 001 — same
-- schema, same `stable`, same `security definer`, same `set search_path = ''`,
-- and `(select auth.uid())` wrapped in a scalar subquery so it is evaluated
-- once per statement rather than once per candidate row.
--
-- SECURITY DEFINER is load-bearing for correctness, not just speed: this reads
-- public.daemon_tokens and public.daemon_identities, both of which have RLS
-- enabled — and daemon_identities has no policies at all. An INVOKER function
-- would find nothing in either, for every caller.
--
-- **Revocation is enforced HERE, which is why nothing else has to clean up.**
-- The `exists` requires a live (non-revoked) token, so revoking a pairing cuts
-- Realtime access at the next policy evaluation. Note it tests
-- `revoked_at is null` on SOME token rather than the absence of any revoked
-- token: re-pairing leaves the old revoked row in place next to the new live
-- one, and the inverted form would deny a legitimately re-paired machine
-- forever.

create or replace function private.current_daemon_scope()
returns table (workspace_id text, runtime_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select di.workspace_id, di.runtime_id
  from public.daemon_identities di
  where di.user_id = (select auth.uid())
    and exists (
      select 1
      from public.daemon_tokens dt
      where dt.runtime_id = di.runtime_id
        and dt.revoked_at is null
    );
$$;

-- ── The policies ─────────────────────────────────────────────────────────────
--
-- Each checks the PAIR (workspace, runtime) from the topic against the
-- caller's own scope, so a machine is confined to its own topics — not merely
-- to its workspace's. That is what T-DI-01's topic change bought: without the
-- runtime id in the session topic, the `output` policy below could only have
-- reached "some daemon in this workspace", letting one of the owner's machines
-- publish onto another of their machines' sessions.
--
--   machine:<workspace_id>:<runtime_id>              → parts 2, 3
--   terminal:<workspace_id>:<runtime_id>:<session_id> → parts 2, 3

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass) then
    raise exception
      'RLS is disabled on realtime.messages — every private channel is readable by anyone. '
      'Re-enable it from the Supabase dashboard before applying this policy, which would '
      'otherwise give false assurance.';
  end if;
end $$;

drop policy if exists "machine_channel_daemon_read" on realtime.messages;
drop policy if exists "machine_channel_daemon_send" on realtime.messages;
drop policy if exists "terminal_channel_daemon_read" on realtime.messages;
drop policy if exists "terminal_channel_daemon_send" on realtime.messages;

-- A machine listens to its own control topic for `request`. It has no reason to
-- read any other machine's anything, and SELECT here is what gates SUBSCRIBE —
-- a looser read policy would be a machine able to watch another machine's
-- session.
create policy "machine_channel_daemon_read"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'machine'
  and (split_part(realtime.topic(), ':', 2), split_part(realtime.topic(), ':', 3))
      in (select workspace_id, runtime_id from private.current_daemon_scope())
);

create policy "machine_channel_daemon_send"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'machine'
  and (split_part(realtime.topic(), ':', 2), split_part(realtime.topic(), ':', 3))
      in (select workspace_id, runtime_id from private.current_daemon_scope())
  -- Stops a compromised machine publishing `request` and driving its own
  -- control channel as though it were the operator's browser.
  and realtime.messages.event = 'reply'
);

create policy "terminal_channel_daemon_read"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'terminal'
  and (split_part(realtime.topic(), ':', 2), split_part(realtime.topic(), ':', 3))
      in (select workspace_id, runtime_id from private.current_daemon_scope())
);

create policy "terminal_channel_daemon_send"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'terminal'
  and (split_part(realtime.topic(), ':', 2), split_part(realtime.topic(), ':', 3))
      in (select workspace_id, runtime_id from private.current_daemon_scope())
  -- Stops a compromised machine publishing `input` and forging what the
  -- operator appears to have typed into their own terminal.
  and realtime.messages.event = 'output'
);

-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- Rerunnable: `create table if not exists`, `create or replace function`, and
-- every policy dropped before it is created. Applying this file twice is a
-- no-op.
--
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'realtime' and tablename = 'messages'
--   order by policyname;
--
-- Expect TEN rows once this is applied:
--   010  transcript_broadcast_member_read          SELECT
--   015  chat_turn_broadcast_member_read           SELECT
--   018  machine_channel_admin_read                SELECT
--   018  machine_channel_admin_send                INSERT
--   018  terminal_channel_admin_read               SELECT
--   018  terminal_channel_admin_send               INSERT
--   019  machine_channel_daemon_read               SELECT
--   019  machine_channel_daemon_send               INSERT
--   019  terminal_channel_daemon_read              SELECT
--   019  terminal_channel_daemon_send              INSERT
--
-- Confirm the project ref before and after running this — applying to the
-- wrong project succeeds silently and returns the same ten rows there too.
--
-- Negative tests, as a daemon identity for (workspace A, runtime R). Run
-- inside a transaction ending in ROLLBACK, the pattern T-M16-06 §D
-- established:
--
--   * `machine:<A>:<R>` — SELECT succeeds; INSERT `reply` succeeds;
--     INSERT `request` REFUSED (the event pin)
--   * `terminal:<A>:<R>:<s>` — SELECT succeeds; INSERT `output` succeeds;
--     INSERT `input` REFUSED (the event pin)
--   * `machine:<A>:<R2>` / `terminal:<A>:<R2>:<s>` for a DIFFERENT runtime R2
--     in the same workspace — SELECT and INSERT both REFUSED. This is the
--     check T-DI-01's topic change exists for; without the runtime id in the
--     session topic the second of these would pass.
--   * `machine:<B>:<R>` for another workspace — REFUSED
--   * `run:<A>:<x>` and `chat:<A>:<x>` — SELECT REFUSED. 010 and 015 resolve
--     through current_workspace_ids(), which is empty for an identity with no
--     membership row; this asserts the "zero inherited privilege" claim rather
--     than trusting it
--   * the same identity after its only token is revoked — every one of the
--     above REFUSED, with no other change made
--
-- And the human side, unchanged by this file:
--   * an admin of A can still SELECT/INSERT `input` and `request` per 018
--   * a plain member of A still cannot
--
-- The live subscribe/broadcast version of all of this — a real daemon holding a
-- real channel — is T-DI-05 §A, and needs a credential T-DI-03 mints.
