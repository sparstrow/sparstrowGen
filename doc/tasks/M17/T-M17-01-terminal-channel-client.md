# T-M17-01 — the channel client

| | |
|---|---|
| **Tag** | `[S]` — one new file that `T-M17-02` and `T-M17-03` are both written against |
| **Serves** | **foundational to this phase** — unblocks US1–US3 |
| **Depends on** | M16 |
| **Blocks** | T-M17-02, T-M17-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-27) |

## Objective

The browser half of M16's wire: subscribe to a machine's control topic and a
session's topic, issue correlated requests with a timeout, and hand a session's
bytes to whoever is rendering them. No React in this file.

## Decisions already made

Phase decisions 1, 3 and 4 govern this task. Plan **DD-3** and **DD-4** define
the topics and what a client is allowed to send.

**It mirrors `RealtimeLiveEventSource`, not `wsHub`.** That class already
resolves the workspace once per browser session and holds channels — read it
before writing this. The differences: this one **sends** as well as receives, and
its channels are per machine and per session rather than per run.

**The API surface, deliberately small:**

```ts
export interface TerminalChannel {
  /** Correlated request on machine:<ws>:<runtimeId>. Rejects on timeout. */
  request<K extends MachineRequestKind>(kind: K, payload: PayloadFor<K>): Promise<ReplyFor<K>>;
  /** Attach to one session's topic. Returns a detach function. */
  attach(sessionId: string, handlers: {
    onOutput(chunk: string): void;
    onThrottled(active: boolean): void;
    onEnded(reason: TerminalEndReason): void;
  }): () => void;
  /** Client-sendable events only — input and resize. */
  send(sessionId: string, message: TerminalInput): void;
  onConnectionChange(cb: (connected: boolean) => void): () => void;
}
```

**A request that times out is a distinct outcome from one that is refused.**
`MACHINE_REQUEST_TIMEOUT_MS` elapsing means *the machine did not answer* — FR-014
— and the page renders the unreachable state for it. A `TerminalRefusal` means
the machine answered and said no, which renders a different sentence. Collapsing
them into one error type is how the spec's error state loses the distinction
FR-007 requires.

**The workspace id comes from the signed-in session, never from a URL or a
prop.** Same rule as `RealtimeLiveEventSource.resolveWorkspaceId`. Reuse that
resolution rather than adding a second one.

**Unrecognised `requestId`s are dropped silently.** The control topic is per
machine, so a second tab's replies arrive here too. That is expected traffic, not
an error, and logging it would fill the console during normal two-tab use.

## Checklist

- [x] `apps/web/src/lib/terminal-channel.ts` implementing the interface above
- [x] Requests carry a client-generated `requestId`; replies are matched to it;
      unmatched replies are dropped without logging
- [x] `MACHINE_REQUEST_TIMEOUT_MS` enforced, rejecting with a *timeout* outcome
      distinguishable from a refusal
- [x] Every inbound message parsed with the `T-M16-01` Zod schemas; anything that
      fails is dropped, logging the event name and nothing else
- [x] Every handler body wrapped — a throw inside a `supabase-js` broadcast
      callback surfaces nowhere
- [x] Channels torn down on detach; no listener survives a session ending
- [x] `onConnectionChange` reflects the Realtime connection state, so the page can
      go read-only (phase decision 3)
- [x] Unit tests with a faked channel: correlation, timeout, refusal-vs-timeout,
      a malformed message dropped, teardown leaving no listeners
- [x] `apps/web` typecheck and tests green

## Traps

**Sending an `output` event will fail, and it will fail quietly.** `T-M16-03`
pins the send policy to `input` and `request`. Realtime does not report a
policy-refused broadcast to the sender in a way `supabase-js` surfaces — the
message simply does not arrive. If a message ever seems to vanish, check the
event name before anything else.

**One channel per session, and unsubscribe when the pane changes.** Leaving old
session channels subscribed is how a page ends up rendering another session's
bytes into the visible terminal. The manager has no idea which pane is on screen;
that is this file's job.

**Do not re-resolve the workspace per channel.** `RealtimeLiveEventSource`
resolves it once per browser session and caches the promise, with a comment
explaining why. Two resolutions racing produce two channel sets and double
delivery.

