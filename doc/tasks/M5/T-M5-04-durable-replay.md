# T-M5-04 — Durable replay: cursor, backfill, staleness ceiling

| | |
|---|---|
| **Tag** | `[C]` concurrent — shares `transcripts.ts` with 03; one worker at a time on that file |
| **Depends on** | T-M5-03 |
| **Blocks** | T-M5-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — 2026-08-11 |

## Objective

The property the phase is actually judged on: **a 60-second network outage
mid-run loses nothing.** Not "usually nothing" — the final cloud event count
equals the local count, `seq` is contiguous, and no `seq` appears twice.

## Decisions already made

**The local `run_events` table is the buffer** — phase decision 2. Core writes
every event to SQLite before it publishes to the bus, so the durable copy the
replay needs already exists, on the machine that will do the replaying, indexed
on `(run_id, seq)`.

This task therefore builds a **cursor**, not a buffer:

```sql
-- core migration 0017
CREATE TABLE cloud_event_cursors (
  run_id             TEXT PRIMARY KEY,
  pushed_through_seq INTEGER NOT NULL,
  updated_at         TEXT NOT NULL
);
```

Backfill is one query — `select … from run_events where run_id = ? and seq > ?
order by seq` — and it is the same query for a 60-second blip, a process crash,
and a laptop that was shut for a week. One code path for three scenarios is the
whole reason to prefer this over a spill file.

**Replay oldest-`seq` first, per run, one run at a time.** The plan says
oldest-first and it is right for a reason worth stating: a partially-replayed
transcript that starts in the middle reads as corrupt, while one that starts at
the beginning and stops reads as still-loading. Order the runs themselves by
their oldest unpushed event, so the run that has been waiting longest goes first.

**Backfill triggers on three things:** startup (paired, with a non-empty
backlog), the transition from failing to reachable, and a periodic sweep
(`TRANSCRIPT_BACKFILL_SWEEP_MS`, 60 s) that catches anything the other two
missed. The sweep is the one that makes this reliable rather than clever — it
costs one indexed query a minute against a table the process already has open.

**The cursor is written only after the server confirms**, from
`storedThroughSeq`. Advancing on send is how a transcript acquires a permanent
hole.

