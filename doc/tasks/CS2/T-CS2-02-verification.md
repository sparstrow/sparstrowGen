# T-CS2-02 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs T-CS2-01 in place |
| **Depends on** | T-CS2-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove US2 for real, in the running app.

## A — The acceptance scenarios

- [ ] **US2 scenario 1** — start a new session, send a first message,
      confirm the rail title updates from "New conversation" shortly after
- [ ] **US2 scenario 2** — rename a session (CS1), send another message,
      confirm the manual title is not overwritten
- [ ] **US2 scenario 3** — send a very long or topic-less first message
      ("hi"), confirm the resulting title is short, readable, and not a
      mid-word cut
- [ ] The story's independent test passes with only this phase's work
      present (no dependency on CS1, though CS1 is used to test scenario 2)
- [ ] Browser console has no errors on send

## B — What must NOT have changed

- [ ] Sending a message in an `agent-creator` session still titles itself
      via its own existing `Agent: <name>` path, not this phase's logic
- [ ] The local (Electron/SQLite) chat path's own auto-titling
      (`packages/core/src/chat/service.ts`) is untouched and still works —
      confirm by reading the diff, not just by assumption
- [ ] Retrying a turn (`retry_chat_turn`) does not re-trigger or disturb the
      title

## C — What can be verified today

- [ ] Everything in A/B — no missing capability blocks this phase

## D — What needs something that doesn't exist yet

None.

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] The migration applies cleanly against a fresh database (or the
      project's migration-check command, per the `supabase` skill)

## On completion

- [ ] Tick CS2's rows in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update the phase `README.md` status line and task table
- [ ] Update the plan's own **Status** row
- [ ] Any unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)

## Result

<!-- Filled in when the task lands. -->
