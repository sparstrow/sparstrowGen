# BUG-2026-08-28-private-broadcast-channels-not-relaying

**Status:** 🔴 open
**Reported by:** agent — running `T-DI-05` against a real paired daemon for the first time
**Reported:** 2026-08-28

## Symptom

A message broadcast on a `private: true` Realtime channel is never delivered
to a subscriber on that same topic — even when both the sender and the
subscriber are fully authenticated, both connections report `SUBSCRIBED`, and
the send itself is acknowledged `ok` by the Realtime server. This is **not**
specific to the daemon, to this band's new policies, or to any app code in
this repo — it reproduces with two independent, purely synthetic connections
using only `018_terminal_channels.sql`'s pre-existing (M16, already-merged)
admin policies.

## Reproduction

Run against `pnymngoqseltgigcfevq` (sparstrowgen-staging), the project
`development`/`staging` share:

1. Mint two independent Supabase sessions for the same admin test account
   (`generateLink` + `verifyOtp`, matching `doc/runbooks/agent-browser-session.md`).
2. Connection A: `new RealtimeClient(...)`, `.channel('machine:<ws>:<runtime>',
   { config: { broadcast: { self: false }, private: true } })`,
   `.on('broadcast', { event: '*' }, ...)`, `.subscribe()`. Waits for
   `SUBSCRIBED` — confirmed.
3. Connection B (fresh client, fresh session): same topic, same config,
   `.subscribe()` — also `SUBSCRIBED`.
4. Connection B: `channel.send({ type: 'broadcast', event: 'request', payload:
   {...} })` → resolves `"ok"` (a genuine WebSocket push, `canPush()` was
   `true`, no REST fallback).
5. Connection A's listener: **never fires.** Waited 6–8s, repeated the whole
   sequence multiple times, same result every time.
6. Control: the identical test with `private: false` (config omitted
   entirely) on an arbitrary public topic — **relays correctly**, first try,
   sub-second.

