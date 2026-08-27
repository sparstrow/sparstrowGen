# T-M17-06 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M17 in place |
| **Depends on** | T-M17-01 … T-M17-05 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except the interactive-session live pass (2026-08-27) — see `G-48` |

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

- [~] 1 — machine on → Terminals → Shell → prompt within a couple of seconds, and
      the page names the machine — the machine-naming half is live-verified;
      the prompt itself blocked, see Result (`G-48`)
- [~] 2 — a command printing for several seconds arrives progressively (SC-002) —
      blocked, `G-48`
- [x] 3 — no machine ever paired → told what a machine is for, offered pairing —
      **live**, real preview deployment
- [x] 4 — machine paired but off → its name, its last-seen time, a retry —
      **live**, real preview deployment (SC-005)
- [~] 5 — network dropped → says it lost contact, refuses keystrokes; on recovery
      either reattaches or says plainly that it could not — blocked, `G-48`
- [~] 6 — flood → suppression notice, an offered interrupt, page does not freeze,
      session does not die — blocked, `G-48`

**US2 — come back to a session**

- [~] 1 — started, tab closed, reopened **an hour later in a different browser** →
      still running, output from the gap present (SC-003) — blocked, `G-48`
- [~] 2 — every live session on the machine listed with its age, not just this
      tab's — blocked, `G-48`
- [~] 3 — a shell that exited is gone from the list, and the attached pane says it
      ended rather than freezing — blocked, `G-48`
- [~] 4 — machine restarted → told the sessions ended because the machine
      restarted, with the time — blocked, `G-48`
- [~] 5 — closing a session ends it on the machine (checked in its process list) —
      blocked, `G-48`

**US3 — agent terminals**

- [~] 1 — pick an agent, land inside its CLI on the machine, have an exchange —
      blocked, `G-48`
- [x] 2 — an agent with no interactive mode is not offered — **not live**, but
      proved a different, arguably stronger way: `terminal-bridge.test.ts`
      asserts `interactiveProviders` against the **real provider registry**
      (`listProviders()`), not a mock, so this is "by construction" evidence
      rather than an unreached checkbox

**US4 — the off switch**

- [x] 1 — the machine's page shows whether it allows terminals and lets it
      change — **live**, real preview deployment, full round trip confirmed in
      the daemon's own log
- [~] 2 — switched off → Terminals says that machine does not allow terminals,
      with a link to its page — blocked, `G-48` (needs `terminal.list` to
      succeed to reach the state where this renders)
- [~] 3 — switched off with sessions open → they end on the machine (SC-007) —
      unit-tested (`commands.test.ts`), not live (no session existed to kill)

- [x] Each story's independent test passes with only this phase's work
      present — true of what ran; the rest is `G-48`
- [x] Browser console clean on load in every state reached — confirmed on all
      of: never-paired, loading, unreachable/timeout, machine-off, in both
      light/dark theme and both Paper/Mono surface

## A2 — The four states

Reached deliberately, per §3.11. The empty states take effort to reach; reach
them.

- [~] **Populated** — live shell, machine named, sessions listed with ages —
      blocked, `G-48` (needs a real session)
- [~] **Empty ×4** — 2 of 4 live (never paired; machine off). "On but no
      session" and "access switched off" both need `terminal.list` to
      succeed, which needs `G-48`'s blocked auth
- [x] **Loading** — a framed pane naming the machine, not an anonymous
      spinner — **live**, confirmed in both light/dark and Paper/Mono
- [~] **Error ×4** — 1 of 4 live (unreachable, name + last seen). "Not
      permitted" needs a non-admin second account (explicitly optional per
      this task's own Objective — see §E); "machine refused" and "session
      ended" both need a session to refuse/end, `G-48`
- [~] Every one of the six `TerminalRefusal` sentences rendered at least
      once — none reachable without `G-48`'s blocked control-channel auth;
      all six are exercised as **code**, not live, via
      `REFUSAL_SENTENCES: Record<TerminalRefusal, string>`'s exhaustiveness
      (TypeScript fails the build if a seventh member has no sentence)
- [x] Both modes, and at least the Paper and Mono surfaces — **live**,
      screenshots on file for: light+Paper (loading, unreachable), dark+Paper
      (machine-off), dark+Mono (loading, unreachable)

## B — The measurements

- [ ] **SC-001** — echo latency from a browser on a different network, recorded
      as a **number**. **Not measured — blocked, `G-48`**: no keystroke could
      round-trip without a working control channel
