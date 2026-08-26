# T-M16-05 — core: terminal manager rework

| | |
|---|---|
| **Tag** | `[P]` — `terminal/manager.ts` and `api/routes/terminal.ts` only. It also adds a line to `index.ts`; coordinate with `T-M16-04` if both are in flight |
| **Serves** | **foundational** — makes the existing PTY manager drivable by something other than a Fastify socket, and replaces the bound that "survives until closed" removes |
| **Depends on** | T-M16-01 |
| **Blocks** | T-M16-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `TerminalSink` interface; `attachSink(id, sink)`; `attachSocket` rewritten
      as a wrapper over it
- [ ] `DETACH_TTL_MS`, `killTimer` and the detach-kill path removed
- [ ] `killSession(id, reason)` and `killAllSessions(reason)` carry a reason to
      every attached sink
- [ ] PTY `onExit` closes every sink with `"exited"` and removes the session
- [ ] `MAX_TERMINAL_SESSIONS` enforced in `createSession`, returning a typed
      refusal
- [ ] Output coalescer: flush at `TERMINAL_OUTPUT_FLUSH_MS` or
      `TERMINAL_OUTPUT_FLUSH_BYTES`, split at `TERMINAL_OUTPUT_MAX_BYTES`
- [ ] Throttle: above `TERMINAL_THROTTLE_BYTES_PER_SEC` sustained for
      `TERMINAL_THROTTLE_SUSTAIN_MS`, stop writing to sinks, emit one throttle
      notice, resume when output falls back under — **the ring keeps filling
      throughout**
- [ ] `listSessions()` returns `TerminalSessionInfo[]` including age and attached
      state
- [ ] `api/routes/terminal.ts` updated for the new signatures; its behaviour is
      otherwise unchanged
- [ ] Unit tests: a session survives all its sinks detaching; reattach replays the
      ring; the eleventh open is refused; `onExit` closes sinks with `"exited"`;
      the coalescer batches a burst into one write; the throttle fires and
      recovers and the ring is complete afterwards
- [ ] `packages/core` typecheck and tests green

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

- [ ] `pnpm --filter @sparstrow/core test` green including the new suites
- [ ] Manually against a locally running core: open a session over the **local**
      `/ws/terminal/:id` route, confirm it still works unchanged — this is the
      regression DD-6 exists to prevent
- [ ] Open a session, disconnect, wait 15 minutes, reconnect: the session is still
      there and replays. This is the behaviour change the owner chose, and 15
      minutes is chosen to be past the old 10-minute grace
- [ ] `yes` in a session: the throttle notice appears, core's memory does not
      grow unbounded, and Ctrl-C recovers the session
- [ ] Open 11 sessions: the eleventh is refused with `session_limit_reached`

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

*(filled in when the task lands)*
