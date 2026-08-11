# T-M4-06 — Run status reporting, and closing G-4

| | |
|---|---|
| **Tag** | `[C]` concurrent — edits `run-manager.ts` and `index.ts`, which T-M4-04 also touches |
| **Depends on** | T-M4-02 |
| **Blocks** | T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified 2026-08-10 |

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

- [x] `packages/core/src/cloud/run-reporter.ts` — subscribe, filter to dispatched runs, post
- [x] Started and stopped in `index.ts` alongside the command loop
- [x] Transitions posted: `running` (with `startedAt`), and the terminal status with `finishedAt`, `error`, `resultText`, `costUsd`, `numTurns`, `durationMs`, `untrusted`
- [x] Bounded retry queue, oldest-dropped, retried on the next tick
- [x] Never posts for a run the cloud did not dispatch
- [x] `run-manager.ts`: busy key held across the snapshot, released on every path (`G-4`)
- [x] `G-4` deleted from `KnownGaps.md`, with the proof named
- [x] 9 reporter tests: posts on transition, skips local runs, retries a dropped post in order, drops oldest when full, discards everything on revocation
- [x] 5 finalize tests in `run-manager-finalize.test.ts`: key held during the snapshot, released on success, released when the snapshot throws, handoff still runs, snapshot precedes handoff

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

- [x] 14 unit tests green across the reporter and finalize
- [ ] Live: a dispatched run shows `running` then its terminal state with metrics → **deferred to T-M4-08**
- [ ] Live: a locally-triggered run produces no status posts → **deferred to T-M4-08**
- [ ] `G-4`'s guard observed under two concurrent same-project runs → **deferred to T-M4-08**

## On completion

- [x] Tick 6.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-10

14 tests: 9 on the reporter, 5 on `finalize`.

### `G-4` is closed, and now has a test it never had

The gap was recorded as accepted-not-solved. M4 re-made the trade rather than
ignoring it: `finalize()` holds `state.busyKey` across the snapshot and releases
it in the settled `.then`, which runs on both the success and the caught-error
paths.

The half that actually needed proving is the failure path. A snapshot that
throws and leaks the key wedges that agent+project identity **for the life of
the process** — a worse failure than the race it replaced, and one that presents
as "the agent just stopped picking up work". `run-manager-finalize.test.ts`
asserts the key is still held while the snapshot is in flight, released when it
resolves, released when it throws, and that handoff runs either way.

There was no `run-manager.test.ts` before this, because `finalize()` is private
and normally reached only through a real spawn. It is called directly with a
fabricated `ActiveRun`; the alternative was a provider binary in unit tests.

`G-4` is deleted from `KnownGaps.md`, naming that file as the proof.

### Only runs the cloud dispatched are reported

A busy machine runs far more work than the cloud asked for — cron, handoffs, the
local UI — and none of it has a cloud run row. The reporter consults a set of
dispatched ids seeded by the command loop, so local runs produce no
authenticated round trip and no 404 in anyone's log.
