# T-M5-03 — Core transcript pusher

| | |
|---|---|
| **Tag** | `[P]` parallel — one new file plus a wiring line in `index.ts` and a small change in `run-reporter.ts` |
| **Depends on** | T-M5-01 |
| **Blocks** | T-M5-04, T-M5-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — 2026-08-11 |

## Objective

`packages/core/src/cloud/transcripts.ts` — subscribe to the event bus, batch, and
push. The daemon side of the durable path.

Replay after an outage is [T-M5-04](T-M5-04-durable-replay.md). This task builds
the happy path and the cursor it writes; that task makes the cursor the thing
recovery is built on.

## Decisions already made

**Ride the bus, not a hook in `RunManager`.** `run-reporter.ts` already
established this seam and its header says M5 subscribes to the same one. The bus
publishes `{ type: "run.event", runId, event }` from `recordEvent`
(`run-manager.ts:556`) **after** the local row is committed, which is the
ordering this task needs: nothing is ever pushed that is not already durable
locally.

**Batch on count, time, or bytes — whichever fires first**, using the three
`TRANSCRIPT_*` constants from [T-M5-01](T-M5-01-event-ingest-route.md). Phase
decision 3 explains why the byte budget exists and why it is half the Realtime
cap.

**One in-flight batch per run.** Out-of-order arrival is harmless durably
(upsert by `seq`) and visible live. Keep a per-run queue and a per-run in-flight
flag; different runs push concurrently, the same run never does.

**Advance the cursor from the server's `storedThroughSeq`**, never from what was
sent. A request that times out after the server committed is indistinguishable
from one that never arrived — the next push re-sends and the upsert absorbs it.

**Mirror the heartbeat's failure behaviour**, exactly as the command loop does:

- 403 → stop permanently, log once, name re-pairing as the fix
- 401 → re-read the token from the secret store, then retry
- network / 5xx → back off, log the *transition*, keep trying
- 404 → this run has no cloud row. Stop pushing **for that run only**, log once,
  and drop its queue. Not a global failure.
- `unref()` the timer

**The dispatched-set fix is this task's, and it is not cosmetic.**
`run-reporter.ts` calls `dispatched.delete(run.id)` when a run reports terminal.
The final events of a run — the result, the error, the last tool output — are
flushed after that. Sharing the set unchanged truncates the end of every
transcript, and the page looks complete, so nobody notices.

Move the set into `packages/core/src/cloud/dispatched.ts` with two consumers and
an explicit release:

```ts
markDispatched(runId)      // set by the command loop, as today
isDispatched(runId)        // read by both subscribers
releaseWhenFlushed(runId)  // called by the reporter on terminal;
                           // actually removes only once the pusher's queue
                           // for that run is empty and the cursor has reached
                           // the run's final local seq
```

`run-reporter.ts` swaps its `dispatched.delete(run.id)` for
`releaseWhenFlushed(run.id)` and changes nothing else. Keep
`resetDispatched()` as the test seam both suites already use.

## Checklist

- [x] `packages/core/src/cloud/dispatched.ts` — the shared set, `releaseWhenFlushed`
- [x] `run-reporter.ts` imports from it and calls `releaseWhenFlushed` on terminal
- [x] `packages/core/src/cloud/transcripts.ts` with `startTranscriptPusher()` / `stopTranscriptPusher()`
- [x] Wired into `packages/core/src/index.ts` beside `startCommandLoop()`, torn down in `shutdown()` **before** the heartbeat's `draining` declaration
- [x] Does nothing when unpaired — no timers, no log noise (`isPaired()`)
- [x] Does nothing for runs the cloud did not dispatch
- [x] Batching on count / interval / bytes, with the byte measurement taken on the encoded body
- [x] One in-flight batch per run; concurrent across runs
- [x] Cursor advanced from `storedThroughSeq` only — [T-M5-04](T-M5-04-durable-replay.md) owns the table
- [x] 403 / 401 / 5xx / 404 handled as above; `unref()` on the timer
- [x] A final flush on terminal, before `releaseWhenFlushed` lets go
- [x] 28 unit tests with fake timers (17 in `transcripts.test.ts`, 11 in `dispatched.test.ts`): batches by count, by interval, by bytes (chunked, not combined); serialises per run and runs concurrently across runs; advances from the server's number; drops a 404 run without stalling others; stops on 403; retries on 401 once still paired; backs off on network failure without losing the queue; the last event of a run is pushed after `run.completed`; `dispatched.ts`'s order-independence directly.

## Traps

