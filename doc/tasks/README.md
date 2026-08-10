# doc/tasks/

Executable specs, one folder per phase, plus the global run order.

```
doc/tasks/
├── MasterTaskQueue.md      global run order + concurrency tags
└── M2/
    ├── README.md           phase spec — shared decisions, endpoint surface, traps
    ├── T-M2-01-….md        individual tasks, each with a checklist
    └── …
```

The phase `README.md` holds what all its tasks share, so a decision is written
once and referenced, not copy-pasted into eight files and then updated in six.

## The bar

A task is ready when someone can work it **without asking the owner anything**:

- Every decision it needs is already made and written down, with its reasoning
- The exact files to create or change are named
- Traps and failure modes are called out before they're hit
- Verification is concrete enough to run, with unambiguous pass/fail

Decisions made *inside* a task, rather than inherited from its plan, go under a
**Decisions already made** heading so a reader can tell what was settled where.

## Open questions block one item, not the task

If converting a plan into tasks surfaces a question, it goes to
`../OpenQuestions.md` with the options framework from `AGENTS.md` §8 — and then
**only the checklist item that depends on it waits**:

```markdown
- [x] Batch writes to Postgres
- [~] Auto-commit dirty tree before yielding   ← blocked → OQ-1
- [x] Replay buffer oldest-seq first
```

Everything else in that task still gets built and ticked. The task is reported as
**done except OQ-1** — a real, closeable state. One missing piece must not stop
the plate being served.

When the question is answered: unblock the item, finish it, delete the entry from
`OpenQuestions.md`.

## Tags

Every task carries exactly one. "Concurrent" and "parallel" are split into three
tags rather than lumped into one, because they schedule differently:

| Tag | Meaning |
|---|---|
| `[S]` | **Sequential** — blocks dependents, run alone. Something downstream cannot start until this lands. |
| `[P]` | **Parallel** — no shared files with its siblings. Hand to different workers with zero coordination. |
| `[C]` | **Concurrent** — interleavable in any order, but touches shared files, so one worker at a time on those. |

The practical difference between `[P]` and `[C]`: two `[P]` tasks can be handed
to two agents right now with no coordination between them. Two `[C]` tasks can be
worked in the same session, in any order, but not blindly in parallel — they will
collide on a file. `MasterTaskQueue.md` mirrors this table for quick reference;
this is the canonical version.

## When a phase's tasks are fully completed

Nothing is deleted, moved, or archived. `doc/plans/` and `doc/tasks/` are an
append-only decision record, not a live working set that gets cleaned up —
`MasterTaskQueue.md`'s Band 0 (M1) is already this pattern in practice: the band
stayed in place and got marked done rather than being removed.

When every checklist item in a phase is `[x]` (or `[x]`/`[~] blocked → OQ-n`
where the open item is explicitly non-blocking for the plan, as M2's OQ-1 is):

1. **Phase `README.md`** — add a `Status: ✅ done <date>` line at the top.
2. **This file's status table** — flip that row to `✅ done`.
3. **`MasterTaskQueue.md`** — flip every task in that band's Status column to
   `done`. No reordering needed: a completed band is already earliest in run
   order, which is why Band 0 never had to move.
4. **The plan header** — update its `Status` row. If phases remain, name the next
   one (`M1 complete · M2 next`, the current pattern). If that was the last
   phase, the plan's status becomes `✅ Completed <date>`.
5. **Anything the phase spawned into `OpenQuestions.md`, `Deferred.md`, or
   `Ideas.md` stays exactly where it is.** Finishing a plan does not resolve its
   open questions or un-defer its deferrals — those have their own lifecycle and
   may outlive the plan that raised them, or spawn a new plan later.

A plan is genuinely closed only when every phase reads done and its `Open
questions` header line is empty or points only to non-blocking entries.

## Status

| Phase | Tasks | State |
|---|---|---|
| M1 — cloud schema, RLS, indexes | — | ✅ done, applied to staging 2026-08-09 |
| M2 — `/api/v1` from Next over Supabase | 8 (`M2/`) | ready, queued |
| M3 — pairing, registration, heartbeat | — | not decomposed |
| M4 — command spine | — | not decomposed |
| M5 — transcripts · M6 — memory sync · M7 — routes + Electron | — | not decomposed |

M3–M7 are scoped in the plan but have no task files yet. They get written when
their band is next: M4's spec depends on what M3's pairing flow actually turns
out to look like, and inventing that now would be fiction in a confident tone.

See `MasterTaskQueue.md` for the run order.
