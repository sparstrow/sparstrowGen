# T-M16-04 — core: the Realtime connection

| | |
|---|---|
| **Tag** | `[C]` — edits `packages/core/src/index.ts`, which `T-M16-05` also touches; one worker at a time on that file |
| **Serves** | **foundational** — the machine's half of the wire |
| **Depends on** | T-M16-01, T-M16-02 |
| **Blocks** | T-M16-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-26) |

## Objective

Give core a Realtime connection it holds for as long as it is paired: fetch the
credential, subscribe to its own machine control topic, refresh before expiry,
reconnect after a drop, and route control requests to the terminal manager and a
session's bytes to its own topic.

## Decisions already made

Plan **DD-2**, **DD-3**, **DD-8** and phase decisions 2–4 govern this task.

**Two modules, split by what they know about.**

- `packages/core/src/cloud/realtime.ts` — knows about credentials, connections,
  channels and backoff. Knows nothing about terminals.
- `packages/core/src/cloud/terminal-bridge.ts` — knows about the four request
  kinds and the manager. Knows nothing about tokens or reconnection.

Keeping them apart is what lets the next live surface ([`I-11`](../../Ideas.md))
register its own handler without touching connection code.

**Failure discipline is `heartbeat.ts`'s, line for line** (phase decision 4). Log
the connectivity edge once rather than every attempt; back off; never reject into
core's startup path; never touch the command loop. A machine with no Realtime
connection still runs dispatched work exactly as it does today — this is a
capability core gained, not a dependency it acquired, which is the same sentence
`client.ts` opens with about the cloud generally.

**Refresh at 80% of the credential's life**, using the `expiresAt` the endpoint
returned rather than decoding the token. `supabase-js` exposes `setAuth()` on the
Realtime client for exactly this; the connection is not torn down to refresh.

**Unpaired is normal.** `isPaired()` is checked the same way `commands.ts` checks
it, and an unpaired machine simply never connects. A 403 from the token endpoint
means the pairing was revoked: stop, log the same re-pair guidance
`commands.ts` logs, and do not retry.

**The control channel is subscribed once, per machine, and lives as long as the
connection.** Session topics are subscribed on demand — when a session is opened
or attached — and unsubscribed when the session ends. A machine holding ten idle
sessions holds eleven channels; that is the ceiling `MAX_TERMINAL_SESSIONS`
bounds.

**Every handler validates with the Zod schemas from `T-M16-01` and wraps its
body.** Phase trap: a throw inside a `.on("broadcast", …)` callback surfaces
nowhere and leaves a channel that is subscribed and doing nothing.

**Requests are answered even when they fail.** Every `terminal.*` request gets a
reply carrying its `requestId` — a `TerminalRefusal` if it could not be done.
Silence is the one response the page cannot render, because it is
indistinguishable from an unreachable machine, and FR-007 requires those to read
differently.

**Terminal access is checked here, on every `terminal.open` and
`terminal.attach`.** Reading `SETTING_TERMINAL_ACCESS` from the local settings
table, refusing with `terminal_access_disabled`. This is FR-011's "the machine
MUST enforce it" — `T-M17-04` builds the switch and the UI, but the enforcement
point is this task, so a browser that ignores the switch is still refused.

## Checklist

- [x] `packages/core/src/cloud/realtime.ts` — connect, `setAuth` refresh timer at
      80% of TTL, exponential backoff with the connectivity-edge logging
      `heartbeat.ts` uses, clean stop
- [x] Subscribe to `machineControlTopic(workspaceId, runtimeId)`, built from the
      pairing state — never from a message (phase decision 3)
- [x] `packages/core/src/cloud/terminal-bridge.ts` — handlers for
      `terminal.list` / `open` / `close` / `attach`, each replying with the
      `requestId` echoed
- [x] `terminal.open` and `terminal.attach` check `SETTING_TERMINAL_ACCESS` and
      refuse with `terminal_access_disabled` when it is off
- [x] `terminal.list` and the `unknown_session` refusal both carry the machine's
      own start time, so M17 can say *the machine restarted at …* (DD-5)
- [x] A session's sink writes coalesced output to
      `terminalSessionTopic(...)` per DD-8: flush at 30 ms or 8 KB, cap at 64 KB
      per message, throttle above 256 KB/s sustained for 3 s with a notice —
      already built by `T-M16-05`; the bridge sink is a thin adapter over it
- [x] Input messages on a session topic are applied to the PTY. Resize
      travels on the CONTROL topic instead, as `terminal.attach` with new
      `cols`/`rows` — `T-M16-01`'s own design (no fifth request kind), not a
      session-topic message; see Result
- [x] `packages/core/src/index.ts` starts the connection after pairing is
      resolved and stops it cleanly on shutdown
- [x] Unit tests: refresh fires before expiry; backoff on repeated failure;
      a malformed message is dropped without throwing; a revoked pairing stops
      the loop; `terminal_access_disabled` is returned when the setting is off
- [x] `packages/core` typecheck and tests green

## Traps

**`supabase-js` in Node needs no WebSocket polyfill on Node 20+, but it does need
the Realtime client to be constructed without the auth helpers.** Core has no
browser session and no `@supabase/ssr`; construct the Realtime client directly
with the minted token rather than reaching for `createClient()`, which will try
to manage a user session that does not exist.

