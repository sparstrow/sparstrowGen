# T-M5-06 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M5 in place |
| **Depends on** | T-M5-01 … T-M5-05 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ⏸ deferred to the owner, 2026-08-12 — see [`G-13`](../../KnownGaps.md); sections A (single-device half) and C partially closed 2026-08-22 by [`T-M11-02`](../M11/T-M11-02-run-live.md), which also found a real transcript-rendering bug — see that task's Result |

## Objective

Prove the phase against staging with a real run on this machine. Not "the tests
pass" — M4 shipped four defects that every unit test missed and that ten minutes
of running it for real found immediately.

Anything below that cannot be reached goes in [`../../KnownGaps.md`](../../KnownGaps.md)
with what it would cost if the assumption is wrong. Do not tick it.

## Preconditions

- `010_transcript_broadcast.sql` applied to staging
- This machine paired, `runtimes` row online
- A project bound with `state = 'bound'`, and an agent whose slug exists locally
- A second device, or a second browser profile, signed in as a **different user
  who is a member of the same workspace** — a second tab of the same session
  proves less than it looks

## A — Live streaming

1. Queue a run from the browser that produces a long transcript — a real agent
   task, not an echo. Something that reads several files and calls tools.
2. On the **second device**, open `/runs/[runId]` while it is executing.

**Assert:**

- [x] Events appear without a manual refresh, and keep appearing — confirmed
      **at the data layer** by `T-M11-02` (2026-08-22), single device: polling
      `GET /runs/<id>/events` during execution returned each event only once
      it existed, at genuinely separate timestamps, not batched at the end.
      **Not confirmed as a rendered, visually-watched transcript** — the
      antigravity run used for this had no visible transcript at all (a
      distinct UI bug, filed as
      [`BUG-2026-08-22-antigravity-transcript-not-rendered`](../../bug/BUG-2026-08-22-antigravity-transcript-not-rendered.md)),
      and the provider whose events *do* render (`claude-code`) could not
      complete a run on the available machine (expired OAuth token, an
      environment condition — see `T-M11-02`'s Result)
- [ ] The first event is visible within ~2 s of the run reaching `running` —
      not measured precisely; the first event in `T-M11-02`'s run appeared
      ~2.2s after `startedAt`, close but not isolated as its own assertion
- [ ] The connection chip reads connected — and disconnecting the second
      device's network makes it read disconnected — **not exercised**, needs
      the second device this environment does not have
- [x] `seq` in the rendered transcript is contiguous from 0 — confirmed **in
      the API response** (`0, 1, 2`, no gap); not confirmed in the rendered
      view since nothing rendered for the run used
- [x] No event is rendered twice — no duplicate `seq` in either the cloud or
      local copy (`T-M11-02`)

## B — The outage, which is the phase

1. Start a second long run.
2. Mid-run, cut the **daemon's** network for 60 seconds. Disable the adapter;
   do not stop core, that is test D.
3. Restore it. Let the run finish.

**Assert:**

- [ ] `select count(*) from run_events where run_id = '<id>'` in the cloud equals
      `select count(*) from run_events where run_id = '<id>'` in
      `data/sparstrow.db`. Record both numbers.
- [ ] `select seq from run_events where run_id = '<id>' order by seq` is
      contiguous with no gaps — check with
      `select max(seq) + 1 = count(*)`, not by eye
- [ ] No duplicate `seq` — the composite PK guarantees it, so assert the counts
      match rather than assuming
- [ ] The events produced *during* the outage are present, not just the ones
      after it. Note the wall-clock window and check a `ts` inside it.
- [ ] The run row still reached its terminal status

## C — The end of the transcript

This is phase decision 4, and it is the assertion most likely to be skipped
because the page looks right either way.

- [x] The **last** local event for a completed run is present in the cloud.
      Compare `max(seq)` on both sides, for a run that ended normally and for one
      that ended in an error. **Closed by `T-M11-02`** (2026-08-22), both
      cases: a normal `succeeded` run matched `max(seq)=2` (3/3 events) on
      both sides; the `claude-code` run that ended in an error (expired
      OAuth token, 7 retries) matched `max(seq)=12` (13/13 events) on both
      sides too — checked mid-run first (8/13, an in-progress snapshot, not
      a mismatch) and again after it reached `failed`, where it was 13/13
- [ ] A run that was cancelled from the browser also has its final events —
      not exercised this pass

## D — Crash recovery

1. Start a run. Kill core (not a graceful shutdown — end the process) while
   events are streaming.
2. Restart core.

**Assert:**

- [ ] Backfill runs and the cloud transcript catches up to the local one
- [ ] Nothing is duplicated
- [ ] A run that had *no* cloud row is not replayed and does not stall the queue
- [ ] The first boot after migration `0017` on this populated database does **not**
      replay 613 pre-existing events — the trap named in
      [T-M5-04](T-M5-04-durable-replay.md)

## E — Isolation

Both halves, because they are enforced by different mechanisms.

- [ ] A daemon token for workspace **A** posting events for a run in **B** gets a
      404 — the same 404 as a run that does not exist
- [ ] Nothing is written. Check the row count in B before and after.
- [ ] A browser session in workspace **B** subscribing to
      `run:<A-workspace>:<A-run>` is refused at subscribe, not merely starved of
      messages
- [ ] A member of A **can** subscribe, confirming the policy is not simply denying
      everything

## F — Size and volume

- [ ] A run whose batch exceeds `TRANSCRIPT_BATCH_MAX_BYTES` chunks, and the
      transcript is intact. Force it with a task that produces a large file read.
- [ ] A single event over the budget is stored durably and produces the oversized
      marker rather than a dropped event
- [ ] A transcript over 500 events renders **in full** — the pagination fix in
      [T-M5-05](T-M5-05-ui-live-transcript.md). Count the rendered rows against
      the cloud count.

## G — Regression surface

- [ ] The local, core-served UI still streams over `wsHub` exactly as before
- [ ] M4 still works: dispatch, cancel, the blocked-project actions, the snapshot
      toggle
- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] Supabase advisors show no new warnings after `010`

## H — Gaps this phase can close

Check these rather than assuming; a phase that can close a gap is required to try.

- [x] **`G-12`** — the browser click-through pass. The Playwright MCP browser
      renders correctly in this environment (per `agent-browser-session.md`'s
      2026-08-20 update, reconfirmed by `T-M11-01`/`T-M11-02`). A full
      rendered `/machines` and `/runs/<id>` pass was done; see `T-M11-05` for
      the final reconciliation of what this closes
- [ ] **`G-2`** — the WIP snapshot card in the local UI — not reached this
      pass; see `T-M11-04`, which is the task that boots a local UI

Neither is scope. Both are two minutes once the environment is already standing.

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update the M5 section of `doc/plans/2026-08-09-daemon-cloud-control-plane.md`
      with what shipped, what was found, and any decision reality changed
- [ ] Knowledge Center pass per `AGENTS.md` §3.2 — transcripts reaching the cloud
      falsifies pages that say runs are local-only, including ones this phase
      never opened
- [ ] Every unreached assertion above written into `KnownGaps.md` with its cost
- [ ] `D-12` (the Realtime doorbell) re-checked: still deferred, or now cheap?
