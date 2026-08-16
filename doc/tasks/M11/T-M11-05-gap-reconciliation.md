# T-M11-05 — Reconcile the gaps

| | |
|---|---|
| **Tag** | `[S]` — needs every other M11 task's outcome |
| **Serves** | `US3`–`US5`, and **SC-007** |
| **Depends on** | T-M11-01 … T-M11-04 |
| **Blocks** | — (last task of the plan) |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The criterion this satisfies

> **SC-007** — `G-12` and `G-16` are closed, or their residue rewritten to say
> exactly what is still unproved.

`G-13` joins them: T-M11-02 exercises its live half, which is most of what it
records.

## Objective

Turn the four preceding tasks' outcomes into the repo's permanent record —
gaps closed or rewritten, defects filed, the plan's Result written, and the
Knowledge Center brought in line with a product that now genuinely has remote
execution.

This is not paperwork. `KnownGaps.md` is what the next agent reads before
relying on something, and a gap left open after the pass that could have closed
it makes every other entry less trustworthy.

## The three gaps, and what each needs

### `G-12` — five M4 assertions proved in SQL or unit tests, not live

Its blocking item is *"the browser click-through pass never happened"*. M8's
and M10's verification passes are the click-through; T-M11-01–04 are the rest.

- [ ] If the browser pane rendered during M8/M10/M11: close the click-through
      bullet, and check whether **reassign** (needs a second machine) and
      **clone end-to-end** (needs a real remote) are now reachable
- [ ] If it did not: `G-12` stays open, but its text is **rewritten** — it
      currently reads as though nothing has been exercised, and after this
      phase a great deal has. Say precisely what remains
- [ ] Either way, the "unpaired local UI starting a run" claim is now testable
      — T-M11-04 scenario 2 puts a local UI in front of you

### `G-13` — M5 transcripts built and unit-tested, not verified live

- [ ] T-M11-02 scenario 2 closes the **live streaming** half if it passed
- [ ] The **60-second network cut** stays open unless the owner ran it
      (phase decision 4). If they did, close it; if not, leave it and say it is
      an owner decision rather than a missing capability
- [ ] The **second-device** and **cross-workspace subscribe** items need a
      second account — T-M11-03 does not supply one. Leave open, or close if
      M9's verification created a second account that is still available
- [ ] The **durable count comparison** is closed by T-M11-02's event-count
      assertion

### `G-16` — M7's routes never rendered, desktop shell never run

- [ ] T-M11-04 closes the entire desktop half if all three scenarios passed
- [ ] The **five routes** half is closed by clicking into each detail page from
      a list — `/imports`, `/teams/:id`, `/projects/:id`, `/tasks/goals/:id`,
      `/skills/:id` — **reached by clicking a row, never by typing a made-up
      id**. A fabricated id fails exactly the way a broken param does, so typing
      one proves nothing. Do this here if M8/M10's passes did not
- [ ] The **"everything behind a deployment"** bullet is closed outright by
      T-M11-01

## Checklist

- [ ] Each of `G-12`, `G-13`, `G-16` either **deleted** with the proof named,
      or **rewritten** to exactly the residue — no entry left in its pre-M11
      wording
- [ ] Any *new* gap opened by this phase written in the same shape: what breaks
      if the assumption is wrong, and the concrete thing that closes it
- [ ] Every defect found across T-M11-01–04 has a file in
      [`../../bug/`](../../bug/README.md) or
      [`../../security/`](../../security/README.md), with an index row
- [ ] Any defect worth fixing has a task — a new one in an existing phase, or a
      note that it needs its own plan. A bug file with no task is a bug nobody
      will fix
- [ ] [`../M3/T-M3-08-verification.md`](../M3/T-M3-08-verification.md),
      [`../M5/T-M5-06-verification.md`](../M5/T-M5-06-verification.md) and
      [`../M7/T-M7-04-verification.md`](../M7/T-M7-04-verification.md) updated
      in place with what this phase reached
- [ ] The **plan's** Status row and Result section written: which of the five
      stories are actually usable now, what was found that the plan did not
      anticipate, and what it spawned into the registers
- [ ] [`../MasterTaskQueue.md`](../MasterTaskQueue.md): bands 10–13 marked
      complete, and the blocked-items table updated — the "point a machine at
      staging" row and the `/runs/[runId]` transcript row both change
- [ ] [`../README.md`](../README.md) status table gains rows for M8–M11
- [ ] [`../../runbooks/README.md`](../../runbooks/README.md): the staging
      owner-action row flipped to done
- [ ] [`../../specs/README.md`](../../specs/README.md) index row updated to
      shipped
- [ ] **Knowledge Center pass (AGENTS.md §3.2).** This phase proves remote
      execution works for the first time. All four global-claim pages —
      `what-is-sparstrowgen.md`, `first-run-setup.md`, `limitations.md`,
      `providers-and-execution-modes.md` — are re-read against what was
      actually observed, and every edited article's `updated:` date bumped
- [ ] `pnpm -r typecheck` and `pnpm -r test` green, count recorded

## Traps

**Closing a gap because the phase that could have closed it ran, rather than
because the assertion passed.** The entry exists to record the strength of the
evidence. If the browser still does not composite, `G-12` does not close — it
gets rewritten. Rounding up here is the one failure that makes every other
ticked box in the repo suspect.

**Rewriting a gap is not the same as shrinking it.** If T-M11-02's transcript
was not progressive, `G-13` does not become smaller — it becomes a **bug file**,
and the gap closes because the unknown is now a known defect.

**The Knowledge Center pass is the item most likely to be skipped**, and
AGENTS.md §3.2 records why it matters: M1–M3 each passed their own verification
while leaving users told the app had no accounts and no remote access. This
phase is the one that finally makes remote execution true. Do not leave
`limitations.md` saying it is not.

**Do not mark the plan `✅ Completed` while any verification is unreached.**
Name which gap is why instead of rounding up
([`../README.md`](../README.md), "When a phase's tasks are fully completed").

## Verification

- [ ] `grep -n "G-12\|G-13\|G-16" doc/KnownGaps.md` — every match is either
      gone or in text written during this task
- [ ] The plan's Result section names which of US1–US5 the owner can actually
      use now
- [ ] Someone reading only `KnownGaps.md` after this task would correctly
      predict what is and is not proved

## On completion

- [ ] Tick 13.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and mark
      Band 13 complete
- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row — `✅ Completed <date>` only if every
      phase reads done and no verification is unreached

## Result

<!-- What the gaps say now, and why. Which stories the owner can use. What this
     phase found that the plan did not anticipate — every phase in this repo so
     far has found at least one. -->
