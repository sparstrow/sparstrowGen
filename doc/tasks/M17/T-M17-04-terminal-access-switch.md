# T-M17-04 — the per-machine off switch

| | |
|---|---|
| **Tag** | `[P]` — `machines.tsx` and core's settings handling; touched by nothing else in this phase |
| **Serves** | `US4` — turn browser terminals off for a machine |
| **Depends on** | M16 (`SETTING_TERMINAL_ACCESS` is defined in `T-M16-01`; enforcement lands in `T-M16-04`) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except two session-lifetime checks (2026-08-27) — see `G-48` |

## The scenarios this satisfies

> 1. **Given** a paired machine, **When** I look at its page, **Then** I can see
>    whether it currently allows terminals and change it there.
> 2. **Given** I have switched terminals off for a machine, **When** I open
>    Terminals and choose it, **Then** I am told that machine does not allow
>    terminals and pointed at where to change it.
> 3. **Given** sessions are open on a machine, **When** I switch its terminal
>    access off, **Then** those sessions end rather than continuing invisibly.

## Objective

A visible, machine-enforced switch for the largest grant this app hands out. This
is `AGENTS.md` §14's settings check answered in the same PR as the feature.

## Decisions already made

Plan **DD-9** governs this task: it reuses the per-machine settings path rather
than inventing a second mechanism.

**The pattern already exists on the same card.** The per-runtime WIP-snapshot
control at
[`machines.tsx:425`](../../../apps/web/src/app/machines/machines.tsx:425) is the
shape to copy: a toggle that dispatches `settings.set`, renders the machine's
**confirmed** value from the heartbeat's `settings` map rather than what the
browser hoped, and so shows a locally-flipped switch without a second mechanism.

**Default on.** Absent means on. The grant is already narrowed by FR-009 to
owner/admin; defaulting off would mean a feature that appears broken until
someone finds a switch, which is the failure this spec exists to remove. The
switch is a way to take the grant back, not a gate to pass first.

**Switching off kills live sessions.** Scenario 3. `killAllSessions("access_revoked")`
from `T-M16-05`, called by core's `settings.set` handler when the value goes
false. A machine that stops allowing terminals while three are open, and leaves
them running, has not stopped allowing terminals.

**The toggle is owner/admin-only too.** A member who cannot open a terminal
cannot change whether anyone else can. `workspace_members.role` again — the same
gate, one layer up.

## Checklist

- [x] Core: `settings.set` accepts `SETTING_TERMINAL_ACCESS`, persists it, and
      reports it back in the heartbeat's `settings` map — already true since
      `T-M16-01`; this task only needed the kill hook below
- [x] Core: setting it false calls `killAllSessions("access_revoked")`
- [x] `machines.tsx`: a toggle beside the WIP-snapshot one, rendering the
      machine's confirmed value, with its pending and failed-to-confirm states
- [x] The toggle is hidden or disabled with a reason for a non-admin member
- [x] Terminals renders the `terminal_access_disabled` state with a link to that
      machine's page (the sentence itself is `T-M17-02`'s; this task proves the
      link lands somewhere useful) — links to `/machines`, the only machine
      surface that exists; no per-machine detail route to link deeper into
- [~] Verified in **both modes and at least the Paper and Mono surfaces** —
      light mode done live (screenshot in Result); dark and Mono not walked,
      same as `T-M17-02`'s note
- [x] `packages/core` and `apps/web` typecheck and tests green

## Traps

**Rendering the browser's optimistic value is the bug this pattern was built to
avoid.** `G-6` is why the heartbeat reports confirmed settings at all. A toggle
that flips instantly and silently fails to reach the machine is worse than one
that takes a second.

**Killing sessions must happen on the machine, not on the page.** The page can
stop showing them; only the machine can stop them existing. Scenario 3 is graded
on the processes, not the UI.