**`connected` here is the Realtime connection, not the machine.** A machine can
be off while Realtime is perfectly healthy. Conflating them makes the page say
"lost contact" when the truth is "your machine is asleep" — two different
sentences in the spec's error state.

## Verification

- [x] `pnpm --filter web test` green including the new suites
- [~] Against the preview with a real machine: a `terminal.list` request from the
      browser console resolves with the machine's sessions — deferred to
      `T-M17-06`'s live pass, which has a real paired machine to test against;
      see Result
- [~] With the machine stopped: the same request rejects on timeout after
      `MACHINE_REQUEST_TIMEOUT_MS`, not immediately and not never — same deferral
- [~] Attaching and detaching twenty times leaves no accumulated channels —
      checked with `supabase.getChannels().length` — same deferral

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table

## Result

Built `apps/web/src/lib/terminal-channel.ts` mirroring `RealtimeLiveEventSource`'s
shape (once-per-instance workspace-id resolution, subscribe/teardown pattern),
scoped to one machine per instance (`RealtimeTerminalChannel(runtimeId)` /
`createTerminalChannel`) per phase decision 2. `request()` correlates by a
client-generated `crypto.randomUUID()` (not `nanoid` — that package is only a
declared dependency of `packages/core`, and `apps/web` already uses
`crypto.randomUUID()` for every other client-generated id, e.g.
`app/agents/actions.ts`). 22 unit tests in `terminal-channel.test.ts`, all
green, plus the existing 416 — 438 total. `pnpm --filter web typecheck` and
`pnpm --filter web test` both green.

**One shape decision the interface sketch left open, resolved here: a refusal
resolves the promise, only a timeout rejects it.** `request()`'s reply union
already carries `error` as a normal field on a well-formed reply (`T-M16-01`'s
schemas) — rejecting the promise for that too would be exactly the "collapsing
timeout and refusal into one error type" the task's own traps section warns
against. `TerminalRequestTimeoutError` is the one and only rejection path.

**`onThrottled` is wired into the interface but never invoked.** Read
`packages/core/src/terminal/manager.ts` before writing this and found DD-8's
throttle notice is sent as literal text in the output stream itself
(`THROTTLE_NOTICE`, written via `sink.write()`), not as a separate wire event —
there is no `throttled: boolean` signal on the wire for this file to relay.
Sniffing the output stream for that exact string would create two
representations of the same event with no guarantee they stay in sync, which
is worse than the gap. Left in the type signature (a caller may pass a handler
that never fires) rather than removed, since a real signal could arrive later
without a breaking interface change.

**`onEnded` fires `"closed"` for exactly one case: this same channel
instance's own successful `terminal.close` for an attached session.** That is
the only session-ending information this file actually has — the close reply
arrives on the control topic, which a passive session-topic listener never
sees. The phase README's other three reasons (`exited`, `machine_restarted`,
`access_switched_off`) are real per its error-state table, but resolving them
needs state this file doesn't keep (last-known geometry, last-seen
`machineStartedAt`) and depends on phase decision 3's reconnect flow, which
needs `cols`/`rows` that `attach()`'s signature — pinned by this task's own
interface sketch — does not carry. That reconnect-driven resolution belongs to
`T-M17-02`, calling `request("terminal.attach", …)` directly and reading
`error` off the reply rather than through `onEnded`. `TerminalEndReason` is
still defined as the full four-member union here so `T-M17-02` has one name to
import rather than inventing its own.

**A drift worth flagging for `T-M17-02`:** the M17 phase README's decision 3
says a `terminal.attach` reply's `unknown_session` case lets the page say why
"using the machine start time in that reply" — but `T-M16-01`'s shipped
`terminalAttachReplySchema` error variant is just `{ requestId, kind, error }`,
no `machineStartedAt`. Only `terminal.list`'s reply carries it. `T-M17-02`
will need an extra `terminal.list` round trip after an `unknown_session` to
recover that comparison, not a field already sitting on the reply it got.

`send()` requires `attach()` to have already resolved for that session (reuses
its channel rather than opening a second one — the phase's own trap against
duplicate session channels). Calling it earlier drops the input with a
console warning; documented as a precondition rather than queued, since
queuing keystrokes for a not-yet-attached pane is `T-M17-02`'s call to make if
it turns out to matter in practice.