**The spill ceiling becomes a staleness ceiling.** A cursor is not deleted when
a run ends — it is deleted when the run's transcript is fully pushed
(`pushed_through_seq` = the run's max local `seq`) *and* the run is terminal.
What is left is a backlog, and it needs a bound:

- `TRANSCRIPT_BACKLOG_MAX_RUNS` (200) — the oldest cursors beyond this are
  dropped, with **one** `warn` naming how many and the oldest run id.
- `TRANSCRIPT_BACKLOG_MAX_AGE_DAYS` (14) — a run whose events never landed in two
  weeks will not land now; the cloud run row has long since been swept.

Dropping is a decision, so it is logged as one. Silent truncation of a backlog is
the same failure as a backup that never fires, and `KnownGaps.md` exists because
that class of failure is the one this project keeps finding.

**A dropped run does not leave a half transcript that claims to be whole.** When
a backlog entry is discarded, push a single `type: "system"` event at the run's
next `seq` recording that N events were lost to a backlog ceiling — if and only
if the cloud row still exists. A visible gap beats an invisible one.

## Checklist

- [x] `cloud_event_cursors` in `packages/core/src/db/schema.ts`, migration `0017` in `migrations.ts`
- [x] `packages/core/src/db/migration-0017.test.ts`, matching the shape of `migration-0016.test.ts`
- [x] Cursor read/write helpers, advanced only from `storedThroughSeq`
- [x] Backfill query: `seq > pushed_through_seq`, ordered by `seq`, chunked to the batch constants
- [x] Runs ordered by oldest unpushed event; one run replayed at a time
- [x] Triggers: startup, failing→reachable transition, 60 s sweep
- [x] Cursor deleted when the run is terminal **and** fully pushed
- [x] `TRANSCRIPT_BACKLOG_MAX_RUNS` / `TRANSCRIPT_BACKLOG_MAX_AGE_DAYS` enforced, each drop logged once
- [x] A discarded backlog leaves a `system` marker event when the cloud row still exists
- [x] Backfill is `unref()`-safe and stops before `draining`
- [x] 14 unit tests: 4 in `migration-0017.test.ts`, 10 in `transcript-backfill.test.ts` — restart resume with no gaps/no duplicates, cursor removed once terminal+caught-up, cursor left alone for a non-terminal run, empty-backlog no-op, periodic (not just startup) sweep, oldest-unpushed-event ordering, skip a run with an active in-memory queue, age ceiling drop + marker + one aggregate log line, count ceiling drop + one aggregate log line, a caught-up cursor is cleaned up with no marker.

## Traps

**A run that never reaches the cloud must not pin its cursor forever.** The 404
path in [T-M5-03](T-M5-03-transcript-pusher.md) drops the run from the live
queue; it must delete the cursor too, or the sweep will rediscover it every
minute for fourteen days.

**Do not hold the backfill query open while pushing.** Read a chunk, close the
statement, push, advance, read the next. A long-running SQLite cursor across an
`await` on a network call blocks writers on the same connection — including the
run that is still producing events.

**`sweepOrphans()` already exists and already ran.** After a restart, in-flight
dispatched runs were swept to `failed` locally, and M4's reporter observed that
their status was reported. Their *events* were not pushed, and they are exactly
the backlog this task replays. Do not assume a terminal local run has nothing
left to send — that assumption is what makes crash recovery quietly useless.

**Backfill and live push must not both send the same run.** Take the per-run
in-flight flag from T-M5-03; backfill is just another producer for the same
serialised queue, not a second path around it.

**The migration is additive and must be safe on a populated database.** Every
existing local run has no cursor, and that must mean "nothing to push", not
"push the entire history of every run this machine has ever executed" — the
measured local database holds 613 events across 27 runs, and none of those runs
has a cloud row. Seed the cursor for pre-existing runs at their max `seq`, or
gate the backfill on `isDispatched`, but **decide it in the migration and say so
there**, because the failure mode is one enormous replay on first boot.

## Verification

- [x] 14 unit tests green (753 total, up from 748)
- [x] Migration test green against a fresh and a populated database
- [ ] The 60-second outage assertion, the count comparison, and restart recovery
      → **T-M5-06**

## On completion

- [x] Tick 7.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — 2026-08-11

`cloud_event_cursors` (migration `0017`), cursor persistence wired into
`flush()`/`retire()`, the backfill sweep, the staleness ceiling, and 14 tests.
`pnpm -r typecheck` clean, 753 tests green (up from 748).

### Backfill and live push share one code path, not two coordinated ones

The trap this task's own doc names — "backfill is just another producer for
the same serialised queue, not a second path around it" — is implemented
literally: `enqueueBacklog()` reads a run's local backlog and pushes it into
the SAME `RunQueue.pending` array the live `run.event` handler uses, then calls
the SAME `flush()`. Nothing in `flush()`, `takeBatch()`, or the error handling
needed to change to accept a second producer — it already didn't know or care
where an event in its queue came from.

The sweep loop awaits one request per candidate (`await flush(runId)`) rather
than each candidate's full drain, which is deliberately not the same as
"replay one run fully before starting the next." `flush()`'s own continuation
for "there's more" is `void flush(runId)` — fire-and-forget, unchanged from
T-M5-03 — so awaiting one call resolves once that run's FIRST round trip
settles, throttling the burst of brand-new connections a large backlog would
otherwise open all at once on reconnect, without the alternative's risk: an
unreachable candidate would hang an "await full drain" loop forever, since its
own retry/backoff timer never resolves on its own.

### A design gap the tests found before it shipped: the staleness ceiling didn't exempt caught-up cursors from ITS scan, and that's correct

Writing "does not drop a run whose backlog is already caught up" assumed the
ceiling should skip caught-up rows entirely. It doesn't, and shouldn't: adding
that exemption would mean a SECOND correlated subquery in the ceiling's own
query, duplicating the one `backfillCandidates()` already runs, to protect
against a case `dropBacklogEntry()` already handles correctly — a caught-up
cursor computes zero lost events, so `dropBacklogEntry` sends no marker for it.
The row still gets swept, which is correct cleanup (equivalent to what
`retire()` would eventually do if the run ever reported terminal), and nothing
is silently lost because there was nothing left to lose. Fixed the TEST, not
the implementation, once this was worked through — recorded here because the
first version shipped with the wrong expectation, not the wrong code.

### `flush()`'s cursor advance had to land on the SAME line the splice already trusts

`queue.pending.splice(0, batch.length)` — trusting the local batch size,
because the route accepts a batch whole or not at all. `advanceCursor()` sits
immediately after it but reads from `response.storedThroughSeq`, not
`batch.length` or `lastSent` — per phase decision 2, on purpose: the in-memory
splice and the durable cursor are allowed to disagree about *why* they moved
(one trusts the request, one trusts the response), but only one of them may
ever decide where the cursor sits.

### Every new test needed a real, unmocked clock — and the first version didn't have one

Several tests seed a cursor's `updated_at` with a fixed calendar string, meant
to read simply as "not now." `enforceBacklogCeiling()` compares against the
REAL `Date.now()` (`vi.useFakeTimers()`'s clock, itself initialized to the
actual wall-clock time unless explicitly set), and a hardcoded date some seven
months old is unconditionally more than fourteen days old to whatever "today"
actually is when the suite runs — every one of those tests tripped the age
ceiling before reaching the behavior it meant to exercise, including the
count-ceiling test, whose 205 fixture rows were ALL "ancient" and got caught by
the age check first rather than the count check. Fixed with a `recentTimestamp()`
helper reading the (fake) clock at call time, and ascending offsets from it
for ordering-sensitive fixtures — deliberately not a frozen constant, so the
suite stays correct regardless of which day it happens to run on.
