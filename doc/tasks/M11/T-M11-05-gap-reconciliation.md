# T-M11-05 — Reconcile the gaps

| | |
|---|---|
| **Tag** | `[S]` — needs every other M11 task's outcome |
| **Serves** | `US3`–`US5`, and **SC-007** |
| **Depends on** | T-M11-01 … T-M11-04 |
| **Blocks** | — (last task of the plan) |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — 2026-08-22 |

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

- [x] Closed the click-through bullet — Playwright rendered
      `staging.sparstrow.com` throughout this phase (`/machines` both states,
      `/runs/<id>` live and after reload, `/teams`, `/projects`, `/skills`,
      `/tasks`, `/imports`, `/terminals`, `/chat`) and found two real defects
      doing it. **Reassign and clone end-to-end are still not reachable** —
      only one machine was ever active at a time this pass, and no real git
      remote was available
- [x] `G-12`'s text is **rewritten** to name precisely what's left (lease
      recovery's timing window, reassign, clone end-to-end, and half of the
      "unpaired local UI starting a run" claim)
- [x] The "unpaired local UI starting a run" claim is **half-testable now** —
      T-M11-04 scenario 2 confirmed the local UI genuinely loads (log + window
      title), but starting a run from it needed interaction computer-use could
      not provide this pass

### `G-13` — M5 transcripts built and unit-tested, not verified live

- [x] T-M11-02 scenario 2 **partially** closes live streaming: the *delivery*
      property (events arrive progressively, not batched at the end) is now
      proved live. *Rendering* is more nuanced — code-correct for
      `claude-code`'s event types but not re-observed live (an unrelated
      environment auth issue), and found **broken** for `antigravity`'s event
      type (new bug filed)
- [ ] The **60-second network cut** stays open — not run this pass either;
      still the owner's call (phase decision 4), not a missing capability
- [ ] The **second-device** and **cross-workspace subscribe** items still need
      a second account — T-M11-03 does not supply one, and M9's verification
      account's availability was not confirmed. Left open
- [x] The **durable count comparison** is closed by T-M11-02's event-count
      assertion — exact match for both a normal run (3/3) and an errored one
      (13/13), local SQLite vs. cloud Postgres

### `G-16` — M7's routes never rendered, desktop shell never run

- [x] T-M11-04 closes **most** of the desktop half — the shell launches, all
      three URL-resolution scenarios proved live. **Not closed:** sign-in
      inside the window, the window's own machine appearing in `/machines`,
      and Retry — all needed interaction computer-use could not provide
- [x] The **five routes** half — `/imports`, `/projects/[projectId]`,
      `/skills`, `/tasks` all reached and render correctly with real data.
      **`/teams/[teamId]` was reached and crashes** — a real, filed defect,
      itself a complete answer to "does this route render." `/skills/[skillId]`
      and `/tasks/goals/[goalId]` remain unclicked — no existing skill/goal to
      click into, out of this pass's time budget to manufacture
- [x] The **"everything behind a deployment"** bullet is closed outright by
      T-M11-01

## Checklist

- [x] Each of `G-12`, `G-13`, `G-16` either **deleted** with the proof named,
      or **rewritten** to exactly the residue — no entry left in its pre-M11
      wording. All three rewritten (none fully deletable — each still has
      real residue named precisely)
- [x] Any *new* gap opened by this phase written in the same shape — `G-27`
      (claude-code's capability probe can't distinguish installed from
      authenticated)
- [x] Every defect found across T-M11-01–05 has a file in
      [`../../bug/`](../../bug/README.md) — five filed this phase:
      `chat-new-session-404s`, `antigravity-transcript-not-rendered`,
      `desktop-servicemanager-health-check-times-out`,
      `team-create-500-missing-slug` (resolved in this same pass),
      `teams-page-crashes-with-real-data`. None needed `../../security/`
- [x] Any defect worth fixing has a task or is fixed outright — the slug bug
      was small and obvious and fixed directly, per the phase README's
      explicit allowance. The other four are filed but not yet turned into
      formal tasks in an existing phase folder — that's residue: each bug
      file is itself the actionable record (per `doc/bug/README.md`'s own
      "turning a bug into work" section, opening the formal task is a
      follow-up step, not required to file the bug), but none has a
      `doc/tasks/` entry yet. Named here rather than silently left implicit