**Flush on terminal, and prove it.** The last-events truncation this task exists
to prevent is invisible in the UI: a transcript that stops one event early looks
finished. Write the test as "a `run.completed` immediately after a `run.event`
still results in that event being pushed", not as "flush is called".

**`seq` is assigned in memory** (`state.seq++`) and restarts at 0 per run. It is
unique per run because `ActiveRun` lives for the run's lifetime — do not assume
it is unique per machine, and never use it as a key without the run id.

**The bus carries far more than run events.** `bus.subscribe` receives every
`WsServerEvent`. Filter on `type === "run.event"` first, before touching the
dispatched set — this callback runs on the hot path of a streaming agent.

**Do not log payloads.** The event payload is the agent's output and the user's
prompt. The batch-failed log line takes a run id and a `seq` range, nothing else.

**Do not re-enter the flush from inside a flush.** A push that fails and
immediately retries in the same tick is a hot loop against a down network. Back
off on the timer.

**Shut the pusher down before `draining`.** A batch started after the daemon
decided to exit either completes or is replayed from the cursor — the second is
fine, but only if the cursor was not advanced optimistically first.

## Verification

- [x] 28 unit tests green (748 total, up from 720)
- [ ] Live streaming, outage recovery, and the count comparison → **T-M5-06**

## On completion

- [ ] Tick 7.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — 2026-08-11

`dispatched.ts`, `transcripts.ts`, the `run-reporter.ts` handoff, wiring into
`index.ts`, and 28 tests. `pnpm -r typecheck` clean, 748 tests green (up from
720).

### The three-function API in this task's own spec was under-specified, and building it found a real race

The task's own snippet named three functions: `markDispatched`, `isDispatched`,
`releaseWhenFlushed`. Writing `releaseWhenFlushed` against that spec — "called by
the reporter on terminal; actually removes only once the pusher's queue is
empty" — runs into the question the snippet doesn't answer: WHO calls the
second half, and what happens if it runs before the first half?

It does run first, routinely. `run-reporter.ts` and `transcripts.ts` are two
independent `bus.subscribe` listeners reacting to the same event; which
`start*()` ran first in `index.ts` decides registration order, and the pusher's
own listener can complete SYNCHRONOUSLY when a run's queue happens to already be
empty (an `async` function with nothing to `await` runs its body immediately). A
naive "move the run from one Set to another" design loses the release outright
if the move-out call finds nothing to move.

The fix — `dispatched.ts`'s header explains it in full — is two independent
booleans (`terminalReported`, `flushConfirmed`) that combine into `isDispatched`,
rather than one flag two callers race to mutate. `dispatched.test.ts` asserts
both orders converge to the same state, including 50 interleaved cases
alternating which call goes first.

### A second, unrelated bug the SAME fix exposed in an existing test

`run-reporter.test.ts`'s `"stops tracking a run once it has finished"` broke —
correctly. It relied on `isDispatched()` flipping to `false` immediately after
terminal to ALSO stop the reporter from acting on any further event for that
run. That was always two different questions sharing one flag by accident: "is
there still a transcript to push" (the pusher's question, now legitimately
`true` for longer) and "have I already said everything there is to say about
this run's status" (the reporter's own question). Gave the reporter its own
`reportedTerminal` set rather than reusing `isDispatched()` for both purposes.

### The recursion-after-a-successful-flush bug, found by a test that looked like it was testing something else

Writing `"serialises pushes for the SAME run"` — asserting that a batch queued
while a request is in flight goes out the moment that request resolves, not
after a full interval — failed. Not a test-timing issue: `queue.inFlight` was
only being reset in the outer `finally` block, and the SUCCESS path's own
recursive `void flush(runId)` call (for "there's more, go again") runs BEFORE
`finally` fires — so the recursive call always saw `inFlight` still `true` and
bailed immediately. In production this meant a burst of events beyond one batch
arriving while a request was outstanding could sit unflushed until an unrelated
LATER event happened to nudge the queue again — not silent data loss (nothing
here is ever dropped), but a real, unbounded live-latency stall with no log line
marking it. Fixed by releasing the flag at the point of success, before any
recursive continuation, with `finally` kept as an idempotent safety net for
every other exit path.

### No persisted cursor, on purpose — and that is not a corner cut

The phase README's decision 2 names a `cloud_event_cursors` table. This task
does not create it. What it tracks — `RunQueue.pending`, in memory — is correct
for a live process and loses everything on a crash or restart, which is exactly
the boundary [T-M5-04](T-M5-04-durable-replay.md) is scoped to own: a durable
cursor plus a backfill pass reading local `run_events` directly. Building a
half-durable cursor here would be a second, worse implementation of the same
idea T-M5-04 has to get right anyway.
