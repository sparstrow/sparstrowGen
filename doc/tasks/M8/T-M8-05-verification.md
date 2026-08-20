# T-M8-05 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M8 in place |
| **Depends on** | T-M8-01, T-M8-02, T-M8-03, T-M8-04 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — sections A, A2, B, C and E walked 2026-08-20; D skipped (owner action) |

## Objective

Prove US1 for real: open the Machines page in a browser and do everything the
owner said they wanted to do there.

**What this pass may not be able to reach, said up front:**

- **A browser that composites frames.** Recorded three times — `G-12`, `G-13`,
  `G-16` — the Browser pane has never rendered a frame in this environment.
  M8 is almost entirely visual, so if that has not changed, sections A and A2
  produce a `KnownGaps.md` entry rather than ticks. `machineState()` is a pure
  function precisely so section C stays provable either way.

  > **This turned out to be soluble.** The in-app Browser pane still does not
  > composite — a page loaded into it stays `document.visibilityState ===
  > "hidden"` and is throttled hard enough that React Query never issues its
  > first request, which reads as a page stuck on skeletons. The **Playwright
  > MCP** drives its own browser, which renders and screenshots normally.
  > Sections A and A2 below were walked that way. Procedure written up in
  > [`runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md).
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

- [x] **1** — Given signed in, When looking at the sidebar, Then Machines is
      there, in one click, from at least three different routes. Checked from
      `/`, `/runs` and `/settings`; clicking it from Settings landed on
      `/machines`
- [x] **2** — Given no machines paired, When the page loads, Then it explains
      what a machine is for and **Pair a machine** is the primary action
- [x] **3** — Given Pair a machine pressed, Then the code, a live countdown
      that visibly ticks, a copy button that copies, the command, **and** the
      sentence saying `sparstrow` needs a dev checkout today. The countdown
      read `Expires in 9:57` and fell on every subsequent read
- [x] **4** — Given a machine completes pairing, Then it appears **without a
      manual refresh**, and the code panel retires itself. Code `4B5ND-S3PJC`
      redeemed from a terminal; the row, the "is paired" banner and the retired
      panel all arrived with no navigation
- [x] **5** — Given a running machine, Then it reads `active` with name, OS,
      hostname, core version and capability badges — `active · win32 ·
      DESKTOP-GJ8NLB8 · core 0.1.0`, badges `claude-code` and `antigravity`.
      Confirmed with a real `@sparstrow/core` process running
- [x] **6** — Given core stopped, Then within 90s it reads `unreachable ·
      last seen …` and does **not** say off / asleep / crashed. Observed at
      `unreachable · last seen 1m ago`
- [~] **7** — Renamed inline to `workshop-desktop`; the name persisted
      through `GET /api/v1/runtimes` and across a reload. **"and is what the
      Runs page shows for that machine too" was not reached** — the disposable
      verification workspace has no runs, and creating one needs an agent and a
      provider. See `G-24`
- [x] **8** — Given a machine, When revoke is pressed, Then the dialog
      explains revoke vs remove before confirming; the same for remove; the
      outcome matches what the dialog said. Revoke dialog opened and cancelled
      with no side effect; remove confirmed, the row went, and the list
      returned to the empty state
- [x] **9** — Given an unreachable machine, When the snapshot switch is
      touched, Then it is disabled with the reason — nothing queues silently.
      The switch carried `disabled` and "This machine is unreachable — its
      settings can be changed when it reconnects." 
- [x] **10** — Given Settings → Workspace → General, Then no Machines card,
      and the remaining cards render with no gap, no dead space, no console
      error. Factory health, System and Advanced render contiguously. The two
      console errors on that tab are pre-existing 501s from
      `/api/v1/system/secrets/github-pat`, unrelated to M8
- [x] **11** — Every one of the above done without opening Settings (except
      10, which is about Settings)
- [x] **Independent test** — pair a machine end to end, starting from the
      sidebar, never opening Settings. Done twice, plus three more machines
      paired for the volume check
- [x] Browser console clean on load and after each interaction — zero errors
      and zero warnings on `/machines` across every state and action. The only
      messages anywhere in the pass came from Settings (the 501s above) and the
      command palette's pre-existing "Missing `Description` for
      {DialogContent}" warning

## A2 — The four states

On `/machines`:

- [x] **Populated** — four machines (one unreachable, three active), correct
      identity fields on each. Deliberately more than three, per `DESIGN.md`
      §10's "realistic volume"
- [x] **Empty** — reached both ways: a fresh disposable account, and removing
      the only machine. Explains the surface and offers the action
- [x] **Loading** — skeleton rows shaped like real rows, held open by delaying
      the response. Skeleton row and real row measure the same height, so
      nothing jumps when data arrives
- [x] **Error** — reached by intercepting `/api/v1/runtimes` and returning a
      503. Shows the real message in place of the list with a **Try again**
      button, and **not** the empty state. Seen a second time, unstaged, in the
      vite build with no core behind the proxy (`Request failed (500)`)
- [x] Light and dark themes
- [x] Keyboard: tab order runs Pair a machine → Rename → Revoke → Remove, all
      with a visible 2px focus ring (read from the computed `box-shadow`, not
      judged by eye). At 375px `scrollWidth === innerWidth === 375` — no
      sideways scroll — after fixing a truncation this pass found (see
      T-M8-02's Result)

## B — What must NOT have changed

- [x] `WipSnapshotCard` still renders in Settings → Workspace → General and
      still writes the local machine's setting. Present and unmodified; it is
      `account`-gated, so it is correctly **absent** in the hosted app and
      appears only in the local build, which is what its own comment says it
      does. Its forward reference to "the Machines card" was updated, that card
      being gone
- [x] Settings → Workspace → Integrations unchanged
- [x] The per-machine snapshot switch still renders `reportedSettings` only.
      **Proved live, with core actually running**: clicked it, and
      `aria-checked` stayed `true` immediately after and nine seconds later. It
      flipped to `false` only once `GET /api/v1/runtimes` carried
      `git.wipSnapshot: "off"` back from the daemon. First time `G-6`'s
      invariant has been watched rather than reasoned about
- [x] `/api/v1/runtimes` still returns `online` on the wire; nothing consuming
      it broke
- [x] Factory Health still reports machine counts correctly — "1 of 1
      machine(s) online"
- [x] The local desktop build still starts and `/machines` resolves there too
      — vite dev server on 5173, page renders, sidebar entry present

## C — Provable without a browser or a second machine

- [x] `pnpm --filter @sparstrow/shared test` — every `machineState()` case,
      including the stale-`draining` ordering case. 85 passed
- [x] `grep -rn "RuntimesCard\|runtimes-card" packages apps` → no matches.
      One prose mention survives, in `machines.tsx`'s header comment, naming
      what the page was promoted from
- [x] `grep -rn "→ Runtimes" packages/core/src` → no matches
- [x] `sparstrow pair --help` names Machines, not Runtimes or Settings —
      run, not read: "Redeem a pairing code from the Machines page" and "open
      Machines in the sidebar"
- [x] `pnpm --filter web build` lists `/machines` in the route manifest
- [x] `NAV_META.machines` exists — **and the breadcrumb rendered `machines`
      lowercase anyway** on the first pass, because `breadcrumbs.tsx` kept its
      own label map. Fixed by deleting that duplicate; the breadcrumb now reads
      "Machines". This check earned its place

## D — Needs a machine pointed at `staging.sparstrow.com`

**Skip and record if the owner action has not happened.** These are the same
assertions M11 will walk; doing them here is a bonus, not a duplicate.

- [~] Scenario 4 against staging, with a real second machine pairing in
- [~] Scenario 6 against staging, forced by stopping that machine's core

**Skipped — the owner action has not happened.** Both were walked against
`localhost:3000` instead, with real pairings and a real daemon, which is what
this task said to do rather than skip. What staging would add is the deployed
host and a genuinely separate computer. Recorded as `G-24`.

## E — Regression surface

- [x] `pnpm -r typecheck` green — 7 packages
- [x] `pnpm -r test` green — **1044 passed, 4 skipped** across 113 files
- [x] `pnpm --filter web build` succeeds

## On completion

- [x] Tick 10.1–10.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and
      mark Band 10 complete
- [x] Update the phase `README.md` status line and its task table
- [x] Update the plan's **Status** row (M8 done · M9/M10 next)
- [x] Knowledge Center pass per AGENTS.md §3.2 — this phase changes **where a
      user is told to go**, so re-read `first-run-setup.md` and
      `what-is-sparstrowgen.md` as well as anything naming Settings
- [x] Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md) — `G-23` (the two duplicated
      app shells) and `G-24` (what only staging and a second computer can
      show)

## Result

**Walked 2026-08-20** against `http://localhost:3000` — the Next dev server from
this worktree, with `apps/web/.env.local` copied in from the main checkout so the
app was actually configured — driven through the **Playwright MCP**, signed in as
a disposable `@sparstrow.test` account minted with the admin API per
[`runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md).
The `staging`/`development` Supabase project is the only one that exists, so that
runbook's "staging only" constraint holds.

**Not against `staging.sparstrow.com`, and not with a second computer.** The owner
action in [`runbooks/README.md`](../../runbooks/README.md) has still not happened.
Section D is skipped and recorded, not ticked.

### What was actually done

Four machines paired for real, each with its own `SPARSTROW_SECRETS_DIR` so the
owner's own `~/.sparstrow` was never touched: `workshop-desktop` (renamed from
`verify-box` through the page), `build-server`, `mac-laptop`, `gpu-rig`. A real
`@sparstrow/core` was then started against `workshop-desktop`'s pairing, which is
what made scenario 5 and the `G-6` switch check live rather than inferred. Codes
were minted from the page and redeemed from a terminal — the flow a user actually
performs.

All four states, both themes, 375px and 1280px, keyboard-only traversal, and the
eleven acceptance scenarios: ten ticked, one partial. **The only thing sections
A/A2/B could not reach was scenario 7's "and the Runs page shows the new name
too"**, because the disposable workspace has no runs in it.

### Four defects, all found by rendering rather than reading

Every one would have shipped behind a green typecheck and 1044 passing tests:

1. **No sidebar entry in the hosted app at all.** `apps/web` keeps its own
   `NAV_GROUPS`, separate from `packages/ui`'s. Scenario 1 failed in the host that
   matters.
2. **The breadcrumb read a lowercase `machines`** beside a tab strip reading
   `Machines`, because `breadcrumbs.tsx` kept a second copy of the label map.
3. **The dev-checkout sentence rendered twice at once** on the empty state — once
   in the pairing panel, once below it.
4. **At 375px the identity line truncated to `active · win3…`** — the exact
   fields scenario 5 requires the row to show.

Fixes and reasoning in [T-M8-02](T-M8-02-machines-page.md) and
[T-M8-03](T-M8-03-route-and-nav.md).

### The Browser-pane limitation has a workaround, and that is the bigger finding

`G-12`, `G-13` and `G-16` all rest on "the Browser pane has never rendered a frame
in this environment". That is still true of the pane: a page loaded into it reports
`document.visibilityState === "hidden"` and is throttled hard enough that React
Query never issues its first fetch, so the page sits on skeletons forever and looks
broken. `tabs_select` does not change it.

**The Playwright MCP is not affected.** It drives its own browser, which
composites, screenshots, takes real keyboard input, and supports route
interception — which is how the error and loading states were reached deliberately
rather than hoped for. Combined with copying `.env.local` into the worktree (which
`G-16` explicitly declined to do "for a routing check" — a reasonable call then,
the wrong one now), a full rendered pass is available to any agent that wants one.

Written into
[`runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md) so
the next phase does not rediscover it. `G-12`, `G-13` and `G-16` are **annotated,
not closed** — their assertions still have not been run, and only running them
closes them. What changed is that nothing is stopping anyone now.

### A flaky test, caught on the second sighting

During the first full `pnpm test` after the verification fixes, **one of `web`'s
215 tests failed** and its name scrolled away before it could be read. It did not
recur in nine standalone runs, which is why it was nearly written off. It
**recurred on the final regression sweep**, and this time it was pinned:

`src/lib/realtime-live-events.test.ts > RealtimeLiveEventSource > subscribes on
run:<workspaceId>:<runId>, private`, failing at **5547ms** — a timeout against
vitest's 5000ms default, not an assertion. It reproduces roughly two times in
five through `pnpm test --force`, which runs five packages' suites concurrently,
and **never** through `pnpm --filter web test` or vitest directly. The cause is
the cold `await import("./realtime-live-events")` in the first test body being
charged to a test's timeout rather than a hook's; under contention the transform
crosses five seconds.

Unrelated to M8 — written up as
[`BUG-2026-08-20-flaky-realtime-live-events-test`](../../bug/BUG-2026-08-20-flaky-realtime-live-events-test.md)
with the diagnosis and two candidate fixes, and deliberately **not** fixed in
this PR: changing shared test configuration does not belong in a UI change.

The 1044/4-skipped figure above is from a clean run. Take it as "the suite passes
when it is not fighting itself", which is the honest reading until that bug is
closed.

### Re-verified after the theming rebuild — 2026-08-20

The pass above ran against the pre-`G-19` palette. PR #100 merged the same day
and replaced it, so the visual assertions were re-run on the rebased branch
rather than assumed to carry:

- **Populated, empty and error states, on Paper and Mono, in both modes.** Mono
  is `DESIGN.md` §12's stated worst case — no surface tint to hide behind — and
  had not been checked in the first pass, which predates the surfaces existing.
- **Status colour re-read after the token inversion.** `active` renders green
  and the dot is visible on every surface tried; before the fix both were
  near-white. This is the regression the rebase caught.
- **The brand accent now reaches the page**, correctly and only where §2.1 says
  it may: the primary **Pair a machine** button and the snapshot switch. Nothing
  status-coloured moved.
- **Keyboard order unchanged** — Pair a machine → Rename → Revoke → Remove.
- **375px still has no sideways scroll** (`scrollWidth === innerWidth === 375`).
- **Console clean**, zero errors and zero warnings across all three states.
- `pnpm typecheck` green; `pnpm test` **1219 passed / 4 skipped** (up from 1044
  — PR #100 added the theme contrast sweep to `@sparstrow/shared`).

**A slop audit was run against the page** using the `slop-audit` skill, which
did not exist when the page was written. Zero findings in the target after the
`nested-cards` fix. Two things it surfaced that are **not** findings, recorded
so the next audit does not re-litigate them:

- `icon-tile-stack` matches the machine tile and is **earned** — `DESIGN.md` §6
  mandates the entity tile by name, and the tile carries the status dot, so it
  is not information-free geometry.
- `text-[1.75rem] font-[650] leading-[1.15]` and `max-w-[1280px]` are arbitrary
  literals where tokens belong. They are the **already-parked** position in
  [`../D1/README.md`](../D1/README.md): §3's type scale has no CSS counterpart
  yet, and inventing tokens mid-sweep is what `G-18` exists to prevent. The
  literals match the doctrine's own figures and stay until the scale ships.

**Caveat on who ran it.** `AGENTS.md` §3.13 says `slop-audit` is run by the
`slop-killer` agent, precisely because an author auditing their own surface is
not a second opinion. It was run inline in the authoring session instead. The
report-only boundary was kept and is evidenced — `git status --short` was
identical before and after — but the independence the rule asks for was not
achieved. Worth re-running from `slop-killer` before this merges.

### Cleanup

Both disposable accounts, their workspaces, their profile rows and all four
machines were deleted with the runbook's SQL — not `auth.admin.deleteUser`, which
orphans rows
([`BUG-2026-08-18-orphaned-account-rows-on-staging`](../../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md)).
Verified afterwards: zero `%@sparstrow.test` users, zero orphaned `runtimes` rows.
Core was stopped, the copied `.env.local` is gitignored, and the temporary scripts
and screenshots were removed.