- [x] [`../M3/T-M3-08-verification.md`](../M3/T-M3-08-verification.md) needed
      no edits — already fully complete since 2026-08-10; its residue (a live
      pass against a *deployed* control plane) is what T-M11-01 supplied.
      [`../M5/T-M5-06-verification.md`](../M5/T-M5-06-verification.md) and
      [`../M7/T-M7-04-verification.md`](../M7/T-M7-04-verification.md) both
      updated in place
- [x] The **plan's** Status row and Result section written
- [x] [`../MasterTaskQueue.md`](../MasterTaskQueue.md): band 13 rows 13.1–13.4
      marked done/done-except-residue, 13.5 marked done below; the
      "M11 in its entirety" and `/runs/[runId]` transcript blocked-item rows
      both resolved
- [x] [`../README.md`](../README.md) status table (actually `../../tasks/README.md`'s
      Status table — the phase-status table this repo actually has) gained
      correct rows for M8–M11, replacing stale "not started" text for phases
      that had already shipped
- [x] [`../../runbooks/README.md`](../../runbooks/README.md): the staging
      owner-action row flipped to done, for M11's purposes (the owner's own
      day-to-day machine remains a separate, still-open switch, noted as such)
- [ ] [`../../specs/README.md`](../../specs/README.md) index row — **not**
      flipped to "shipped" yet. M11 itself still has named residue (a second
      machine, a second account, the 60s network cut, computer-use-gated
      Electron interaction) — per this task's own Traps section, closing a
      gap because the phase ran rather than because the assertion passed is
      the one failure to avoid, and the same logic applies to the spec's
      shipped/not-shipped line. Left as "planned" with a note
- [x] **Knowledge Center pass.** All four global-claim pages re-read.
      `what-is-sparstrowgen.md` — already accurate, no edit needed.
      `first-run-setup.md`, `limitations.md`, `providers-and-execution-modes.md`
      — each had at least one real overclaim or stale claim, corrected (see
      Result). Two more pages outside the mandatory four —
      `runs-and-transcripts.md` and `machines.md` — were also corrected,
      because this pass's findings directly falsified specific sentences in
      them and leaving a known-false sentence in an unlisted page is the same
      mistake AGENTS.md §3.2 exists to prevent, just in a page the rule
      didn't explicitly name
- [x] `pnpm -r typecheck` and `pnpm -r test` green, count recorded — see
      Result

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

- [x] `grep -n "G-12\|G-13\|G-16" doc/KnownGaps.md` — every match is either
      gone or in text written during this task (checked; two matches are
      historical cross-references inside other gaps' own text, unchanged and
      still accurate)
- [x] The plan's Result section names which of US1–US5 the owner can actually
      use now
- [x] Someone reading only `KnownGaps.md` after this task would correctly
      predict what is and is not proved — each rewritten entry states
      precisely what closed, what's residue, and points at the specific bug
      files where a residue item turned out to be a real defect rather than
      an untested path

## On completion

- [x] Tick 13.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and mark
      Band 13 complete
- [x] Update the phase `README.md` status line and its task table
- [x] Update the plan's **Status** row — **not** `✅ Completed`, since real
      verification residue remains (see Result and the plan's own Result
      section for the exact list)

## Result

**What the gaps say now.** `G-12`, `G-13`, `G-16` are all rewritten, not
deleted — every phase before this one that ran against reality found real
defects, and this one found five (four filed, one fixed outright), which is
exactly why "rewritten" rather than "closed" is the honest word. One new gap
opened: `G-27`, the capability probe's installed-vs-authenticated gap. Full
text is in `KnownGaps.md`; the short version:

- `G-12` — the click-through pass itself is done and found two defects doing
  it. Reassign, clone-to-real-remote, lease-recovery timing, and "start a run
  from the unpaired local UI" (as opposed to "the local UI loads," which is
  now proved) remain open, each needing a resource this pass didn't have
  (second machine, real git remote, a timing harness, interactive access).