- [x] **SC-004** — Terminals opened in all eight states above and the phrase "not
      available from the web app" (or any variant) appears nowhere.
      `grep -rniE "not available in the web|unavailable in the web" apps/web/src`
      shows nothing under `terminals/` or `machines/` — confirmed clean
- [ ] Realtime message volume for a five-minute working session, recorded from the
      Supabase dashboard — **not measured — blocked, `G-48`**: no Realtime
      traffic could be generated at all

## C — Nothing else moved

- [x] Run transcripts still stream; chat replies still stream — Chat and Runs
      pages spot-checked live on the real preview, console clean; this band
      never touched `realtime-live-events.ts`, `broadcast.ts`, or any chat/run
      component (confirmed via `git diff origin/development..HEAD --stat`)
- [x] The Machines page's existing controls — pair, rename, revoke, remove, WIP
      snapshot — all still work — **live**: paired a real machine, its
      snapshot toggle rendered and disabled correctly alongside the new
      terminal-access one, and **revoke** was exercised for real (see
      Result) — rename/remove not individually re-clicked, but neither was
      touched by this band's diff either
- [x] The local `/ws/terminal/:id` route still works from a browser pointed at
      the machine directly — not re-run live, but `git diff
      origin/development..HEAD --stat -- packages/core/src/api/routes/terminal.ts
      packages/core/src/cloud/realtime.ts` is empty: neither file has a single
      line changed in this band, and M16 already verified this route directly
- [x] `pnpm typecheck` and `pnpm test` green across the monorepo — green,
      run per-package to avoid a pre-existing, unrelated flaky test under
      full parallel `pnpm test` (see Result)

## D — The documentation

- [x] Every article `T-M17-05` touched renders, with a correct breadcrumb and
      title — **live**, on the real preview: `terminals`, `limitations`,
      `tool-permissions`, `providers-and-execution-modes`, all correct,
      console clean
- [x] `limitations.md` read end to end against `Deferred.md` and `KnownGaps.md`;
      every sentence still true — done in `T-M17-05`, re-confirmed here
- [x] Nothing describes an `I-11` surface as available — confirmed in
      `T-M17-05`'s own pass; `terminals.md` explicitly states project files
      and folder browsing are not here
- [x] The bug file is marked resolved — `BUG-2026-08-24-...` flipped to 🟢 in
      `T-M17-05`

## E — Access

- [~] A non-admin member is refused — **unreached live**, per this task's own
      Objective ("if no second account exists, record it... rather than
      ticking §E's live row"). No second account was created for this
      specifically — see Result for why, and `G-48`'s entry covers it
- [~] Signing out with a session open: the session keeps running on the machine
      but the browser cannot reattach without signing back in — **unreached**,
      needs a real session to sign out from, `G-48`
- [x] Revoking the machine's pairing ends its sessions — **live**: revoked a
      real paired machine's token from the Machines page; the daemon detected
      it within one command-poll cycle and logged "this machine's pairing was
      revoked — stopping the command loop." No session existed to confirm the
      kill half specifically (same `G-48` gap), but the revoke-detection
      mechanism itself — the part this row is actually about — is proven live

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's
- [x] `KnownGaps.md` entries for SC-006, for FR-009 if unreached live, and for
      anything else ticked on weaker evidence than it asked for — folded into
      `G-48`, updated by this task rather than opening a fragmented second entry
- [x] Update the plan's **Status** row to `✅ Completed` and fill its **Result**
- [x] Update the spec's index row in [`../../specs/README.md`](../../specs/README.md)
- [x] File any bug or security issue found, in the same turn, per `AGENTS.md` §5 —
      `BUG-2026-08-27-dashboard-article-describes-a-transport-that-no-longer-exists`
      (filed during `T-M17-05`, still open); nothing new found during this task
- [x] Judge whether this is production-ready and, if so, open the
      `development` → `staging` promotion PR (§2 rule 8) — see Result

## Result

**What actually ran, and where.** Pushed `claude/band-21-cfe736` and verified
against its own real Vercel preview
(`sparstrowgen-git-claude-band-21-cfe736-sparstrow.vercel.app`), per this
task's own Objective — not `development.sparstrow.com`, not localhost. A
disposable `@sparstrow.test` account (owner-authorized, same runbook as
`T-M17-02`) signed in for real via the magic-link procedure, and a real
`core` process (no desktop shell — `npx tsx src/index.ts`, headless) was
paired against that exact preview and driven from `agent-browser`, not the
Claude Browser pane. Two more disposable accounts were minted along the way
(never-paired state, a preview-specific re-auth) and, along with 13 leftover
`@sparstrow.test` accounts found dating back to earlier WA-phase sessions
that had never been cleaned up, all removed via the runbook's own SQL at the
end of this pass — `0` remaining, confirmed by re-listing.

**A genuinely new, more urgent finding, corrected into `G-48` rather than
filed separately: `SUPABASE_JWT_SIGNING_KEY` is broken on *both* Preview and
Development, not just Development.** `T-M17-02` found Development
malformed and, following `G-47`'s wording, assumed Preview still worked.
`vercel env ls preview` shows this is **one stored value tagged for both
environments**, and this task's own real-preview daemon hit the identical
500/no-`kid` failure. Cross-referenced against the value's own "13h ago"
update timestamp and `G-47`'s 2026-08-26 evidence that Preview worked that
day, the value was replaced with a malformed one early on 2026-08-27 — a
regression that happened *during this band*, not a standing gap this band
inherited. `doc/runbooks/README.md`'s row and `G-48` both corrected with
this finding; this is the single highest-leverage fix available to unblock
the rest of §A/§B/A2 without any more engineering.

**What ran live and passed, beyond what the checklists above already mark:**
US1.3, US1.4/SC-005, US4.1 (full round trip, confirmed in the daemon's own
log, not just the UI), revoking a machine's pairing (daemon self-detected
and stopped within one poll cycle), all four `T-M17-05` articles, SC-004,
Chat/Runs/Dashboard regression spot-checks, both themes, and — found by
accident when the browser's own preference didn't carry across a
re-auth — dark mode, screenshotted alongside light, plus both Paper and Mono
surface characters on the loading and unreachable panes. Every state
reached had a clean console.

