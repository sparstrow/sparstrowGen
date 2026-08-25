# T-M16-04 — core: the Realtime connection

| | |
|---|---|
| **Tag** | `[C]` — edits `packages/core/src/index.ts`, which `T-M16-05` also touches; one worker at a time on that file |
| **Serves** | **foundational** — the machine's half of the wire |
| **Depends on** | T-M16-01, T-M16-02 |
| **Blocks** | T-M16-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `packages/core/src/cloud/realtime.ts` — connect, `setAuth` refresh timer at
      80% of TTL, exponential backoff with the connectivity-edge logging
      `heartbeat.ts` uses, clean stop
- [ ] Subscribe to `machineControlTopic(workspaceId, runtimeId)`, built from the
      pairing state — never from a message (phase decision 3)
- [ ] `packages/core/src/cloud/terminal-bridge.ts` — handlers for
      `terminal.list` / `open` / `close` / `attach`, each replying with the
      `requestId` echoed
- [ ] `terminal.open` and `terminal.attach` check `SETTING_TERMINAL_ACCESS` and
      refuse with `terminal_access_disabled` when it is off
- [ ] `terminal.list` and the `unknown_session` refusal both carry the machine's
      own start time, so M17 can say *the machine restarted at …* (DD-5)
- [ ] A session's sink writes coalesced output to
      `terminalSessionTopic(...)` per DD-8: flush at 30 ms or 8 KB, cap at 64 KB
      per message, throttle above 256 KB/s sustained for 3 s with a notice
- [ ] Input and resize messages on a session topic are applied to the PTY
- [ ] `packages/core/src/index.ts` starts the connection after pairing is
      resolved and stops it cleanly on shutdown
- [ ] Unit tests: refresh fires before expiry; backoff on repeated failure;
      a malformed message is dropped without throwing; a revoked pairing stops
      the loop; `terminal_access_disabled` is returned when the setting is off
- [ ] `packages/core` typecheck and tests green

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

- [ ] `pnpm --filter @sparstrow/core test` green including the new suites
- [ ] Run core paired against the feature branch's preview: the log shows a
      Realtime connection established once, and no repeated connect attempts
- [ ] Kill the network for 60 s: the log shows one connectivity-edge warning, not
      one per attempt, and the connection returns unattended
- [ ] Force a short TTL in a test and confirm `setAuth` is called before expiry
      with the connection still up
- [ ] Set `SETTING_TERMINAL_ACCESS` to `false` locally and confirm a
      `terminal.open` request is answered with `terminal_access_disabled` rather
      than ignored

End-to-end byte flow is [`T-M16-06`](T-M16-06-verification.md) §A.

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

*(filled in when the task lands)*
