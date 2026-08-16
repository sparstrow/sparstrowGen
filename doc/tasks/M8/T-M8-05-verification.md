# T-M8-05 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M8 in place |
| **Depends on** | T-M8-01, T-M8-02, T-M8-03, T-M8-04 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove US1 for real: open the Machines page in a browser and do everything the
owner said they wanted to do there.

**What this pass may not be able to reach, said up front:**

- **A browser that composites frames.** Recorded three times — `G-12`, `G-13`,
  `G-16` — the Browser pane has never rendered a frame in this environment.
  M8 is almost entirely visual, so if that has not changed, sections A and A2
  produce a `KnownGaps.md` entry rather than ticks. `machineState()` is a pure
  function precisely so section C stays provable either way.
- **A machine paired to staging.** Section A needs a real machine whose
  `SPARSTROW_CLOUD_URL` points at `staging.sparstrow.com`. That is the owner
  action in [`runbooks/README.md`](../../runbooks/README.md). Against
  `localhost:3000` with local core, most of A is still reachable — do that
  rather than skipping, and say which host was used.
- **Scenario 6's unreachable state takes 90 seconds** (`HEARTBEAT_STALE_AFTER_MS`).
  Force it by stopping core, then wait. Do not shorten the constant to make the
  test faster; a shortened constant proves a different system.

## A — The acceptance scenarios

Reach things the way a user does — click the sidebar entry, do not type a URL.

- [ ] **1** — Given signed in, When looking at the sidebar, Then Machines is
      there, in one click, from at least three different routes (dashboard,
      a detail page, settings)
- [ ] **2** — Given no machines paired, When the page loads, Then it explains
      what a machine is for and **Pair a machine** is the primary action
- [ ] **3** — Given Pair a machine pressed, Then the code, a live countdown
      that visibly ticks, a copy button that copies, the command, **and** the
      sentence saying `sparstrow` needs a dev checkout today
- [ ] **4** — Given a machine completes pairing, Then it appears **without a
      manual refresh**, and the code panel retires itself
- [ ] **5** — Given a running machine, Then it reads `active` with name, OS,
      hostname, core version and capability badges
- [ ] **6** — Given core stopped, Then within 90s it reads `unreachable ·
      last seen …` and does **not** say off / asleep / crashed
- [ ] **7** — Given a machine, When renamed inline, Then the name persists
      across a reload and is what the Runs page shows for that machine too
- [ ] **8** — Given a machine, When revoke is pressed, Then the dialog explains
      revoke vs remove before confirming; the same for remove; the outcome
      matches what the dialog said
- [ ] **9** — Given an unreachable machine, When the snapshot switch is
      touched, Then it is disabled with the reason — nothing queues silently
- [ ] **10** — Given Settings → Workspace → General, Then no Machines card, and
      the four remaining cards render with no gap, no dead space, no console
      error
- [ ] **11** — Every one of the above done without opening Settings (except 10,
      which is about Settings)
- [ ] **Independent test** — pair a machine end to end, starting from the
      sidebar, never opening Settings
- [ ] Browser console clean on load and after each interaction

## A2 — The four states

On `/machines`:

- [ ] **Populated** — at least one machine, correct identity fields
- [ ] **Empty** — reached with a workspace that has no machines (a fresh
      account, or remove the only one). Explains the surface and offers the
      action; not a bare "No machines"
- [ ] **Loading** — skeleton rows shaped like real rows; no layout jump when
      data arrives
- [ ] **Error** — reached by making `/api/v1/runtimes` fail (block it in
      devtools, or sign out mid-session). Shows the real message **in place of
      the list** with a retry — **not** the empty state. This is the regression
      T-M8-02 was specifically told to fix; verify it deliberately
- [ ] Light and dark themes
- [ ] Keyboard: tab to Pair a machine, to the rename control, to both
      destructive buttons; visible focus throughout; nothing scrolls sideways
      at 375px

## B — What must NOT have changed

- [ ] `WipSnapshotCard` still renders in Settings → Workspace → General and
      still writes the local machine's setting
- [ ] Settings → Workspace → Integrations unchanged
- [ ] The per-machine snapshot switch still renders `reportedSettings` only —
      flip it, confirm the UI does **not** move until the daemon reports back
      (this is what `G-6` closed; an optimistic switch is a regression)
- [ ] `/api/v1/runtimes` still returns `online` on the wire; nothing consuming
      it broke
- [ ] Factory Health still reports machine counts correctly
- [ ] The local desktop build still starts and `/machines` resolves there too

## C — Provable without a browser or a second machine

- [ ] `pnpm --filter @sparstrow/shared test` — every `machineState()` case,
      including the stale-`draining` ordering case
- [ ] `grep -rn "RuntimesCard\|runtimes-card" packages apps` → no matches
- [ ] `grep -rn "→ Runtimes" packages/core/src` → no matches
- [ ] `sparstrow pair --help` names Machines, not Runtimes or Settings
- [ ] `pnpm --filter web build` lists `/machines` in the route manifest
- [ ] `NAV_META.machines` exists — confirmed by reading `nav-meta.ts`, and by
      the breadcrumb reading "Machines" rather than "machines" once rendered

## D — Needs a machine pointed at `staging.sparstrow.com`

**Skip and record if the owner action has not happened.** These are the same
assertions M11 will walk; doing them here is a bonus, not a duplicate.

- [ ] Scenario 4 against staging, with a real second machine pairing in
- [ ] Scenario 6 against staging, forced by stopping that machine's core

## E — Regression surface

- [ ] `pnpm -r typecheck` green
- [ ] `pnpm -r test` green, with the count recorded in the Result section
- [ ] `pnpm --filter web build` succeeds

## On completion

- [ ] Tick 10.1–10.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and
      mark Band 10 complete
- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row (M8 done · M9/M10 next)
- [ ] Knowledge Center pass per AGENTS.md §3.2 — this phase changes **where a
      user is told to go**, so re-read `first-run-setup.md` and
      `what-is-sparstrowgen.md` as well as anything naming Settings
- [ ] Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md) with what breaks if the
      assumption is wrong and what closes it

## Result

<!-- Name what was actually run: which host, which browser, the test count,
     what was clicked, what was observed. "Verified" is not a result. -->
