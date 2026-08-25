# doc/tasks/

Executable specs, one folder per phase, plus the global run order.

```
doc/tasks/
├── MasterTaskQueue.md      global run order + concurrency tags
├── M2/
│   ├── README.md           phase spec — shared decisions, endpoint surface, traps
│   ├── T-M2-01-….md        individual tasks, each with a checklist
│   └── …
├── M3/                     same shape, one folder per phase
├── M4/
├── M5/
├── M6/
└── M7/
```

The phase `README.md` holds what all its tasks share, so a decision is written
once and referenced, not copy-pasted into eight files and then updated in six.

**The procedure that produces this folder is the `decomposing-plans` skill**
(`.claude/skills/decomposing-plans/`), owned by the `architect` agent — load
it before writing any task file. It is the third step of the chain
`writing-specs` → `writing-plans` → `decomposing-plans` → code.

**Skeletons for all three live in [`../templates/`](../templates/README.md)** —
[`phase-spec.md`](../templates/phase-spec.md) for a phase `README.md`,
[`task.md`](../templates/task.md) for an individual task, and
[`verification-task.md`](../templates/verification-task.md) for the `[S]` task
every phase ends with.

## Two kinds of phase

Phases come in two shapes, and every phase declares which it is in its
`README.md` **Kind** row. The split is decided in the plan's Work breakdown,
using one test:

> **Can the owner see the result of this work?**
> **Yes** → it belongs to a user story. **No** → it is foundational.

| | **Foundational** | **Serves `US-n`** |
|---|---|---|
| Examples | schema, RLS, transport, sync, migrations | a page, a flow, anything the owner opens |
| Tasks grouped by | technical layer | the story, ending in something demoable |
| Definition of done | technical outcomes, plus which story phase it unblocks | the spec's acceptance scenarios, walked — plus all four states |
| Demos to | nobody, and that's correct | the owner, directly |

M1–M7 were all foundational, which is why none of them is named after
something the owner could open. That was the right shape for building a
control plane. It is the wrong shape for everything the owner actually
touches, which is what specs now govern.

**The failure this guards against:** everything gets called foundational,
no story ever ships, and the app is a backend with no way in. If a plan's
Work breakdown has stories with no rows under them, that is the warning
sign — not a scheduling detail.

Every task, in either kind of phase, carries a **Serves** row naming its user
story or the story phase it unblocks. A task that can name neither is a task
nobody asked for.

## The bar

A task is ready when someone can work it **without asking the owner anything**:

- Every decision it needs is already made and written down, with its reasoning
- The exact files to create or change are named
- Traps and failure modes are called out before they're hit
- Verification is concrete enough to run, with unambiguous pass/fail

And before starting one, read [`../KnownGaps.md`](../KnownGaps.md). It lists what
is built but **unproved** — so a task does not inherit an assumption as a fact,
and so a phase that can finally close a gap knows to do it.

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

## Hierarchy — Spec, Plan, Phase, Band, Task

Five terms, and only five; each names one specific thing:

| Term | A document? | Where | Scope |
|---|---|---|---|
| **Spec** | yes | `doc/specs/<date>-<slug>.md` | what the owner wants, no technology |
| **Plan** | yes | `doc/plans/<date>-<slug>.md` | the technical how; splits into one or more phases |
| **Phase** | yes (a folder) | `doc/tasks/<PREFIX>/` | one `README.md` + its tasks; declares foundational or `serves US-n` |
| **Task** | yes | `doc/tasks/<PREFIX>/T-<PREFIX>-<nn>-<slug>.md` | one checklist, one branch, one PR |
| **Band** | **no** | a section inside `MasterTaskQueue.md` | a scheduling wave — see below |