**A refresh that fails must not drop the connection immediately.** The existing
credential is valid until `exp`; failing at 80% leaves 20% of its life to keep
retrying in. Tearing down on the first failed refresh converts a transient blip
into a dropped terminal.

**Backoff must not outlive the credential.** If backoff grows past the TTL, the
reconnect attempt uses an expired token and fails for a new reason, which reads
in the logs like a broken endpoint. Re-mint before reconnecting whenever the
stored `expiresAt` has passed.

**Do not subscribe a session topic before the manager has the session.** The
replay ring is written by the manager; subscribing first means the first output
message can be emitted for a session id the manager has not registered, and the
sink lookup fails silently.

**`index.ts` is shared with `T-M16-05`.** That is why this task is `[C]`. Land one
before starting the other rather than resolving a conflict in a startup sequence.

## Verification

- [x] `pnpm --filter @sparstrow/core test` green including the new suites
- [~] Run core paired against the feature branch's preview — not run; needs
      `SUPABASE_JWT_SIGNING_KEY` set on the deployment (T-M16-02's owner
      action) and `018_terminal_channels.sql` applied (done, T-M16-03), so
      the only missing piece is that one owner step
- [~] Kill the network for 60 s — not run for the same reason; the backoff
      unit test proves the mechanism (repeated failure retries with
      increasing delay, one connectivity-edge log per transition, never a
      tight loop) against a fake client instead
- [x] Force a short TTL in a test and confirm `setAuth` is called before expiry
      with the connection still up — done exactly this way in
      `realtime.test.ts`
- [x] Set `SETTING_TERMINAL_ACCESS` to `false` locally and confirm a
      `terminal.open` request is answered with `terminal_access_disabled`
      rather than ignored — done in `terminal-bridge.test.ts` against a real
      in-memory settings table

End-to-end byte flow is [`T-M16-06`](T-M16-06-verification.md) §A.

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row
- [x] Update the phase README's task table

## Result

**Core had no configured Supabase URL or anon key at all before this task** —
resolved by amending `T-M16-02`'s response (see that task's Result and the
separate commit that landed it) rather than adding new machine-side
configuration, since both values are already public.

Two modules, split exactly as decided: `realtime.ts` (connection lifecycle,
credentials, backoff — zero terminal knowledge) and `terminal-bridge.ts` (the
four request kinds and the manager — zero token/reconnection knowledge),
talking to each other through three functions
(`onMachineRequest`/`sendMachineReply`/`openSessionChannel`) rather than
either reaching into the other's internals.

**One design point neither this task's Decisions nor `T-M16-01`'s spelled
out: how a live resize travels.** `T-M16-01` already answered it, just not
in this task's own doc — re-attaching an already-open session with new
`cols`/`rows` IS the resize (the plan's four kinds are a closed set, no
fifth). `handleAttach` calls `resizeSession` unconditionally before ensuring
the bridge sink exists, so a `terminal.attach` is simultaneously "give me a
sink for this session" and "resize it," matching that design.

**`terminal.attach`'s `replay` field cannot be produced by the manager's
normal replay-on-sink-attach behaviour**, because the requester isn't
subscribed to the session's own topic yet when the reply is sent — it
subscribes only after receiving the reply, using the session id the reply
just gave it. Added `peekRing(id)` to `manager.ts` (T-M16-05's module, a
small same-band addition) as a read-only accessor for exactly this. The
sink's own automatic replay-on-first-attach still fires too, as a broadcast
nobody may be listening to yet — harmless, and not worth suppressing for one
wasted message.

**`writeToSession(id, data)` also added to `manager.ts`** — `TerminalSink` is
output-only by design (T-M16-05's own docblock says so), so the bridge needs
a separate path to apply a session-topic `input` message to the pty, mirroring
`attachSocket`'s inline `ws.on("message")` handling for the local path.

**Rate/backoff/refresh timing is real logic, not a stub** — verified with a
faked `@supabase/realtime-js` `RealtimeClient` (no real WebSocket) and Vitest
fake timers: a 10s-TTL credential triggers `setAuth` at 8s with the same
client instance (never reconnects to refresh); a rejected mint retries with
increasing delay rather than a tight loop; a `403 revoked` mint stops the
loop for good (no further fetch calls at all, checked out to two minutes);
a throwing request handler is caught at the channel-callback boundary rather
than crashing it. One real bug caught and fixed in the test itself while
writing it: `mockResolvedValue(response)` returns the SAME `Response`
instance for every call, and a `Response` body can only be read once — the
refresh test's second mint was silently failing to parse until the mock was
switched to `mockImplementation` returning a fresh `Response` per call.

`terminal-bridge.test.ts` uses a real in-memory SQLite `settings` table
(`openDb(":memory:")`, matching the `cron.test.ts`/`goals.test.ts` pattern)
rather than mocking the setting read, so the `terminal_access_disabled` path
is proven against the actual `terminalAccessEnabled()` query, not a stand-in
for it.

**Both live-deployment verification items are deferred, not skipped** — both
need `SUPABASE_JWT_SIGNING_KEY` set on a real deployment (T-M16-02's still-
open owner action) to exercise for real. `018_terminal_channels.sql` is
already applied (`T-M16-03`), so that owner step is the only thing standing
between this and a live end-to-end run — `T-M16-06` §A is where that
actually gets proved.

*(filled in when the task lands)*
