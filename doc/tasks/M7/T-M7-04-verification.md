# T-M7-04 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M7 in place |
| **Depends on** | T-M7-01 … T-M7-03 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started — section D partially closed 2026-08-22 by [`T-M11-04`](../M11/T-M11-04-desktop-window.md), which also found and filed [`BUG-2026-08-22-desktop-servicemanager-health-check-times-out`](../../bug/BUG-2026-08-22-desktop-servicemanager-health-check-times-out.md). Sections A–C remain unreached. The `/teams/[teamId]` row's hard crash on real data — [`BUG-2026-08-22-teams-page-crashes-with-real-data`](../../bug/BUG-2026-08-22-teams-page-crashes-with-real-data.md), found during an earlier M11 pass at this same checklist item — is fixed (`GET /teams`/`GET /teams/:id` now return the joined shape the page needs) and unit-tested, but not yet re-walked live, so this row of section A stays unticked |

## Objective

Prove the phase for real. Same bar M4 and M5 set — M4 shipped four defects and
M5 two design corrections that only running the thing found.

**Section D cannot be reached without a deployment**, which does not exist (see
the phase README's owner action). Sections A–C need neither. Record whatever D
leaves unproved in `KnownGaps.md` following `G-15`'s shape, rather than grading
the phase on the half that was reachable.

**Section A needs a browser pane that renders.** M4's `G-12` and M5's `G-13` both
record this being unavailable. If it still is, say so there too — a route that
compiles is not a route that renders, which is precisely the class of bug this
section exists to catch.

## A — The five routes render

For each of the five, reach it **by clicking**, never by typing a URL:

| Route | Reached from |
|---|---|
| `/imports` | the sidebar link that 404s today |
| `/teams/[teamId]` | a row on `/teams` |
| `/projects/[projectId]` | a row on `/projects` |
| `/tasks/goals/[goalId]` | a goal on `/tasks` |
| `/skills/[skillId]` | a row on `/skills` |

**Assert, per route:**

- [ ] It renders inside the normal `AppShell` — sidebar present, not a bare page
- [ ] Its primary content is REAL DATA for the record that was clicked, not an
      empty state and not another record's
- [ ] The browser console has no errors on load

**Assert once:**

- [ ] `/imports` resolves from its own sidebar link — the one failure a user can
      hit today without knowing the route exists
- [ ] A goal opened from `/tasks` lands on `/tasks/goals/…`, confirming the path
      the product actually links to is the one that was built

## B — What must NOT have changed

- [ ] Every page that worked before still works — spot-check `/runs/[runId]` and
      `/knowledge/[articleId]`, the two existing dynamic routes, since this task
      adds four more and a routing mistake tends to be systemic
- [ ] Runtime-only actions on the new pages still return `501` with their
      existing message. Project dreaming, sync-from-base, starting a goal,
      team-manager chat and local skill import are **supposed** to refuse in the
      hosted app; a helpful-looking fix here would be a regression
- [ ] Nothing in `packages/ui/` was edited

## C — Electron, without a deployment

All of this is reachable today.

- [ ] A build with `SPARSTROW_APP_URL` unset starts and loads the local core —
      byte-for-byte today's behaviour, confirmed by using the app, not by
      reading the fallback
- [ ] With it set to a dead port: the native offline screen appears, names that
      URL and the real error, and says agents keep running
- [ ] Retry on the screen recovers once something is listening on that port
- [ ] Retry that fails again returns to the screen, not to a blank window
- [ ] The tray still opens the window and still reaches the LOCAL core; the
      updater still reports status. Neither followed the window to the app URL
- [ ] The native folder picker still works from the New project dialog — the
      preload bridge surviving an origin change is decision 5's claim and is
      worth one click to confirm

## D — Electron against the real hosted app

**Needs a deployment.** Skip and record if there is not one.

- [~] `SPARSTROW_APP_URL` pointed at the deployed app: the window loads it —
      **closed 2026-08-22** by `T-M11-04`, log-confirmed (`[main] loading
      window: https://staging.sparstrow.com` → `[main] window loaded:
      https://staging.sparstrow.com/login`) plus a real window title/handle.
      "and sign-in works inside the Electron window" — **not closed**:
      computer-use interaction was unavailable that pass (every
      `computer_batch` call returned `"user interrupt"`, no human present to
      approve), so nothing was typed or clicked inside the window
- [ ] A signed-in desktop window shows this machine as an online runtime —
      not reached, blocked on the item above
- [ ] Host-local features return `501` in the window, as designed, with their
      message intact — not exercised inside the window; the **server-side**
      half of this (the hosted app always returning legible 501s regardless
      of which client calls it) was reconfirmed live in `T-M11-02`
- [~] Killing the network mid-session shows the offline screen rather than a
      broken page — **closed 2026-08-22** by `T-M11-04` for the "renders the
      offline screen" half: the window's title bar read exactly `"Sparstrowgen
      — can't reach the app"` (the offline screen's literal `<title>`) after
      pointing `SPARSTROW_APP_URL` at an unreachable host. The body text
      (URL/error/"agents keep running") and Retry were **not** visually
      confirmed — same computer-use block

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `pnpm --filter @sparstrow/web build` succeeds
- [ ] `packages/desktop` builds

## On completion

- [ ] Tick 9.1–9.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and mark
      Band 9 complete
- [ ] Update the M7 section of
      `doc/plans/2026-08-09-daemon-cloud-control-plane.md` with what shipped and
      what was found
- [ ] **The plan's own status line.** M7 is its last phase — if every phase reads
      done, the plan's status becomes `✅ Completed <date>`. It cannot, while
      `G-13` (M5) and `G-15` (M6) are open and this task's section D is
      unreached; say which of those is why rather than rounding up
- [ ] Knowledge Center pass per `AGENTS.md` §3.2 — five pages that used to 404
      now exist, and any page describing the desktop app as running its own UI
      is now false
- [ ] Every unreached assertion above written into `KnownGaps.md` with its cost
