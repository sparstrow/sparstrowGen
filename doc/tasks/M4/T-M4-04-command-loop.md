# T-M4-04 — Core command loop

| | |
|---|---|
| **Tag** | `[P]` parallel — new file plus one wiring line in `index.ts` |
| **Depends on** | T-M4-02 |
| **Blocks** | T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

## Objective

`packages/core/src/cloud/commands.ts` — poll, claim, dispatch, ack. The loop that
turns a row in Postgres into a process on this machine.

## Decisions already made

**Poll every `COMMAND_POLL_INTERVAL_MS` (3s), imported from `@sparstrow/shared`.**
No Realtime doorbell in M4 — phase decision 1 explains why, including why doing
it later is cheaper than doing it now.

**Single-flight.** A poll that takes longer than the interval must not overlap
with the next one. Guard with an in-flight boolean, not a queue: a skipped tick
costs 3 seconds and the next poll sees the same rows.

**Ack immediately after the local row is created**, never after the run finishes
— phase decision 2. `createRun()` returns as soon as the row is inserted, which
is the natural ack point.

**Mirror the heartbeat's failure behaviour exactly.** It is the file next door,
it has been through a live verification, and a second loop with different rules
for the same failures is how two subsystems end up disagreeing about whether a
machine is paired:

- 403 → stop permanently, log once, name re-pairing as the fix
- 401 → re-read the token from the secret store, then retry
- network/5xx → back off, log the *transition*, keep trying
- `unref()` the timer

**Every dispatch outcome is an ack.** A thrown `HttpError` from `createRun` — a
disabled agent, a missing agent, a quarantined agent — is a `failed` ack with a
reason, not an exception that escapes the loop. An unhandled throw here stops
every other command on the machine because of one bad row.

**Unknown `kind` acks `failed` with `unknown_kind`.** A newer control plane may
enqueue a command an older daemon has never heard of. Failing it explicitly means
the board shows why; ignoring it means the command is re-claimed until it hits
the attempts ceiling and silently expires.

## Dispatch

| Kind | Action |
|---|---|
| `run.start` | Resolve + preflight ([T-M4-05](T-M4-05-resolution-preflight.md)), then `runManager.createRun({ id: payload.runId, … })` |
| `run.cancel` | `runManager.cancel(payload.runId)`; a run already terminal or unknown locally acks `done`, not `failed` |
| `project.clone` | Delegated to [T-M4-05](T-M4-05-resolution-preflight.md), which owns bindings and local project rows |
| `settings.set` | Allowlisted key → write to the local settings table ([T-M4-07](T-M4-07-ui-blocked-and-toggle.md) owns the UI half) |

`settings.set`'s allowlist is `git.wipSnapshot` and `git.wipSnapshotKeep`
(`SETTING_WIP_SNAPSHOT` / `SETTING_WIP_SNAPSHOT_KEEP` in
`packages/shared/src/constants.ts`). Anything else acks `failed`. Without the
allowlist this command is a remote write into every setting the machine has.

`createRun` gains an optional `id` so the local run carries the cloud's id —
phase decision 4. That is the whole change to the runner: one field, defaulting
to the existing `run_${nanoid(12)}`. Guard it — a supplied id that already exists
locally is a replay, and the correct response is to ack `done` without creating
anything.

## Checklist

- [ ] `packages/core/src/cloud/commands.ts` with `startCommandLoop()` / `stopCommandLoop()`
- [ ] Wired into `packages/core/src/index.ts` beside `startHeartbeat()`, and torn down in `shutdown()` **before** the heartbeat's `draining` declaration
- [ ] Does nothing at all when unpaired — no polling, no log noise (`isPaired()`)
- [ ] Single-flight guard
- [ ] All three kinds dispatched; unknown kinds acked `unknown_kind`
- [ ] Every path acks exactly once, including thrown `HttpError`
- [ ] `createRun` accepts an optional `id`; duplicate id acks `done` without side effects
- [ ] `unref()` on the interval
- [ ] Unit tests with fake timers: claims and dispatches, single-flights, backs off, stops on 403, recovers on 401, acks on `createRun` throw, ignores duplicates

## Traps

**Stop the command loop before declaring `draining`.** A command claimed after
the daemon decided to shut down is a lease held by a process that is about to
exit — it recovers, but only after the lease expires, and the run looks stuck for
a minute for no reason.

**Do not re-enter `tick()` yourself.** `createRun` already schedules it. Calling
it from the loop as well makes concurrency behaviour depend on poll timing.

**The prompt is user content.** It goes in a log line at your peril.

**`claimed` is not `executing`.** Acking a claim is what releases the lease; if
the process dies between claim and ack, the lease expiry is what saves the
command. Test that path — restart mid-claim is a T-M4-08 assertion.

## Verification

- [ ] Unit tests above
- [ ] Live: with core paired and running, a command enqueued from the browser is claimed within one interval and appears in the log
- [ ] Deferred to T-M4-08: end-to-end execution and the restart-mid-claim case

## On completion

- [ ] Tick 6.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
