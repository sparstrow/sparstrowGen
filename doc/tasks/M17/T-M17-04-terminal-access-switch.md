# T-M17-04 — the per-machine off switch

| | |
|---|---|
| **Tag** | `[P]` — `machines.tsx` and core's settings handling; touched by nothing else in this phase |
| **Serves** | `US4` — turn browser terminals off for a machine |
| **Depends on** | M16 (`SETTING_TERMINAL_ACCESS` is defined in `T-M16-01`; enforcement lands in `T-M16-04`) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] Core: `settings.set` accepts `SETTING_TERMINAL_ACCESS`, persists it, and
      reports it back in the heartbeat's `settings` map
- [ ] Core: setting it false calls `killAllSessions("access_revoked")`
- [ ] `machines.tsx`: a toggle beside the WIP-snapshot one, rendering the
      machine's confirmed value, with its pending and failed-to-confirm states
- [ ] The toggle is hidden or disabled with a reason for a non-admin member
- [ ] Terminals renders the `terminal_access_disabled` state with a link to that
      machine's page (the sentence itself is `T-M17-02`'s; this task proves the
      link lands somewhere useful)
- [ ] Verified in **both modes and at least the Paper and Mono surfaces**
- [ ] `packages/core` and `apps/web` typecheck and tests green

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

- [ ] Toggle off from the browser; the machine's log shows it applied; the
      heartbeat reports the new value; the card renders it
- [ ] With three sessions open, toggle off: all three end on the machine —
      confirmed in its process list, not only in the UI
- [ ] With it off, `terminal.open` is refused `terminal_access_disabled`
      (SC-007 — the machine's refusal, not the page hiding a button)
- [ ] Toggle back on; a new session opens normally
- [ ] Flip it in the machine's own local settings and confirm the hosted card
      shows the change — the `G-6` behaviour this reuses

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Confirm `settings.md` in the Knowledge Center is covered by
      [`T-M17-05`](T-M17-05-knowledge-center.md)

## Result

*(filled in when the task lands)*
