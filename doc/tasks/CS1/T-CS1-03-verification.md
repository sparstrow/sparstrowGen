# T-CS1-03 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs both of CS1 in place |
| **Depends on** | T-CS1-01, T-CS1-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-28) |

## Objective

Prove US1 for real, in the running app — not just that the pieces were
built.

## A — The acceptance scenarios

- [x] **US1 scenario 1** — renamed a session via the rail row; header
      updated immediately (already proven directionally both ways in
      T-CS1-01); survived a reload
- [x] **US1 scenario 2** — Delete opened a dialog with Archive/Delete/Cancel
      and the exact permanence wording ("Delete permanently removes this
      conversation and its message history — that can't be undone")
- [x] **US1 scenario 3** — Delete removed a session and its message
      permanently; confirmed gone from the rail and, in T-CS1-02's own pass,
      via a direct database query (message content unrecoverable)
- [x] **US1 scenario 4** — Archive removed a session from the default list;
      confirmed it reappears under the "Archived" toggle, not destroyed
- [x] **US1 scenario 5** — Cancel left a session completely untouched
- [x] **US1 scenario 6** — clearing a title and pressing Enter kept the
      previous title, no blank persisted
- [x] The story's independent test passes with only CS1's work present — no
      dependency on CS2–CS6 was exercised or needed for any scenario above
- [x] Browser console has no errors across all six scenarios (`agent-browser
      errors` — none)

## A2 — The four states

For the per-session menu, rename input, and confirmation dialog:

- [x] **Populated** — menu shows Rename/Delete; confirmation shows
      Archive/Delete/Cancel, Delete styled destructive
- [x] **Loading** — buttons disabled during an in-flight rename/delete/archive
      (dialog swaps to "Archiving…"/"Deleting…"), no double-submit possible
- [ ] **Error** — not independently forced this pass (would need simulating
      a network/RLS failure). The code path was read and matches the
      already-live-proven rename error path (T-CS1-01: stays open, shows
      `r.error`, no silent close) — same `callAction` result shape, same
      pattern. Recorded as read-verified, not live-forced; see `KnownGaps.md`
- [x] Both light and dark themes — dark mode screenshot checked, correct
      contrast, no clipping
- [x] Keyboard navigation — Enter commits rename, Escape cancels (exercised
      via `agent-browser press`); dialog buttons are real, focusable
      `<button>` elements. Not exhaustively tab-walked

## B — What must NOT have changed

- [x] The standalone header Archive icon was deliberately removed in
      T-CS1-02 (superseded by the unified dialog's Archive option, not kept
      alongside it) — confirmed this was a decision, not a regression, by
      reading that task's Result
- [x] Creating a new session, and sending a message in an existing one,
      still work exactly as before this phase — exercised repeatedly across
      this whole pass (3 sessions created, messages sent to each)

## C — What can be verified today

- [x] Everything in A/A2/B except the forced error state — no missing
      capability blocks this phase's own scope

## D — What needs something that doesn't exist yet

None — this phase has no dependency on anything undeployed. The one
un-forced item (A2's Error state) needs a deliberate network/RLS failure
injection, not a missing capability — recorded in `KnownGaps.md` rather than
blocked on infrastructure.

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green (`pnpm --filter web
      typecheck`, `pnpm --filter web test` — 451/451; full monorepo-wide
      `-r` not run this pass, scoped to the package this band touches)
- [x] `apps/web` builds (typecheck clean; dev server started and served the
      page correctly throughout this pass)

## On completion

- [x] ~~Tick CS1's rows in `../MasterTaskQueue.md`~~ **not done, correctly**:
      this template line assumes the verification task is also the band's
      last task. Band 26 has 6 phases (CS1–CS6); the queue's Status column
      is a mirror flipped once, at band close, in the commit that lands
      `band/26-…` on `development` — never from a task branch mid-band
      (`doc/tasks/README.md`'s "who updates the queue and when"). CS1's own
      task files (this one, T-CS1-01, T-CS1-02) are the authoritative record
      in the meantime
- [x] Update the phase `README.md` status line and task table
- [x] Update the plan's own **Status** row
- [x] Knowledge Center pass per `AGENTS.md` §3.2 — **correction to this
      task's own earlier note**: `chat-and-inbox.md` *does* exist and needed
      an update (rename/delete/archive paragraph added, plus a "no unarchive
      control yet" limitation), `updated:` bumped to 2026-08-28
- [x] Any unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)

## Result

**2026-08-28 — done.** Walked all six US1 acceptance scenarios in one
continuous `agent-browser` session against a disposable account (three
sessions created, renamed, archived, deleted, cancelled-on across the pass):
rename from the rail row (persists, survives reload); blank-title fallback;
the Archive/Delete/Cancel dialog's exact wording; Cancel leaves a session
untouched; Archive removes it from the default list and it reappears under
the "Archived" toggle; Delete removes it and its message permanently.
No console errors across the whole pass. Dark mode screenshot checked — no
layout or contrast issues.

Corrected an inaccuracy in this task's own file: `chat-and-inbox.md` *does*
exist (the earlier note assuming otherwise was wrong) and did need
updating — added a paragraph on auto-naming/rename/archive/delete and a
"no unarchive control yet" limitation, matching what CS1 actually shipped
and what I-13 already knew was missing.

Not forced this pass: the confirmation dialog's Error state (would need
injecting a network/RLS failure) — the code path was read and matches the
already-live-proven rename error path exactly, but wasn't independently
exercised. Recorded in `KnownGaps.md`.

`pnpm --filter web typecheck` clean, `pnpm --filter web test` 451/451
green. Disposable test account cleaned up per the runbook.
