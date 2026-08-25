# T-M6-05 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M6 in place |
| **Depends on** | T-M6-01 … T-M6-04 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove the phase against staging with real notes on real paired machines.
Same bar M4/M5 set: run it for real, not just green tests — M4 shipped four
defects and M5 two design corrections that only running the thing for real
found.

**This task needs a second paired machine.** Everything here that requires
one is marked; if only one machine is available when this runs, do those
sections and record the rest in `KnownGaps.md`, following `G-13`'s shape
rather than skipping silently.

## Preconditions

- Two machines paired to the same workspace (call them A and B), or one
  machine plus a second workspace account for the isolation tests
- Both machines' cores running, both `runtimes` rows online

## A — Basic propagation

1. On A, create a note (any scope) via the UI or `memory_save`.
2. Watch B: either wait for `MEMORY_SYNC_SWEEP_MS`, or confirm the
   `memory.sync` command arrives within one `COMMAND_POLL_INTERVAL_MS` (3s) of
   A's push landing.

**Assert:**

- [ ] The note appears as a `.md` file in B's vault, at the SAME
      vault-relative path A has it at
- [ ] `select id from memory_notes where id = '<id>'` returns the SAME id on
      both machines
- [ ] `memory_search` on B returns it for a query matching its content
- [ ] B's `memory_chunks`/`memory_fts`/`memory_vec` rows exist for it — B
      indexed it locally, it did not arrive pre-chunked
- [ ] The push request body from A (captured via logs or a network tap) never
      contains anything resembling a 384-float vector — confirms decision 3
      by absence, not by trusting the schema alone

## B — The cloud round-trip is real

- [ ] `select content, content_hash, updated_at from memory_notes where id =
      '<id>'` in the CLOUD table matches what A pushed, byte for byte
- [ ] The cloud row has no populated vector/embedding column — there isn't
      one; confirm the migration never added one

## C — Conflict resolution

1. Disconnect B's network. Edit the SAME note on both A (online) and B
   (offline), with genuinely different content.
2. Reconnect B.

**Assert:**

- [ ] No error on either machine, and no duplicate file appears anywhere
- [ ] The machine with the later `updatedAt` wins on BOTH machines eventually
      (the loser's local content gets overwritten by the winner via pull —
      confirm this actually happens, not just that the cloud row is correct)
- [ ] Re-run with IDENTICAL content on both sides (a coincidental
      simultaneous no-op edit) — confirm the hash-equal short-circuit means
      neither machine's `updatedAt` "wins" anything visible; nothing flips
      unnecessarily

## D — Catch-up without a doorbell

1. Pair a third scenario: stop B's core entirely (not just network — kill
   the process).
2. On A, create two or three new notes.
3. Restart B's core after the `memory.sync` commands from step 2 have long
   since expired (wait past M4's attempts ceiling, or just wait a few
   minutes).

**Assert:**

- [ ] B catches up on its own, via the startup sweep, with no command needed
      for these specific notes
- [ ] Nothing is duplicated, nothing is missing

## E — Isolation

- [ ] A daemon token for workspace X pushing a note lands only in X's cloud
      rows — confirm by querying as workspace Y and finding nothing
- [ ] A pull request from workspace Y's token never returns workspace X's
      notes, even ones created after Y's cursor
- [ ] A `memory.sync` command is never enqueued for a runtime outside the
      pushing workspace

## F — Regression surface

- [ ] Local-only memory features still work unchanged when unpaired: create,
      edit, search, quarantine, archive — none of this phase's code path may
      be load-bearing for the local-only case
- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] Supabase advisors show no new warnings

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update the M6 section of `doc/plans/2026-08-09-daemon-cloud-control-plane.md`
      with what shipped and what was found
- [ ] Knowledge Center pass per `AGENTS.md` §3.2 — memory now syncs across
      machines, which falsifies any page still describing memory as
      single-machine-only
- [ ] Every unreached assertion above written into `KnownGaps.md` with its cost,
      matching `G-13`'s shape if a second machine was unavailable