- `G-13` — the transcript pipeline's *delivery* guarantee is proved live
  (progressive, exact count match, both a clean and an errored run). Its
  *rendering* is provider-dependent: proved for `claude-code`'s event shape,
  found broken for `antigravity`'s. The 60-second outage and second-device
  assertions remain the owner's call / need a resource this pass lacked.
- `G-16` — the desktop shell is launched, proved live in all three
  URL-resolution scenarios, with the offline screen visually confirmed via
  its window title. Sign-in inside the window and Retry remain unclicked
  (computer-use unavailable). Of the five M7 routes, three now render
  correctly with real data, one (`/teams/[teamId]`) was reached and found to
  crash — a real answer, now a filed bug — and two remain unclicked for lack
  of a fixture.

**Which stories the owner can actually use now, and how far:**

- **US1 (Machines menu)** — fully usable, live-proven against staging this
  pass (pair, both states forced and timed, rename implicit via re-pair,
  revoke, remove, capability badges).
- **US3 (browser-started run, watched live)** — usable end to end. A run
  started from the browser executes on the paired machine and finishes with
  correct metrics. Watching it live works at the data layer for every
  provider and renders correctly for `claude-code`; for `antigravity`
  specifically the transcript card shows nothing while the run is genuinely
  progressing (`BUG-2026-08-22-antigravity-transcript-not-rendered`).
- **US4 (failure messages)** — fully usable. All four forced failures produce
  distinct, accurate messages and exit codes; no defect found.
- **US5 (desktop shows the deployed product)** — partially usable. The window
  genuinely loads the deployed app, falls back to the local UI when unset,
  and shows a real offline screen when unreachable — all proved live. Signing
  in inside the window and the "a machine sees itself" closure remain
  unproved, blocked on interactive access this pass didn't have.
- **US2 (setup guide)**, from M10, is unaffected by anything found here.

**What this phase found that the plan did not anticipate — five things,**
matching the pattern every phase before it set:

1. `/chat` cannot start a new conversation at all (404, no route) — found
   trying to use the most obvious path into US3, worked around with the
   already-verified `POST /runs`.
2. `antigravity`'s transcript events render as nothing, despite streaming
   correctly — a rendering gap, not a delivery gap.
3. The local Electron supervisor (`ServiceManager`) reports its own
   supervised core as unhealthy every time, even when the core's own log
   shows it became healthy well inside the deadline — root cause not
   isolated, cosmetic today.
4. **Creating a team, a project, or an agent 500'd unconditionally** — all
   three tables have a `NOT NULL` slug column neither the client nor the
   handler ever populated. This is the most severe finding of the whole
   phase: it blocked the core "set something up and use it" loop for every
   account on staging, silently, until this pass found and fixed it.
5. Once a team exists, `/teams` and `/teams/[teamId]` (one of M7's five
   routes) crash outright — `GET /teams`/`GET /teams/:id` never join the
   member/project data the frontend's own schema promises. Invisible in
   every prior pass because they only ever saw the empty state; filed, not
   fixed (real query-design work, not a drive-by).

**Process lessons worth recording**, not gap-shaped but real: `TaskStop` on a
`Bash run_in_background` wrapper does not reliably kill a `tsx`/`electron`
process tree on Windows — this cost the scratch daemon twice mid-task, each
caught immediately via `/machines` and fixed with `Get-Process` +
`Stop-Process -Force`. And computer-use in this session consistently returned
`"user interrupt"` on every interactive action after an unusual instant grant
with no visible approval dialog — worth flagging to whoever owns that
integration, since T-M11-04's own risk note anticipated slow approval, not
this specific failure shape.

**Tests:** `pnpm -r typecheck` clean across all 7 packages. `pnpm -r test`
green across three consecutive runs — `desktop` 3 files/33 tests,
`shared` 12/264, `ui` 6/51, `core` 81 files/675 tests + 4 skipped,
`apps/web` 16 files/224 tests. One transient failure was seen in
`packages/core/src/cloud/commands.test.ts` on an intermediate run under
`pnpm -r`'s parallel execution; isolated re-run passed 16/16 immediately —
consistent with this repo's already-documented class of turbo-parallel test
flakiness (`BUG-2026-08-20-flaky-realtime-live-events-test`), not a
regression from this pass's changes.