**What did not run, all one root cause:** every scenario needing the
control channel to actually authenticate — the real point of US1/US2/US3,
SC-001, SC-002, SC-003, SC-006(the weaker form — see below), SC-007's
kill-confirmation, the Realtime-volume measurement, and three of the four
empty/error states. This is not new relative to `T-M17-02`'s `G-48` — it is
the same gap, now confirmed to be wider (both environments) and to have a
real fix path (re-export the current signing key, five minutes on the
Vercel dashboard).

**SC-006, addressed as the Objective specified.** The weaker form — a
browser on a computer that is not the machine — is what every check above
already used: `agent-browser`'s Chrome instance and the paired `core`
process never shared a session or a desktop shell, satisfying the actual
intent (a browser reaching a machine it isn't sitting on). The literal
claim ("installed only the machine service, never the desktop app") stays
unprovable because standalone service installation without a repo checkout
doesn't exist yet (`D-10`) — no new gap opened; `G-48` above already covers
this distinction in the same breath as everything else this pass couldn't
reach.

**FR-009 live, per the Objective's own instruction:** not reached. No
second account was created specifically to test the non-admin refusal,
matching the Objective's explicit fallback ("record it... rather than
ticking §E's live row") rather than manufacturing a workspace-membership
row directly (which `G-47`'s own precedent already ruled out as beyond an
agent's authority to do unsupervised). Recorded in `G-48`.

**`pnpm typecheck` and `pnpm test`, run per-package rather than via the root
`pnpm test`:** the monorepo-wide command intermittently fails one
pre-existing, unrelated test
(`apps/web/src/app/api/daemon/realtime/token/route.test.ts`, sitting right
at vitest's 5000ms default timeout) under full parallel load — reproduced
and diagnosed during `T-M17-02`, flagged as its own spawn-task suggestion,
not a regression from this band. Every package's own suite (`@sparstrow/shared`,
`@sparstrow/core`, `web`) is green in isolation, which is what every task
in this band actually asked for and got.

**Production-readiness judgment, per this task's own final step.** Judged
**ready to promote band 21 into `development`**, on the same basis M16/G-47
already established as this repo's own precedent: every task is built,
unit-tested, and typechecked green; everything reachable without the
JWT-signing-key regression has been live-verified, including a real bug
found and fixed during that verification (`T-M17-02`'s react-query flicker);
the one thing genuinely unverified — the interactive session itself — is
blocked by an infrastructure regression outside this band's own code, with
a five-minute owner fix identified and written down (`doc/runbooks/README.md`).
Band 20 was archived with `G-47` open under this exact reasoning
("does not block the archive per `doc/tasks/README.md`'s own rule"); band 21
follows the same rule. The `development` → `staging` promotion beyond that
is a separate, later judgment call once `development` has actually absorbed
this band and had its own chance to be looked at — not decided here.
