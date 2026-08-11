# T-M5-03 — Core transcript pusher

| | |
|---|---|
| **Tag** | `[P]` parallel — one new file plus a wiring line in `index.ts` and a small change in `run-reporter.ts` |
| **Depends on** | T-M5-01 |
| **Blocks** | T-M5-04, T-M5-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `packages/core/src/cloud/dispatched.ts` — the shared set, `releaseWhenFlushed`
- [ ] `run-reporter.ts` imports from it and calls `releaseWhenFlushed` on terminal
- [ ] `packages/core/src/cloud/transcripts.ts` with `startTranscriptPusher()` / `stopTranscriptPusher()`
- [ ] Wired into `packages/core/src/index.ts` beside `startCommandLoop()`, torn down in `shutdown()` **before** the heartbeat's `draining` declaration
- [ ] Does nothing when unpaired — no timers, no log noise (`isPaired()`)
- [ ] Does nothing for runs the cloud did not dispatch
- [ ] Batching on count / interval / bytes, with the byte measurement taken on the encoded body
- [ ] One in-flight batch per run; concurrent across runs
- [ ] Cursor advanced from `storedThroughSeq` only — [T-M5-04](T-M5-04-durable-replay.md) owns the table
- [ ] 403 / 401 / 5xx / 404 handled as above; `unref()` on the timer
- [ ] A final flush on terminal, before `releaseWhenFlushed` lets go
- [ ] Unit tests with fake timers: batches by count, by interval, by bytes; serialises per run; advances from the server's number; drops a 404 run without stalling others; stops on 403; the last event of a run is pushed after the terminal status report

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

- [ ] Unit tests green
- [ ] Live streaming, outage recovery, and the count comparison → **T-M5-06**

## On completion

- [ ] Tick 7.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
