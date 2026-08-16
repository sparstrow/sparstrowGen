# T-M11-02 — A run, live

| | |
|---|---|
| **Tag** | `[C]` — drives the same machine and workspace as T-M11-03; interleavable, not simultaneous |
| **Serves** | `US3` — send work from the browser and watch it run on that machine |
| **Depends on** | T-M11-01 |
| **Blocks** | T-M11-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenarios this satisfies

> 1. **Given** an active machine, **When** I start a run from the browser,
>    **Then** it begins on that machine within seconds, untouched by me.
> 2. **Given** a run is executing, **When** I watch it, **Then** the transcript
>    appears progressively, not only at the end.
> 3. **Given** the run finished, **When** I reload, **Then** its final status
>    and full transcript are still there.
> 4. **Given** I try a host-local action in the hosted app, **When** it refuses,
>    **Then** it explains this needs the machine directly.

**Independent test:** queue one run from `staging.sparstrow.com`, watch its
transcript while it executes on the paired machine.

## Objective

The first time work has ever crossed from a deployed browser to a real machine
in this project. This is also the live half of [`G-13`](../../KnownGaps.md) —
M5's transcript path has been built, unit-tested, and never seen.

## Prerequisites

- T-M11-01 complete: a machine active on staging.
- **An agent provider genuinely installed and authenticated on that machine.**
  The capability badges from T-M11-01 say which. A run dispatched to a provider
  that is registered but not really present dies at spawn, and that failure
  looks like a dispatch bug.
- A project bound on that machine, or a run that needs no project. Check
  `/api/v1/runtime-projects` if unsure — an unbound project parks the task in
  `project_not_available` rather than running, which is correct behaviour and
  the wrong thing to be testing here.

## Checklist

### Scenario 1 — it starts on the machine

- [ ] Start a run from `staging.sparstrow.com` against the paired machine
- [ ] It begins within **one poll interval** (`COMMAND_POLL_INTERVAL_MS`, 3s) —
      not instantly; there is no doorbell ([`D-12`](../../Deferred.md)) and 3s
      is correct, not a defect
- [ ] Confirm it is genuinely executing **on the machine**: a process is
      visible there, or the machine's own logs show it. A cloud row saying
      `running` is not proof of local execution
- [ ] The run row reaches a terminal status with its metrics (cost, turns,
      duration)

### Scenario 2 — the transcript is live

- [ ] Open `/runs/<id>` **while the run is executing**
- [ ] Transcript events appear **progressively**, before the run ends. This is
      the assertion `G-13` exists for — a transcript that only fills in at the
      end is a failure, not a slow success
- [ ] No duplicate `seq`, no visible gap
- [ ] If the run is short, start a longer one. A run that finishes in two
      seconds cannot demonstrate progressive rendering

### Scenario 3 — it persists

- [ ] Reload `/runs/<id>` after completion. Final status and the **full**
      transcript are present
- [ ] Compare the cloud `run_events` count for that run against the machine's
      local SQLite count — they match. A mismatch is a real defect and gets a
      bug file
- [ ] A long run's transcript is not truncated at 500 events (M5 fixed the
      pagination cap; confirm it stayed fixed)

### Scenario 4 — host-local refuses legibly

- [ ] In the hosted app, try a terminal, a host filesystem browse, and a git
      operation
- [ ] Each returns a 501 whose message says it runs on the local daemon and is
      not available from the web app — the deliberate refusals in
      [`stubs.ts`](../../../apps/web/src/lib/api/handlers/stubs.ts)
- [ ] Confirm they still **refuse**. A helpful-looking fix that made one of
      these work is a regression, not an improvement

## Traps

**A green run status proves M4, not M5.** They are separate assertions. Tick
scenario 1 and scenario 2 independently, and do not let the first stand in for
the second — that substitution is exactly why `G-13` is still open.

**Realtime is the fast path, not the delivery guarantee.** If events appear
only on reload, the broadcast failed and the durable path saved it. That is the
system working *and* scenario 2 failing. Say both.

**Vercel function timeouts.** A long-running request against a serverless
route can be cut off. The transcript path is designed around this — batches are
short requests — but if something times out, record the exact route.

**Do not revoke anything.** T-M11-03 does that, deliberately, and running it
first strands this task.

## Verification

- [ ] All four scenarios ticked or annotated with what blocked them
- [ ] The `run_events` count comparison recorded numerically in the Result
- [ ] Anything unreached written up in
      [T-M11-05](T-M11-05-gap-reconciliation.md), not silently dropped

## On completion

- [ ] Tick 13.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Tick or annotate the corresponding sections of
      [`../M5/T-M5-06-verification.md`](../M5/T-M5-06-verification.md)
- [ ] Any defect found → a bug file, in the same turn

## Result

<!-- Which agent, which provider, run duration, event counts local vs cloud,
     and whether the transcript was genuinely progressive. -->