This was found while trying to make a real paired daemon answer a
`terminal.list` request from a real signed-in browser — both connections
independently confirmed `SUBSCRIBED` and correctly authorized (RLS boolean
directly verified true via SQL simulation for the daemon's exact
`sub`/topic), yet the daemon never received anything. The two-human-account
repro above exists to prove this is not specific to the daemon's identity or
to `019`/`020` (this band's new policies) at all.

## Investigation

Ruled out, with evidence for each:

- **RLS policy correctness** — the exact `using`/`with check` boolean
  evaluates `true` for the real sub/topic pair, tested directly in SQL
  (`set local role authenticated; set local request.jwt.claim.sub = ...; set
  local realtime.topic = ...`).
- **Client-side races** — fixed two real ones along the way
  ([`BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth`](BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth.md),
  [`BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined`](BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined.md)),
  neither changes this symptom — reproduces identically with a `canPush():
  true` genuine WS send.
- **Wrong topic string / event name mismatch** — checked byte-for-byte via
  `/api/v1/workspace` and `/api/v1/runtimes` against what the channel actually
  subscribed to; identical. Tried both an exact event-name listener and a
  wildcard (`{ event: '*' }`) — no difference.
- **`realtime-js` version skew** (`apps/web` resolves `2.112.2` via
  `@supabase/supabase-js`, `packages/core` pins `2.112.4` directly) — ruled
  out by reproducing with **both** connections on `2.112.4` (`packages/core`'s
  own resolved version), same result.
- **`self: false` misapplied across separate connections** — tried `self:
  true` on both sides, no difference.
- **REST-broadcast persistence/replication** — `realtime.messages` (and its
  daily partitions) has **zero rows** after every attempt, including the
  successful public-channel control. Confirmed broadcast delivery does not
  route through a table read for either public or private channels; the table
  is authorization-only (per Supabase's own docs, quoted below), so the daily
  partition/publication setup is unrelated and was a dead end.
- **Missing schema grants** (`authenticated`/`anon` USAGE on `private`/
  `realtime`) — checked via `has_schema_privilege`; both present.

**"Allow public access to channels" — checked live, 2026-08-28, ruled out.**
The owner found and disabled this exact Realtime Settings toggle (labeled
"Allow public access to channels" in the live dashboard UI, matching the
docs' "Allow public access"). Both the daemon and the browser's control
channel were reconnected fresh afterward (a new `SUBSCRIBED` join, not a
cached pre-toggle connection). Symptom unchanged — `terminal.list` still
timed out, and the isolated relay probe (steps 1–6 above) still reproduced
identically. This is not the cause, or not the whole of it.

**Root-caused further using Supabase's own Realtime Inspector**
(`/dashboard/project/pnymngoqseltgigcfevq/realtime/inspector`), 2026-08-28.
Joined the exact `machine:<ws>:<runtime>` topic (private, RLS-checked) under
two different roles:

- **As `postgres` (superuser, bypasses RLS):** presence `sync`/`join` events
  appear immediately on join. Using the Inspector's own "Broadcast a
  message" button, a self-sent test message round-trips back to the same
  connection within the same second.
- **As `authenticated`, impersonating the real, correctly-RLS-authorized
  daemon identity** (the Inspector's own "Authenticated → Project → User"
  picker, searched by email and selected): the join itself reports success
  (`{"message":"Subscribed to PostgreSQL","status":"ok",...}`) — but **no
  presence `sync`/`join` ever appears**, and the identical
  "Broadcast a message" self-test shows a `"Successfully broadcasted
  message"` toast client-side and then **never appears in that same
  connection's own event stream.** Same topic, same private config, only the
  role differs.

This is the cleanest evidence yet: it isolates the defect to **message
delivery specifically for `authenticated`-role connections on this Realtime
tenant**, after the authorization check has already passed — not RLS
(already proven correct via direct SQL), not the public-access toggle (ruled
out above), not this repo's client code (the Inspector uses neither
`apps/web`'s nor `packages/core`'s code at all), and not even *external*
delivery specifically — a connection can't hear **its own** broadcast either.

**Untried lead, needs the owner: "Database connection pool size" is set to
2**, on the same Realtime Settings page, described in the dashboard as
*"Realtime Authorization uses this database pool to check client access."*
Two is a very small pool for an authorization check that (per the `postgres`
vs `authenticated` split above) appears to succeed but leave something
incomplete afterward — consistent with a check that completes and then
can't acquire a connection to finish registering the subscription for
delivery. Attempting to raise it live (typing into the field) was blocked by
this session's own safety classifier as a live production settings change,
same as the public-access toggle was before the owner flipped it themselves.
**Not yet tried.**

## Impact

**Every private (RLS-gated) Realtime broadcast channel in this app is
affected, not just terminals.** This is upstream of and predates this band
entirely:

- **Terminals (M16/M17, `018`/`019`)** — US1–US3 blocked; this is what
  `T-DI-05` exists to prove and cannot.
- **Run transcripts (M5, `010`)** and **chat turn deltas (M12, `015`)** use
  the identical `private: true` + RLS pattern on `realtime.messages`. Their
  own live passes were deferred as `G-47`'s and this repo's broader pattern of
  "built, never live-verified" — this finding means that deferral may have
  been hiding the same defect the whole time, for both features, in
  production today (`development.sparstrow.com`, and any deployed preview).
  **Not yet independently reproduced against `010`/`015`'s specific topics**
  — flagging as likely, not confirmed, since both are server-published only
  (no client-side send policy) and reproducing needs a live run/chat turn to
  trigger the send side rather than a synthetic probe.

If the "Allow public access" hypothesis is correct and simply needs
disabling, every one of these features could start working with a single
dashboard toggle and no code change — which is also why this is being
reported rather than worked around: there is no code-side workaround for a
project-level setting this agent cannot read or change.

## Resolution

*(open. "Allow public access to channels" is confirmed disabled and is not
the cause. Next step is the owner's call between:*

1. *Raise "Database connection pool size" (currently 2) on the same Realtime
   Settings page and retest — this session's Inspector-based diagnosis
   (`authenticated` role's own self-broadcast never returns, `postgres`
   role's does) points here as the strongest untried lead, but it is a live
   production infrastructure change this session's safety classifier
   correctly declined to make unsupervised.*
2. *File a Supabase support ticket with this bug's reproduction — the
   Inspector-based `postgres`-vs-`authenticated` split is concrete, minimal,
   and doesn't depend on this repo's code at all, which should make it easy
   for Supabase's own team to act on directly.*

*Either way, re-run this file's reproduction steps 1–6 after — a fix should
show connection A receiving the broadcast in step 5, and separately, the
Inspector's `authenticated`-role self-broadcast test should round-trip the
same way the `postgres`-role one already does.)*
