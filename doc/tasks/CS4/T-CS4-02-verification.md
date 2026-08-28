# T-CS4-02 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs T-CS4-01 in place |
| **Depends on** | T-CS4-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove US3 for real. Per CS3's own verification, the fully-live path (a real
`agy models` divergence from `KNOWN_MODELS`) needs a real `agy` install —
name plainly whether that's reachable here before scoring this "done."

## A — The acceptance scenarios

- [ ] **US3 scenario 1** — a model not in the static list appears in the
      picker (live if `agy` reachable, otherwise via a seeded cache row that
      simulates the same effect — say which)
- [ ] **US3 scenario 2** — a model the static list has that the live/seeded
      source doesn't → no longer appears
- [ ] **US3 scenario 3** — cache present but stale/unreachable → last-known
      list shown, marked possibly not current, never blank
- [ ] The story's independent test passes with only CS3+CS4 present
- [ ] Browser console has no errors opening the picker

## A2 — The four states

- [ ] **Populated**, **Empty**, **Loading**, **Error** — all four, per the
      phase README's table
- [ ] Both light and dark themes
- [ ] Keyboard navigation on the picker unchanged from before this phase

## B — What must NOT have changed

- [ ] `claude-code`'s picker: no fetch, no loading state, identical to
      before this phase
- [ ] Selecting a model and sending a message still works exactly as before
      (this phase only changes where the option list comes from)

## C — What can be verified today

- [ ] Everything in A/A2/B using a seeded or live cache row

## D — What needs something that doesn't exist yet

**Needs a real `agy` binary to prove the fully-live divergence case** — same
gap CS3 may have already recorded; don't duplicate the `KnownGaps.md` entry,
reference it if CS3 already opened one.

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `apps/web` builds

## On completion

- [ ] Tick CS4's rows in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update the phase `README.md` status line and task table
- [ ] Update the plan's own **Status** row
- [ ] Any unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)

## Result

<!-- Filled in when the task lands. -->
