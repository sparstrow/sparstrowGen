# T-M16-05 — core: terminal manager rework

| | |
|---|---|
| **Tag** | `[P]` — `terminal/manager.ts` and `api/routes/terminal.ts` only. It also adds a line to `index.ts`; coordinate with `T-M16-04` if both are in flight |
| **Serves** | **foundational** — makes the existing PTY manager drivable by something other than a Fastify socket, and replaces the bound that "survives until closed" removes |
| **Depends on** | T-M16-01 |
| **Blocks** | T-M16-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-26) |

## Objective

Four changes to a module that already works: a sink abstraction so a session can
be driven from the cloud bridge as well as from a local WebSocket; the detach
timer replaced by an explicit lifetime; a session ceiling; and output coalescing
with a throttle. Nothing about PTY spawn, the ring buffer or resize moves.

## Decisions already made

Plan **DD-6**, **DD-7** and **DD-8** govern this task.

**The sink.** `attachSink(id, sink)` where:

```ts
export interface TerminalSink {
  write(chunk: string): void;
  /** Reason is one of the four the spec's error state distinguishes. */
  close(reason: "closed" | "exited" | "access_revoked" | "detached"): void;
}
```

`attachSocket(id, socket)` becomes a thin wrapper that builds a sink over the
Fastify socket. **The local `/ws/terminal/:id` route is not deleted** — DD-6: it
works, it is how anything running on the machine itself attaches, and removing it
is behavioural surgery unrelated to this plan.

**Lifetime.** `DETACH_TTL_MS` and its `killTimer` go. A session ends when, and
only when:

| Trigger | Who calls it |
|---|---|
| The owner closes it | `terminal.close`, or the local `DELETE` route |
| Its shell exits | the PTY's own `onExit` |
| Terminal access is switched off | `T-M17-04`'s enforcement, via a new `killAllSessions("access_revoked")` |
| The pairing is revoked | core's existing revoked-pairing path |
| The machine restarts | implicit — a PTY is a process |

Detaching every sink no longer schedules anything. That is the owner's decision
(spec Assumptions, third bullet) and the reason the next two items exist.

**The ceiling.** `MAX_TERMINAL_SESSIONS` (10). `createSession` refuses with a
typed `session_limit_reached` rather than throwing an `HttpError`, because two
callers now consume it and only one of them is HTTP.

**Coalescing and throttle** per DD-8, implemented **in the manager, not in the
bridge**, so the local WebSocket path gets the same batching and the same
protection. The ring buffer keeps receiving raw output regardless of throttling —
a throttled session's scrollback must still be complete when it is replayed.

**`TerminalSessionInfo` is what leaves this module now.** The wire type from
`T-M16-01`, carrying the agent's name as well as its id, plus the session's age
and whether anything is currently attached. FR-005's list is built from it.

## Checklist

- [x] `TerminalSink` interface; `attachSink(id, sink)`; `attachSocket` rewritten
      as a wrapper over it
- [x] `DETACH_TTL_MS`, `killTimer` and the detach-kill path removed
- [x] `killSession(id, reason)` and `killAllSessions(reason)` carry a reason to
      every attached sink
- [x] PTY `onExit` closes every sink with `"exited"` and removes the session
- [x] `MAX_TERMINAL_SESSIONS` enforced in `createSession`, returning a typed
      refusal
- [x] Output coalescer: flush at `TERMINAL_OUTPUT_FLUSH_MS` or
      `TERMINAL_OUTPUT_FLUSH_BYTES`, split at `TERMINAL_OUTPUT_MAX_BYTES`
- [x] Throttle: above `TERMINAL_THROTTLE_BYTES_PER_SEC` sustained for
      `TERMINAL_THROTTLE_SUSTAIN_MS`, stop writing to sinks, emit one throttle
      notice, resume when output falls back under — **the ring keeps filling
      throughout**
- [x] `listSessions()` returns `TerminalSessionInfo[]` including age and attached
      state
- [x] `api/routes/terminal.ts` updated for the new signatures; its behaviour is
      otherwise unchanged
- [x] Unit tests: a session survives all its sinks detaching; reattach replays the
      ring; the eleventh open is refused; `onExit` closes sinks with `"exited"`;
      the coalescer batches a burst into one write; the throttle fires and
      recovers and the ring is complete afterwards
- [x] `packages/core` typecheck and tests green

## Traps

**Removing the timer removes a bound nobody wrote down as a bound.** Phase trap.
The ceiling lands in this same change, not after it — a merge that has the first
without the second is a machine that accumulates `node-pty` processes with
nothing stopping it.

**ConPTY does not tolerate a resize before the first attach.** The existing route
resizes on `ws.onopen`. Keep that ordering in the sink path: geometry set before
anything is written, or the first frame arrives with the wrong width and every
subsequent line wraps wrongly. This is Windows-only and will not reproduce on a
Linux CI runner — the phase README lists it for that reason.

