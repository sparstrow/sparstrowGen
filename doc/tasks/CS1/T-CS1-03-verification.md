# T-CS1-03 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs both of CS1 in place |
| **Depends on** | T-CS1-01, T-CS1-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove US1 for real, in the running app — not just that the pieces were
built.

## A — The acceptance scenarios

- [ ] **US1 scenario 1** — rename a session, confirm rail + header both
      update, confirm it survives a reload
- [ ] **US1 scenario 2** — choose to remove a session, confirm the
      confirmation shows Archive/Delete/Cancel with the permanence wording
- [ ] **US1 scenario 3** — pick Delete, confirm the session and its messages
      are gone entirely, including after a reload
- [ ] **US1 scenario 4** — pick Archive, confirm existing archive behavior
      (leaves active list, not destroyed)
- [ ] **US1 scenario 5** — pick Cancel, confirm nothing changed
- [ ] **US1 scenario 6** — clear a title and try to save; confirm a usable
      name is kept
- [ ] The story's independent test passes with only CS1's work present (no
      dependency on CS2–CS6)
- [ ] Browser console has no errors across all six scenarios

## A2 — The four states

For the per-session menu, rename input, and confirmation dialog:

- [ ] **Populated** — menu shows Rename/Delete; confirmation shows
      Archive/Delete/Cancel
- [ ] **Loading** — buttons disabled during an in-flight rename/delete/archive,
      no double-submit possible
- [ ] **Error** — a failed request (simulate via a bad session id or a
      network block) shows what went wrong and does not silently close
- [ ] Both light and dark themes
- [ ] Keyboard navigation and visible focus on the menu and dialog

## B — What must NOT have changed

- [ ] The existing header Archive icon's prior behavior (if kept alongside
      the new dialog) still archives correctly
- [ ] Creating a new session, and sending a message in an existing one,
      still work exactly as before this phase

## C — What can be verified today

- [ ] Everything in A/A2/B — no missing capability blocks this phase's own
      scope

## D — What needs something that doesn't exist yet

None — this phase has no dependency on anything undeployed.

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `apps/web` builds

## On completion

- [ ] Tick CS1's rows in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update the phase `README.md` status line and task table
- [ ] Update the plan's own **Status** row
- [ ] Knowledge Center pass per `AGENTS.md` §3.2 (no chat article currently
      exists to update — confirm this is still true before skipping)
- [ ] Any unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)

## Result

<!-- Filled in when the task lands. -->
