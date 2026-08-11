# T-M4-06 — Run status reporting, and closing G-4

| | |
|---|---|
| **Tag** | `[C]` concurrent — edits `run-manager.ts` and `index.ts`, which T-M4-04 also touches |
| **Depends on** | T-M4-02 |
| **Blocks** | T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

## Objective

The browser sees a dispatched run start, finish, and carry its cost and duration
— without a single `run_event` crossing the wire.

## Decisions already made

**The run row only. Transcripts are M5.** This is the line that keeps M4
falsifiable: if a run reaches `succeeded` in the cloud, the spine works, and it
is provable in one afternoon. Adding event batching here would mean a failure in
either half looks identical.

**Report from the existing event bus**, not from inside `RunManager`. The bus
already publishes `run.created`, `run.completed` and the lifecycle in between,
`packages/core/src/events/bus.ts` is the established seam, and M5 subscribes to
the same bus for events. A reporter that reaches into the run manager would have
to be unpicked in M5.

**Only report runs the cloud knows about.** A locally-triggered run — cron, a
handoff, the local UI — has no cloud row, and posting its status would 404 every
time. The cheap discriminator is the id: a cloud-dispatched run carries the id
the cloud generated. Keep a set of dispatched run ids for the process lifetime,
seeded by the command loop, and consult it before posting.

> This is deliberately not "report everything and let the cloud sort it out".
> Local runs on a busy machine outnumber dispatched ones, and each one would be a
> pointless authenticated round trip that logs a 404.

**Buffer is small and bounded here.** One retry queue, capped at a few hundred
entries, dropping oldest, in memory. The durable offline buffer with a spill
ceiling is M5's, where the volume justifies it. A status post lost to a network
blip self-corrects on the next transition; the terminal one is retried until it
lands or the process exits.

**Post terminal status *before* the WIP snapshot.** `finalize()` publishes
`run.completed` and then snapshots; the browser should not wait on git plumbing
to see the run finish.

### Closing `G-4`

`finalize()` currently releases the busy key, then snapshots — so an unrelated
scheduler tick can start a run on that project mid-snapshot. Phase decision 9
closes it: hold `state.busyKey` until the snapshot settles, then delete it and
`tick()`.

Two things to get right:

- The key must be released on **every** path, including the snapshot throwing.
  The existing chain already `.catch()`es the snapshot; put the release in a
  `finally`-equivalent on that chain, not after it.
- Handoff stays chained after the snapshot, as it is today, and must run whether
  or not the snapshot succeeded — that comment at the call site is load-bearing.

Then **delete the `G-4` entry from `doc/KnownGaps.md`** in the same change,
saying where the proof lives. That is the file's own rule.

## Checklist

- [ ] `packages/core/src/cloud/run-reporter.ts` — subscribe, filter to dispatched runs, post
- [ ] Started and stopped in `index.ts` alongside the command loop
- [ ] Transitions posted: `running` (with `startedAt`), and the terminal status with `finishedAt`, `error`, `resultText`, `costUsd`, `numTurns`, `durationMs`, `untrusted`
- [ ] Bounded retry queue, oldest-dropped, retried on the next tick
- [ ] Never posts for a run the cloud did not dispatch
- [ ] `run-manager.ts`: busy key held across the snapshot, released on every path (`G-4`)
- [ ] `G-4` deleted from `KnownGaps.md`, with the proof named
- [ ] Unit tests: posts on transition, skips local runs, retries a failed post, drops oldest when full
- [ ] Unit test: a snapshot that throws still releases the busy key and still runs handoff

## Traps

**`untrusted` is stamped at finalize, not at spawn** (EH6/EH7 — external-content
tool use is only knowable from the finished transcript). Read it from the run row
after the update, not from anything computed earlier.

**Do not block `finalize()` on the network.** The post is fire-and-forget into
the retry queue. A daemon whose control plane is slow must not slow down its own
runner.

**The status route is monotonic** (T-M4-02), so a retried `running` arriving
after `succeeded` is dropped server-side. Do not add client-side ordering logic
on top; two mechanisms for one invariant is one too many.

**Holding the busy key consumes a global concurrency slot**, not just that
identity's. That is the accepted cost in decision 9. If the snapshot ever grows
unbounded — a full clone, a large binary tree — reopen it rather than quietly
widening the hold.

## Verification

- [ ] Unit tests above
- [ ] Live: a dispatched run shows `running` in the browser within a second of starting, and its terminal state with metrics
- [ ] Live: a locally-triggered run produces no daemon status posts (check the log)
- [ ] Deferred to T-M4-08: `G-4`'s guard observed under two concurrent same-project runs

## On completion

- [ ] Tick 6.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