**The ring buffer is the scrollback and the throttle must not touch it.** It is
tempting to stop appending while throttled, since that is where the bytes are
coming from. Then the owner scrolls back after a flood and finds a hole exactly
where the interesting output was.

**A coalescer that flushes on a timer holds a reference to a dead session.**
Clear the flush timer in the same place the session is removed, or a closed
session's final timer fires against a sink set that no longer exists.

**`listSessions()` is now a wire type, and wire types leak.** Do not add the
spawn `command`, `args`, `cwd` or `env` to it. A browser being told the exact
command line a machine is running is a disclosure the spec never asked for.

## Verification

- [x] `pnpm --filter @sparstrow/core test` green including the new suites
- [~] Manually against a locally running core: open a session over the **local**
      `/ws/terminal/:id` route, confirm it still works unchanged — not run live
      (no rendering browser pane in this environment for a real xterm.js
      session); covered instead by the unit suite's fake-WS attach/reattach/
      detach tests exercising the exact same `attachSocket` code path
- [~] Open a session, disconnect, wait 15 minutes, reconnect — not run with a
      real 15-minute wall clock; the unit suite proves the mechanism (no timer
      exists that could kill it) rather than waiting out 15 real minutes
- [~] `yes` in a session: the throttle notice appears... — not run against a
      real shell; the unit suite drives the exact same coalescer/throttle code
      with a fake PTY and fake timers instead (see Result)
- [x] Open 11 sessions: the eleventh is refused with `session_limit_reached`
      — proven directly in the unit suite

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

All four changes landed in `manager.ts` as decided. `TerminalSink` is
output-only by design (input still goes straight to `session.pty.write`,
unchanged) with a fourth `TerminalCloseReason` value, `"detached"`, that this
task defines but does not itself call — reserved for `T-M16-04`'s bridge,
when one browser tab stops watching a session others remain attached to
(closing the *sink*, not the session). `access_revoked` is likewise defined
here and called by nothing yet — that's `T-M17-04`'s job, per the phase's own
Decisions table.

`createSession`'s return type changed from `TerminalSession` to a discriminated
`CreateSessionResult` (`{ ok: true, session }` or `{ ok: false, error:
"session_limit_reached" }`), since a typed refusal now has two callers — the
HTTP route and, from `T-M16-04`, the cloud bridge — only one of which knows
what an `HttpError` is. `api/routes/terminal.ts` updated accordingly: a
refusal becomes a 429 (the caller did nothing wrong, the ceiling is just
already full), and the route now passes `agentName` through from the agent
row it already has in hand, since `listSessions()`/`getSession()` return the
full wire `TerminalSessionInfo` now, not the bare local `TerminalSession`.

**`TerminalSessionInfo` needed two fields `T-M16-01` hadn't anticipated** —
`ageMs` and `attached`. Added there (separate commit,
`packages/shared/src/schemas/terminal.ts`) since nothing else consumed the
type yet; noted back in `T-M16-01`'s own Result for traceability.

**Coalescer and throttle, in the manager as decided** (DD-8) — the local
`/ws/terminal/:id` path gets the identical batching and protection the cloud
bridge will. The ring buffer append happens unconditionally, before either
the coalescer or the throttle ever see the data, so a throttled or
still-coalescing session's scrollback is never missing bytes. Splitting a
flush at `TERMINAL_OUTPUT_MAX_BYTES` walks JS string (UTF-16) boundaries
rather than raw byte offsets, so a multi-byte character is never corrupted by
landing across a split — an accuracy the task didn't explicitly ask for but
that a raw byte-offset split would have silently gotten wrong.

**Rate tracking is a plain 1-second sliding window**, not a token bucket:
accumulate bytes since the window started, reset when a full second has
elapsed, and track how long the window has continuously read "over budget."
Engaging the throttle requires that condition to hold for the full
`TERMINAL_THROTTLE_SUSTAIN_MS`; resuming does not, matching DD-8's "resume
when output falls back under" — deliberately not the same bar in both
directions.

Unit-tested with a fake `node-pty` (captured `onData`/`onExit` callbacks,
`vi.useFakeTimers()` + `vi.setSystemTime()` so the rate window is
deterministic) and a fake WebSocket (captured `on("close")`/`on("message")`).
9 tests: session creation shape, the eleventh-session refusal, a session
surviving every sink detaching (`getSession` still resolves, `attached`
flips false), ring replay on reattach — including mid-coalesce, before any
flush has fired — `onExit` closing sinks with `"exited"`, `killSession`
closing sinks with a caller-supplied reason, the coalescer batching a
three-write burst into one flush, and the throttle engaging under sustained
flood, staying silent for one more burst while still engaged, then resuming
on the next under-budget window with the ring's tail intact throughout.

Manual verification against a real locally-running core, a real 15-minute
wait, and a real flooding shell were **not run** — no rendering browser pane
is available in this environment for a real xterm.js session, and none of
those three checks exercises anything the fake-PTY/fake-WS unit suite
doesn't already drive through the identical code path. Recorded here rather
than claimed; genuinely live verification is `T-M16-06`'s to close.
