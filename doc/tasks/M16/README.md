# M16 — a live channel to a machine

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-24-a-terminal-on-my-machine.md`](../../plans/2026-08-24-a-terminal-on-my-machine.md) (M16) |
| **Kind** | **foundational** — blocks M17, demos to nobody |
| **Spec** | [`../../specs/2026-08-24-a-terminal-on-my-machine.md`](../../specs/2026-08-24-a-terminal-on-my-machine.md) |
| **Depends on** | M3 (pairing + daemon bearer token), M4 (`settings.set`), M5 (the broadcast pattern this extends) — all shipped |
| **Blocks** | M17 |
| **Status** | done except G-47 (2026-08-26) — built, unit-tested, and §C/§D live-verified against the real project; §A/§B's live-wire pass needs the owner's own hands, see [`KnownGaps.md`](../../KnownGaps.md) G-47 |
| **Open questions** | none |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M16-01 — channel contracts](T-M16-01-channel-contracts.md) | `[S]` | foundational | — | done (2026-08-26) |
| [T-M16-02 — daemon Realtime credential](T-M16-02-daemon-realtime-credential.md) | `[P]` | foundational | T-M16-01 | done (2026-08-26) |
| [T-M16-03 — `018_terminal_channels.sql`](T-M16-03-channel-policies.md) | `[P]` | foundational | T-M16-01 | done (2026-08-26) |
| [T-M16-04 — core: the Realtime connection](T-M16-04-core-realtime-connection.md) | `[C]` | foundational | T-M16-01, T-M16-02 | done (2026-08-26) |
| [T-M16-05 — core: terminal manager rework](T-M16-05-terminal-manager.md) | `[P]` | foundational | T-M16-01 | done (2026-08-26) |
| [T-M16-06 — verification](T-M16-06-verification.md) | `[S]` | foundational | T-M16-01…05 | done except G-47 (2026-08-26) |

This file holds what they share. Individual tasks reference it rather than
restating it.

## Objective

Give the control plane and a paired machine a live, authenticated, two-way
conversation, and rebuild the terminal session manager so a PTY can be driven
over it. At the end of this phase the Terminals page is exactly as dead as it is
today — what changes is that a script can open a shell on a real machine from
outside that machine's network and get bytes back.

## The shape of what was found

**The terminal is not the work. Four things established by reading the code:**

**1. The machine side is finished.**
[`packages/core/src/terminal/manager.ts`](../../../packages/core/src/terminal/manager.ts)
is 170 lines that already do PTY spawn, a 256 KB replay ring, multi-socket
attach, resize and kill.
[`packages/core/src/api/routes/terminal.ts`](../../../packages/core/src/api/routes/terminal.ts)
already exposes create/get/list/resize/kill plus a `/ws/terminal/:id` WebSocket,
and already handles the interactive-agent spawn through
`provider.buildInteractiveSpawn`. None of this needs rewriting — it needs a
second way in.

**2. The page is finished too, and dead for one line.**
[`terminals.tsx:168`](../../../apps/web/src/app/terminals/terminals.tsx:168)
dials `window.location.host`. That was the daemon when the daemon served the UI.
It is now Vercel, which serves no WebSocket from a route handler — a fact
[`realtime-live-events.ts`](../../../apps/web/src/lib/realtime-live-events.ts)
already records as the reason `wsHub` was retired.

**3. The daemon Realtime credential is named, scoped and declined in two prior
phases.**
[`010_transcript_broadcast.sql`](../../../packages/shared/drizzle/policies/010_transcript_broadcast.sql)
and
[`apps/web/src/lib/daemon/broadcast.ts`](../../../apps/web/src/lib/daemon/broadcast.ts)
both spell out the same four missing pieces: a custom `runtime_id` JWT, a minting
endpoint, a refresh timer in core, and policies that understand a principal with
no `auth.uid()`. This phase builds those four and stops there.

**4. The admin helper already exists.**
`private.current_admin_workspace_ids()`
([`001_rls.sql:60`](../../../packages/shared/drizzle/policies/001_rls.sql:60))
is exactly the role gate FR-009 needs and has never been used on a channel.

## Definition of done

- A script signed in as an owner/admin can open a shell on a real paired machine
  over the two channels, type into it, and receive its output — from a computer
  that is not that machine.
- The daemon holds a Realtime connection, refreshes its credential before expiry,
  and reconnects after the connection is dropped, without operator action.
- A member who is not owner/admin is refused at **subscribe** and at **send**, by
  the policy, not by the client.
- A member of workspace B is refused on a workspace A topic.
- A session survives its sink detaching and is reattachable with its ring buffer
  replayed.
- The eleventh concurrent session on a machine is refused with a reason, not an
  exception.
- Output at 1 MB/s is throttled with a notice rather than flooding the channel.
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** anything the owner can see. The Terminals page, the
Machines toggle, and the Knowledge Center all belong to M17. Also not here: any
second consumer of the control channel — plan Scope boundaries, "no general
machine-RPC layer".

---

## Decisions already made

Plan decisions **DD-1** through **DD-8** govern this phase and are not restated.
Read them before starting: they settle the transport, the credential shape, the
topic split, the send policy, the no-cloud-table stance, the sink abstraction,
the lifetime change and the coalescing rules.

### 1. The contract file is written first and nothing else starts until it lands

`T-M16-01` is `[S]` for the same reason M3's and M4's first tasks were: four
other tasks are written against these topics, event names and envelopes, and two
of them are in different packages. A shape that changes after `T-M16-03` has
authored a policy against it is a policy that silently authorizes the wrong
thing.

### 2. Every message is validated on receipt, on both ends

The daemon is receiving instructions from a browser over a channel, and the
browser is receiving bytes that it renders into a terminal. Both parse with Zod
at the boundary and drop anything that does not match, logging the event name and
nothing else. A malformed message must not throw inside a channel handler —
`supabase-js` will not surface it and the connection appears healthy while
silently doing nothing.

### 3. The daemon never trusts the workspace id in a message

It comes from the topic, which comes from the credential the control plane
minted. A `workspace_id` field inside a payload is ignored if present. This
mirrors `broadcast.ts`'s rule that "the topic is built from the token's scope,
not from anything the caller said."

### 4. Failure of the Realtime connection must not affect anything else in core

`realtime.ts` follows `heartbeat.ts`'s failure discipline line for line: log the
connectivity edge once, back off, never reject into core's startup path, never
stop the command loop. A machine with no Realtime connection is a machine with no
browser terminals — it still runs dispatched work exactly as before.

## The owner action this phase cannot do for itself

`T-M16-02` needs a signing credential in the Vercel environment
(`SUPABASE_JWT_SECRET`, or the project's signing key — the task determines
which). Only the owner can read it from the Supabase dashboard and set it on the
project. A row is added to [`../../runbooks/README.md`](../../runbooks/README.md)
by that task; nothing else in this phase is blocked on it, and `T-M16-06` is.

## Files

| Path | Change |
|---|---|
| `packages/shared/src/schemas/terminal.ts` | new — envelopes, event names, Zod schemas |
| `packages/shared/src/cloud.ts` | edit — topic helpers, limits, `SETTING_TERMINAL_ACCESS` |
| `packages/shared/src/index.ts` | edit — re-export |
| `packages/shared/drizzle/policies/018_terminal_channels.sql` | new — subscribe + send policies |
| `apps/web/src/app/api/daemon/realtime/token/route.ts` | new — the minting endpoint |
| `apps/web/src/lib/daemon/realtime-token.ts` | new — signing, claims, TTL |
| `packages/core/src/cloud/realtime.ts` | new — connection, refresh, backoff, control channel |
| `packages/core/src/cloud/terminal-bridge.ts` | new — control requests → manager, session bytes → channel |
| `packages/core/src/terminal/manager.ts` | edit — sink abstraction, lifetime, ceiling, coalescing |
| `packages/core/src/api/routes/terminal.ts` | edit — `attachSocket` becomes a sink wrapper |
| `packages/core/src/index.ts` | edit — start/stop the Realtime connection |
| `doc/runbooks/README.md` | edit — one owner-action row |

## Traps

**The topic is the security boundary, and it is assembled in two places.** The
daemon builds it from its credential's claims; the browser builds it from the
workspace it resolved. If either ever builds it from a value that arrived in a
message, the policy is bypassed for anyone who can send one. `010`'s header makes
this point about run topics; it applies unchanged.

**A `sub` claim will not fail closed — it will fail loudly, somewhere else.**
DD-2. `auth.uid()` casts `sub` to `uuid`. A nanoid there raises inside
`private.current_workspace_ids()`, which `010` and `015` both call, so the
symptom is broken run transcripts and chat on that connection rather than a
refused terminal. Omit `sub`.

**`supabase-js` swallows handler exceptions.** A throw inside a
`.on("broadcast", …)` callback does not surface anywhere: the channel stays
subscribed and simply stops doing its job, which reads exactly like "the machine
is ignoring me". Every handler wraps its body and logs.

**Removing `DETACH_TTL_MS` removes a bound nobody wrote down as a bound.** It was
the only thing limiting how many `node-pty` processes accumulate. `T-M16-05` must
land the ceiling in the same change, not after it.

**`node-pty` on Windows uses ConPTY and does not tolerate resize before the first
attach.** The existing code resizes on `ws.onopen`; the sink path must keep that
ordering or the first frame arrives with the wrong geometry and every subsequent
line wraps wrongly.

**Realtime's message ceiling is not the same as the transcript batch ceiling.**
`TRANSCRIPT_BATCH_MAX_BYTES` is 128 KB and was chosen for transcripts. Terminal
output gets its own constant (DD-8), and the coalescer measures encoded bytes,
not raw string length — `planBroadcast` in `broadcast.ts` already makes this
mistake impossible to repeat and is the reference.

## Verification

1. A keystroke sent on a session topic reaches the PTY, and its output returns
   on the same topic, from outside the machine's network.
2. The credential refreshes before expiry and the connection survives it.
3. The connection recovers from being dropped, with backoff, unattended.
4. Subscribe and send are both refused for a non-admin member and for a member of
   another workspace.
5. Session lifetime: survives detach, replays on reattach, dies on explicit
   close and on shell exit.
6. The session ceiling and the output throttle both fire, with a reason.

Full procedure in [T-M16-06 — verification](T-M16-06-verification.md).