**A band is not a phase, and not reliably one phase's worth of work.** It is
a grouping of tasks from one *plan* that can run as one wave, decided purely
by run-order and file overlap. A phase with internal sequencing spans several
bands (M2's foundations → spine → handlers → verification are Bands 1–4). A
band can equally hold tasks from *several* phases at once when a plan's work
was decomposed together (Band 18 holds M12, M13, M14 and M15's tasks in one
table). Bands are numbered sequentially in queue order and never form their
own folder or document — the task files and phase `README.md`s are the
record; a band is just how the queue schedules them.

**"Milestone" is not a structural term — do not use it for a folder or an
id.** It appears once, informally, in `AGENTS.md`'s git workflow to mean "a
pushable unit of work worth a preview-verification pass," which may be a
whole phase or something smaller. That is a different concept from the five
above and the two must not be conflated. The `M` in `M2`/`M16`/`M18` is a
phase-prefix convention, not a claim that "milestone" is a document tier.

**Phase-id convention:** `M<n>` for the main product sequence; a short
family prefix + number for a side initiative (`D1`, `D2`, `G23`, `VR`, `WA`).
Every phase's tasks are `T-<PREFIX>-<nn>-<slug>.md` with no exceptions —
`SettingsRedesign`'s tasks were renamed from bare `T-01`/`T-02`/`T-03` to
`T-SR-01`/`T-SR-02`/`T-SR-03` on 2026-08-25 specifically because the
bare-number scheme broke a script that walks task ids by pattern; a phase
folder itself may still be a descriptive name (`SettingsRedesign`, `VR`) but
its task-id prefix must exist and match.

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

## Who updates the queue, and when

**A task branch never edits `MasterTaskQueue.md`.** Adopted 2026-08-25, when
the repo moved to running several agents on several branches at once.

Each task's **own file** carries the authoritative `Status` row. The queue's
Status column is a *mirror* of those rows, maintained by whoever hands out the
next wave of work, on `development`, as the first step of that hand-out:

```
agents finish → PRs squash-merge into development   (queue untouched)
              ↓
   before handing out the next wave:
     0. run the drift check below
     1. flip the merged rows in MasterTaskQueue.md, one commit
     2. read the queue, pick what runs next
     3. fan out
```

**Why the update is bound to the hand-out and not to the merge.** The queue has
exactly one consumer — the decision about what to start next. Between those
decisions nobody reads it, so lag costs nothing; binding the write to the read
is what lets every task branch stay out of the file. Updating per-merge instead
is equally conflict-free (GitHub serializes merges into `development`) and just
noisier; either is legitimate, per-wave is the default.

**The queue answers "what is *eligible*", not "what is *occupied*".** Order,
dependencies and tags change rarely and are safe to lag. For what is running
right now, ask `gh pr list --state open` and `git worktree list` — live, always
accurate, and never in conflict with anything. Do not extend the queue to track
occupancy.

**Decomposition is a solo operation.** Adding a plan's tasks *regenerates* this
queue rather than appending to it (see `MasterTaskQueue.md`'s header), which is
a whole-file rewrite and collides with every open branch at once. Drain to zero
open task branches first. `AGENTS.md` §2.8 is the rule; the sequencing usually
hands you the quiet moment for free, since a phase is decomposed after the
phase it depends on lands.

### Drift check

The two places disagreeing is not hypothetical — it is what the old
"tick both" protocol actually produced, under fully **serial** work. When this
rule was adopted the check found 11 stale files: all eight of `M2/` reading
`queued` against a queue that had said `done` since 2026-08-10, and all three
of `SettingsRedesign/` reading `not started` against `done`. They were
corrected in the same change. Run this as step 0 of a hand-out:

```bash
for f in doc/tasks/*/T-*.md; do
  rel=${f#doc/tasks/}
  fs=$(grep -m1 '^| \*\*Status\*\*' "$f" | grep -c done)
  q1=$(grep -c "($rel).*done" doc/tasks/MasterTaskQueue.md)
  q2=$(grep -c "($rel).*done" doc/tasks/CompletedMasterQueue.md)
  qs=$((q1 + q2))
  [ "$fs" != "$qs" ] && echo "drift: $rel (file=$fs queue=$qs)"
done
```

It matches on the queue row's **link target**, not on a task id, because task
files live under one of two folder-naming shapes — `<PREFIX>/T-<PREFIX>-nn-…`
(`M16/T-M16-01-…`) is the rule, and `SettingsRedesign/` is the one documented
exception with a bare folder name but still a proper `T-SR-nn` prefix. The
paths are unambiguous either way; matching on a parsed-out id is not.

It checks **both** `MasterTaskQueue.md` and `CompletedMasterQueue.md` because
a band's row moves to the archive the moment it's fully done (see
[Archiving a finished band](#archiving-a-finished-band)) — a task whose row
only exists in the archive is not drift, it's exactly where it should be.

Quiet output means the mirror is honest.

### Status vocabulary

Five values, and nothing else — the drift check and every reader depend on
them being spelled the same way in both places:

| Value | Means |
|---|---|
| `queued` | written, not started |
| `in progress` | a branch is open on it |
| `done <date>` | every checklist item ticked, at the evidence it asked for |
| `done except <id> <date>` | landed with a named residue — a `G-n`, `OQ-n`, or `D-n` that says what is unproved |
| `blocked → OQ-n` | the *dependent item* waits; per `AGENTS.md` §8 the task is still reported as done-except |

A tick mark before the word (`✅`, `🟢`) is decoration and may be dropped; the
word is what is read. Do not invent a sixth value — `partly done`, `done except
residue` with no id, and a bare date are all forms of not saying what is
missing, which is what `KnownGaps.md` exists to prevent.

### Archiving a finished band

`MasterTaskQueue.md` grows without bound otherwise — by 2026-08-25 it had
reached 889 lines, 58% of it bands that had been fully done for weeks.
[`CompletedMasterQueue.md`](CompletedMasterQueue.md) holds the full text of
every band that has nothing left to schedule; `MasterTaskQueue.md` keeps a
one-line stub in the same position, linking to the archive.

**Trigger: per band, not per plan.** A band archives the moment every one of
its own rows reads `done` or `done except <id>` — regardless of what its
sibling bands in the same *plan* are doing. A plan-level trigger was
considered and rejected: a `KnownGaps.md` entry can outlive its plan
indefinitely by design (that is the whole point of the register), so a plan
would rarely close in the strict sense and the archive would stay nearly
empty. Concretely, this repo's oldest plan has read "code-complete; **NOT**
closed" since 2026-08-12 over three residual gaps — under a per-plan trigger
its six *fully done* bands (93 lines) would still be sitting in the active
file today.

**This is not the append-only rule being relaxed.** That rule protects
`doc/plans/` and each phase's `doc/tasks/<phase>/` folder — the actual
decision record — and neither ever moves. `MasterTaskQueue.md`'s band prose
is the queue's own scheduling text, not the record itself; relocating it to
a sibling file the moment it has nothing left to schedule loses nothing, the
same way the Status column has always been a mirror rather than a source.

**Who does it, and when:** the same person, at the same moment, as the
queue-mirror update in [Who updates the queue, and when](#who-updates-the-queue-and-when)
— check every band for full completion as part of that pass, move the ones
that qualify, and leave the rest exactly where they are.

## When a phase's tasks are fully completed

**`doc/plans/` and each phase's own `doc/tasks/<phase>/` folder are never
deleted, moved, or archived.** They are an append-only decision record, not a
live working set that gets cleaned up — a phase's tasks and README stay
exactly where they are forever, marked done in place rather than removed.

`MasterTaskQueue.md` is different: it is the queue's own scheduling text, not
the record itself, and its Status column has always been a mirror of the
task files rather than a source. Once a band's every row reads done, its
section *does* relocate — to
[`CompletedMasterQueue.md`](CompletedMasterQueue.md), with a one-line stub
left behind — per [Archiving a finished band](#archiving-a-finished-band).
Nothing is lost in that move; the phase folders the archived band links to
are still exactly where the paragraph above says they must always stay.

When every checklist item in a phase is `[x]` (or `[x]`/`[~] blocked → OQ-n`
where the open item is explicitly non-blocking for the plan, as M2's OQ-1 is):

1. **Phase `README.md`** — add a `Status: ✅ done <date>` line at the top.
2. **This file's status table** — flip that row to `✅ done`.
3. **`MasterTaskQueue.md`** — flip every task in that band's Status column to
   `done`. No reordering needed: a completed band is already earliest in run
   order, which is why Band 0 never had to move. **This step happens at
   integration, on `development`, not from a task branch** — see
   [Who updates the queue, and when](#who-updates-the-queue-and-when). If
   every row in the band now reads `done`/`done except <id>`, move the band's
   full section to [`CompletedMasterQueue.md`](CompletedMasterQueue.md) and
   leave a one-line stub in its place — see
   [Archiving a finished band](#archiving-a-finished-band).
4. **The plan header** — update its `Status` row. If phases remain, name the next
   one (`M1 complete · M2 next`, the current pattern). If that was the last
   phase, the plan's status becomes `✅ Completed <date>`.
5. **Anything the phase spawned into `OpenQuestions.md`, `Deferred.md`,
   `KnownGaps.md`, or `Ideas.md` stays exactly where it is.** Finishing a plan
   does not resolve its open questions, un-defer its deferrals, or close its
   gaps — those have their own lifecycle and may outlive the plan that raised
   them, or spawn a new plan later.
6. **Every item ticked on weaker evidence than it asked for has an entry in
   [`../KnownGaps.md`](../KnownGaps.md).** A phase cannot be reported done while
   an unproved claim inside it exists only in someone's memory. Writing the gap
   down is what makes "done" mean the same thing across phases.
7. **The in-app Knowledge Center matches the product the phase just shipped.**
   Re-read the four global-claim pages named in `AGENTS.md` §3.2 — a phase can
   falsify a page it never opened. M1–M3 each passed their own verification while
   leaving users told the app had no accounts and no remote access.

A plan is genuinely closed only when every phase reads done and its `Open
questions` header line is empty or points only to non-blocking entries.

## Status

| Phase | Tasks | State |
|---|---|---|
| M1 — cloud schema, RLS, indexes | — | ✅ done, applied to staging 2026-08-09 |
| M2 — `/api/v1` from Next over Supabase | 8 (`M2/`) | ✅ done, verified on staging 2026-08-10 (incl. browser pass) |
| M3 — pairing, registration, heartbeat | 8 (`M3/`) | ✅ done, verified on staging 2026-08-10 |
| M4 — command spine | 8 (`M4/`) | ✅ done, verified live on staging 2026-08-11 |
| M5 — transcripts (dual path) | 6 (`M5/`) | 01–05 done · 06 (verification) deferred to the owner — [`G-13`](../KnownGaps.md) |
| M6 — memory sync | 5 (`M6/`) | 01–04 done 2026-08-12, 956 tests · 05 (verification) needs a second machine — [`G-15`](../KnownGaps.md) |
| M7 — routes + Electron | 4 (`M7/`) | 01–03 done 2026-08-13, 981 tests · 04 (verification) not run — [`G-16`](../KnownGaps.md) |
| **M8 — Machines menu** *(serves US1)* | 5 (`M8/`) | ✅ done, verified live (`T-M8-05`, 2026-08-20 — localhost; staging half closed by M11) |
| **M9 — workspace + profile identity** *(foundational)* | 6 (`M9/`) | ✅ done |
| **M10 — the setup guide** *(serves US2)* | 5 (`M10/`) | ✅ done — scenario 11 and some form-level micro-behaviours residual, [`G-25`](../KnownGaps.md)/[`G-26`](../KnownGaps.md) |
| **M11 — walk the spec on staging** *(serves US3–US5)* | 5 (`M11/`) | 01–04 done or done-except-residue (2026-08-22) · 05 (gap reconciliation) in progress — [`G-12`](../KnownGaps.md)/[`G-13`](../KnownGaps.md)/[`G-16`](../KnownGaps.md) rewritten down to residue |

M8–M11 are the first phases in this repo derived from a **spec** rather than
straight from a plan, and the first named after things the owner can open. M9 is
the only foundational one among them, and deliberately small: its whole job is
to give M10's first two steps something to call. The split was decided by one
test — *can the owner see the result of this work?* — applied per item in
[`../plans/2026-08-16-setup-and-machines.md`](../plans/2026-08-16-setup-and-machines.md)'s
Work breakdown. US1 turned out to need **no** foundational work at all, because
every endpoint it uses shipped in M3 and M4; that is why M8 can go first and
alone.

M5's spec depended on what M4's dispatch actually turned out to look
like, and inventing that early would have been fiction in a confident tone. M4
bore that out — three of its load-bearing decisions (the cloud/local id
bridge, poll-over-doorbell, and run-status reporting) were not visible from the
plan's bullet list at all. M5 bore it out again in the other direction: the
doorbell M4 handed forward turned out to be the wrong thing to build, and two of
M5's tasks exist only because reading the code found a dead WebSocket and an
unpaginated transcript nobody had reason to notice yet. M6, by contrast, turned
out to be mostly wiring — M1 had already scaffolded the cloud schema, the
sync-shaped index, and even the command kind M6's push path enqueues; nothing
about M6 needed a load-bearing decision M1 hadn't already made. Building it still found two:
`content` had to carry the whole file rather than the note body, and the push
route needed a cross-workspace id guard — both written up as corrections in
M6's own phase spec rather than folded in silently. M7 found the third
shape: a phase whose spec had gone stale. Half of it — "point the desktop window
at the hosted app" — assumes a deployment that was never made, which no amount
of care inside the phase can supply.

See `MasterTaskQueue.md` for the run order.