**`DAEMON_SETTABLE_KEYS` is a shared-package constant** and `T-M16-01` adds this
key to it. If that has not landed, this task's core half will typecheck and do
nothing, because the settings handler filters against that list.

## Verification

- [x] Toggle off from the browser; the machine's log shows it applied; the
      heartbeat reports the new value; the card renders it — all confirmed
      live, real signed-in session + real paired daemon (see Result). This
      path is the HTTP command poll (`COMMAND_POLL_INTERVAL_MS`), not
      Realtime, so it needed none of `G-48`'s blocked pieces
- [~] With three sessions open, toggle off: all three end on the machine —
      couldn't open any sessions to test this with (blocked on `G-48`);
      the call itself (`killAllSessions("access_revoked")` fires exactly
      when the value goes off, and not otherwise) is unit-tested directly
      in `commands.test.ts`
- [~] With it off, `terminal.open` is refused `terminal_access_disabled`
      (SC-007) — same `G-48` deferral; unit-tested in `terminal-bridge.test.ts`
      (`T-M16` era) that this refusal fires when the setting is off
- [x] Toggle back on; a new session opens normally — toggle-back-on confirmed
      live; "a new session opens" deferred to `G-48`
- [ ] Flip it in the machine's own local settings and confirm the hosted card
      shows the change — not attempted; out of scope for this pass, no local
      settings UI was exercised

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's task table
- [x] Confirm `settings.md` in the Knowledge Center is covered by
      [`T-M17-05`](T-M17-05-knowledge-center.md) — flagged there

## Result

**Core:** `commands.ts`'s `applySetting` — already the generic allowlisted
settings writer since `T-M4-01` — gained one specific hook: when
`SETTING_TERMINAL_ACCESS` is set and the new value reads as off
(`isTerminalAccessEnabled`, the same shared reader `T-M17-02` added), it
calls `killAllSessions("access_revoked")` from `T-M16-05`'s manager. Two new
unit tests in `commands.test.ts`: fires exactly with `"access_revoked"` when
the value goes off, and does not fire for the value going on or for an
unrelated key.

**Frontend:** `TerminalAccessControl` in `machines.tsx`, built by copying
`SnapshotControl`'s shape line for line (same confirmed-value-only
rendering per `G-6`, same pending/error handling) — the phase's own
instruction. Wired into `RuntimeRow`'s footer beside the snapshot toggle.
Role-gated via a new `canManageTerminals` prop threaded down from
`MachinesPage`, computed from `useWorkspace().data.role` (the same field
`T-M17-02` added to `GET /workspace` for the identical FR-009 check on
Terminals) — disabled with "Only workspace owners and admins can change
this." for a non-admin, rather than hidden, matching the disabled-not-hidden
pattern the snapshot toggle already uses for an offline machine.

**Live-verified the whole round trip that doesn't need `G-48`'s blocked
piece.** This setting travels over the HTTP command-poll loop
(`COMMAND_POLL_INTERVAL_MS = 3s`), not Realtime — a genuinely different
transport from what `G-48` blocks, so this needed none of it. Against the
same real signed-in session and real paired daemon as `T-M17-02`/`T-M17-03`:
toggled off, the switch stayed showing the OLD value until the daemon's
next poll picked up the command (`"setting changed from the control
plane"` in its log) and reported it back — confirmed the card only ever
shows what the machine actually confirmed, never an optimistic flip.
Toggled back on the same way. Console clean throughout. Screenshot on file.

**Not live-verified, both deferred to `T-M17-06` (`G-48`):** the
kill-existing-sessions behavior (nothing to kill — no session could be
opened without a working Realtime connection) and `terminal.open` being
refused `terminal_access_disabled` from the Terminals page itself. Both
have direct unit-test coverage independent of the live gap (`commands.test.ts`
above; `terminal-bridge.test.ts` already covered the refusal path in
`T-M16`). The "flip it locally, watch the hosted card follow" check
(`G-6`'s own precedent) wasn't attempted this pass — no local settings UI
was exercised.
