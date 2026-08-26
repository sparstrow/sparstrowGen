# T-M17-06 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M17 in place |
| **Depends on** | T-M17-01 … T-M17-05 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Walk the spec's acceptance scenarios in the running app, from a browser on a
computer that is not the machine, against the **feature branch's own Vercel
preview** with a real paired machine — `AGENTS.md` §2 rule 3, not
`development.sparstrow.com`.

Run through the `frontend-verify` skill (§3.10), not an improvised loop.

**What this pass cannot reach, named up front:**

- **SC-006 as written** — "a person who installed only the machine service, never
  the desktop app". Installing the service standalone is [`D-10`](../../Deferred.md)
  and does not exist. §A proves the weaker form (a browser on a computer that is
  not the machine, which is what actually matters for every scenario) and **opens
  a `KnownGaps.md` entry for the difference**.
- **FR-009 live** — the owner/admin gate with a real second account. `T-M16-06` §D
  asserts it in SQL. If no second account exists, record it in the same gap entry
  shape as `G-15`/`G-24` rather than ticking §E's live row.

## A — The acceptance scenarios

Reached the way a user reaches them: click through from the sidebar, never by
typing a URL with a made-up id.

**US1 — a shell from a browser**

- [ ] 1 — machine on → Terminals → Shell → prompt within a couple of seconds, and
      the page names the machine
- [ ] 2 — a command printing for several seconds arrives progressively (SC-002)
- [ ] 3 — no machine ever paired → told what a machine is for, offered pairing
- [ ] 4 — machine paired but off → its name, its last-seen time, a retry
- [ ] 5 — network dropped → says it lost contact, refuses keystrokes; on recovery
      either reattaches or says plainly that it could not
- [ ] 6 — flood → suppression notice, an offered interrupt, page does not freeze,
      session does not die

**US2 — come back to a session**

- [ ] 1 — started, tab closed, reopened **an hour later in a different browser** →
      still running, output from the gap present (SC-003)
- [ ] 2 — every live session on the machine listed with its age, not just this
      tab's
- [ ] 3 — a shell that exited is gone from the list, and the attached pane says it
      ended rather than freezing
- [ ] 4 — machine restarted → told the sessions ended because the machine
      restarted, with the time
- [ ] 5 — closing a session ends it on the machine (checked in its process list)

**US3 — agent terminals**

- [ ] 1 — pick an agent, land inside its CLI on the machine, have an exchange
- [ ] 2 — an agent with no interactive mode is not offered

**US4 — the off switch**

- [ ] 1 — the machine's page shows whether it allows terminals and lets it change
- [ ] 2 — switched off → Terminals says that machine does not allow terminals,
      with a link to its page
- [ ] 3 — switched off with sessions open → they end on the machine (SC-007)

- [ ] Each story's independent test passes with only this phase's work present
- [ ] Browser console clean on load in every state above

## A2 — The four states

Reached deliberately, per §3.11. The empty states take effort to reach; reach
them.

- [ ] **Populated** — live shell, machine named, sessions listed with ages
- [ ] **Empty ×4** — never paired / machine off / on but no session / access
      switched off. Each says something different and links somewhere useful
- [ ] **Loading** — a framed pane naming the machine, not an anonymous spinner
- [ ] **Error ×4** — unreachable (name + last seen) / not permitted / machine
      refused (its own reason) / session ended, distinguishing exited, closed,
      machine restarted and access switched off
- [ ] Every one of the six `TerminalRefusal` sentences rendered at least once,
      none falling through to a generic error
- [ ] Both modes, and at least the Paper and Mono surfaces

## B — The measurements

- [ ] **SC-001** — echo latency from a browser on a different network, recorded
      as a **number**. Under 200 ms passes; over it, record the number and open a
      gap entry rather than rounding it down
- [ ] **SC-004** — Terminals opened in all eight states above and the phrase "not
      available from the web app" (or any variant) appears nowhere.
      `grep -rniE "not available in the web|unavailable in the web" apps/web/src`
      shows nothing under `terminals/` or `machines/`
- [ ] Realtime message volume for a five-minute working session, recorded from the
      Supabase dashboard — DD-8's coalescing is the reason this is expected to be
      modest, and a number here is what tells the owner whether the quota concern
      was real

## C — Nothing else moved

- [ ] Run transcripts still stream; chat replies still stream
- [ ] The Machines page's existing controls — pair, rename, revoke, remove, WIP
      snapshot — all still work
- [ ] The local `/ws/terminal/:id` route still works from a browser pointed at
      the machine directly
- [ ] `pnpm typecheck` and `pnpm test` green across the monorepo

## D — The documentation

- [ ] Every article `T-M17-05` touched renders, with a correct breadcrumb and
      title
- [ ] `limitations.md` read end to end against `Deferred.md` and `KnownGaps.md`;
      every sentence still true
- [ ] Nothing describes an `I-11` surface as available
- [ ] The bug file is marked resolved

## E — Access

- [ ] A non-admin member is refused — **live** if a second account exists,
      otherwise recorded as unreached with the gap entry named in the Objective
- [ ] Signing out with a session open: the session keeps running on the machine
      (the owner's chosen lifetime) but the browser cannot reattach without
      signing back in
- [ ] Revoking the machine's pairing ends its sessions

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row and the phase README's
- [ ] `KnownGaps.md` entries for SC-006, for FR-009 if unreached live, and for
      anything else ticked on weaker evidence than it asked for
- [ ] Update the plan's **Status** row to `✅ Completed` and fill its **Result**
- [ ] Update the spec's index row in [`../../specs/README.md`](../../specs/README.md)
- [ ] File any bug or security issue found, in the same turn, per `AGENTS.md` §5
- [ ] Judge whether this is production-ready and, if so, open the
      `development` → `staging` promotion PR (§2 rule 8)

## Result

*(filled in when the pass runs — name what was actually executed, with the
numbers from §B)*
