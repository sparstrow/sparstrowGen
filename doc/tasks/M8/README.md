# M8 — Machines gets a menu of its own

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-16-setup-and-machines.md`](../../plans/2026-08-16-setup-and-machines.md) (M8) |
| **Kind** | **serves US1** — ends in a page the owner opens and pairs a machine from |
| **Spec** | [`../../specs/2026-08-16-setup-and-machines.md`](../../specs/2026-08-16-setup-and-machines.md) |
| **Depends on** | — (every endpoint shipped in M3/M4) |
| **Blocks** | M11. M10 soft-depends on it for the machines step's link target. |
| **Status** | 🟡 **partly done** — 01 and 04 landed 2026-08-18; 02, 03 and 05 held for the design-system rebuild. See the note below. |
| **Open questions** | none |

> **⚠️ The CLI currently names a page that does not exist.** `T-M8-04` landed
> ahead of `T-M8-03`, which was always the plan, but 02/03 are held for the
> design-system rebuild -- so `sparstrow pair` now says *"open Machines in the
> sidebar"* while the only Machines surface is still the card in Settings ->
> Workspace -> General. Pointing at the Settings card instead would have meant
> editing all four strings twice inside one milestone; the hold is what makes
> the window longer than the task assumed. The Knowledge Center still says
> **Settings -> Machines**, which is correct today, and `T-M8-03` owns updating
> it. Nothing is broken -- the pairing control works and is one tab away -- but
> until 03 lands, the CLI's instruction is aspirational.

## The story this serves

> **US1 — Machines get a menu of their own** (P1)
>
> Machines are a first-class destination in the sidebar, not a card buried in
> settings. I open it and see every machine connected to my workspace and
> whether each is working, and I can pair a new one or manage an existing one
> right there — rename, revoke, remove — without leaving the page.

**Acceptance scenarios this phase must satisfy** (verbatim from the spec):

1. **Given** I am signed in, **When** I look at the sidebar, **Then** there is a
   Machines destination reachable in one click from anywhere.
2. **Given** I open Machines with none paired, **When** the page loads, **Then**
   it explains what a machine is for and offers **Pair a machine** as the
   primary action — the empty state teaches the surface.
3. **Given** I press **Pair a machine**, **When** the code appears, **Then** I
   see the code, a live countdown, a copy button, and the exact steps to run on
   the machine — naming places that actually exist, and honest about needing a
   dev checkout today.
4. **Given** a machine finishes pairing, **When** I look at the page without
   refreshing, **Then** it appears in the list.
5. **Given** a machine is running and reachable, **When** I look at it, **Then**
   it reads as active, with its name, OS, hostname, core version and what it can
   run.
6. **Given** a machine has stopped talking — off, asleep, crashed or
   disconnected — **When** I look at it, **Then** it reads as **unreachable**
   with when it was last seen, and does **not** claim to know which of those
   happened.
7. **Given** a machine in the list, **When** I rename it, **Then** the new name
   sticks and is what I see everywhere that machine is named.
8. **Given** a machine in the list, **When** I revoke or remove it, **Then** I am
   told the difference before confirming, and the result matches what I was told.
9. **Given** a machine is unreachable, **When** I try a control that needs it,
   **Then** the control refuses with the reason rather than queuing silently.
10. **Given** I go to Settings → Workspace → General, **When** I look for
    machines, **Then** the old card is gone and nothing is orphaned by its
    removal.
11. **Given** I am on the Machines page, **When** I do any of the above, **Then**
    I never had to open Settings.

**Independent test:** open the Machines menu on `staging.sparstrow.com` and pair
a machine from it end to end, never opening Settings.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| **`/machines`** | Rows: state dot + `active`/`unreachable · last seen 4m ago`, name (inline rename), `os · hostname · core x.y.z`, capability badges, revoke/remove, the per-machine snapshot switch | Centred panel: what a machine is for, what pairing does, **Pair a machine** as the primary button, and the honest note about the dev checkout | Skeleton rows shaped like real rows — same height, same three columns | The real message from the failed query, rendered in place where the list would be, with a retry. Never a toast. |

The empty state is **the most important screen in this spec** (spec, *Interface
& experience*). It is what a brand-new owner sees and where the setup guide
sends them.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M8-01 — `machineState()` in shared](T-M8-01-machine-state.md) | `[S]` | US1 | — | ✅ done (2026-08-18) |
| [T-M8-02 — promote the card to a page](T-M8-02-machines-page.md) | `[S]` | US1 | 01 | not started |
| [T-M8-03 — route, sidebar, nav metadata](T-M8-03-route-and-nav.md) | `[P]` | US1 | 02 | not started |
| [T-M8-04 — fix the CLI's pairing path](T-M8-04-cli-path-strings.md) | `[P]` | US1 | — | ✅ done (2026-08-18) |
| [T-M8-05 — verification](T-M8-05-verification.md) | `[S]` | US1 | 01–04 | not started |

01 is `[S]` because it defines the vocabulary 02 renders. 02 is `[S]` because it
moves a file three other modules import. 03 and 04 are `[P]` — disjoint files,
different workers, no coordination.

## Objective

Move machines out of Settings and into a top-level destination, and give the
reachability label a vocabulary that can grow a third state without a rewrite.
Almost nothing here is new behaviour: pair, rename, revoke, remove and the
per-machine snapshot switch all exist and are verified live on staging (M3,
M4). What is new is **where they live**, **what the second state is called**,
and **whether the instructions name a real place**.

## The shape of what was found

**The card is better than the plan assumed, and that changes the task shape.**
`runtimes-card.tsx` is 430 lines carrying three pieces of hard-won behaviour,
each with a comment explaining the failure it prevents: the live countdown
(a dead code read into a terminal on another machine), the auto-retire when a
machine appears (a *redeemed* code that keeps counting down), and the
`reportedSettings`-only snapshot switch (the entire reason `G-6` closed rather
than reopening in a new place). A page written fresh against the same hooks
would drop all three silently. So T-M8-02 is a **move**, and the phase is
graded on nothing being lost in it.

**A new destination has to be registered in five places, not two.** Missing any
one fails quietly:

| File | What breaks if skipped |
|---|---|
| `packages/ui/src/components/layout/app-shell.tsx` | no sidebar entry — scenario 1 fails |
| `packages/ui/src/lib/nav-meta.ts` | breadcrumb and tab strip read a lowercase `machines` with a generic icon |
| `packages/ui/src/components/layout/command-palette.tsx` | Ctrl-K cannot reach it |
| `packages/ui/src/router.tsx` | the local desktop build 404s |
| `apps/web/src/app/machines/page.tsx` | the hosted app 404s |

`nav-meta.ts` calls itself "one source of truth for section label + icon" and is
the one most likely to be missed, because forgetting it produces a page that
works.

**Scenario 9 is already true and must be preserved, not built.** An offline
machine's snapshot switch is disabled with the reason spelled out, and the
server refuses with `409 runtime_offline` rather than queuing
([`runtimes.ts:359`](../../../apps/web/src/lib/api/handlers/runtimes.ts:359)).
The task's job is to not regress it.

**`WipSnapshotCard` is not the per-machine switch.**
[`settings.tsx:252`](../../../packages/ui/src/routes/pages/settings.tsx:252) is
the **local build's own** snapshot setting, written to that machine's SQLite. It
stays. Only `RuntimesCard` leaves.

## Definition of done

- All eleven US1 acceptance scenarios walked on a rendered page, against
  `staging.sparstrow.com`, with a real paired machine.
- All four states present on `/machines` per the table above — including the
  empty state, which is the screen this phase is most likely to under-build.
- `machineState()` unit-tested across every input combination, including a
  `draining` machine whose heartbeat is stale.
- The Settings → Workspace → General tab renders its four remaining cards with
  nothing orphaned: no dead import, no empty grid cell, no scroll to nowhere.
- [`BUG-2026-08-16-pairing-path-wrong-in-cli`](../../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md)
  flipped to 🟢 resolved, with the resolution naming the new destination.
- Knowledge Center pass (AGENTS.md §3.2), including the four global-claim pages
  — this phase moves where a user is told to go.
- `pnpm typecheck` and `pnpm test` green across the workspace.

**Not in this phase:** a third machine state. Two states this round, per spec
decision 2 — sleeping is [`D-16`](../../Deferred.md), and phase decision 1 is
what keeps it to a one-branch change.

---

## Decisions already made

Plan decisions 1, 2, 3 and 9 are inherited and not restated here. Cite them as
"plan decision N".

### 1. The state label is computed once, in `@sparstrow/shared`, not in the row

Plan decision 2, made concrete:

```ts
// packages/shared/src/cloud.ts, beside isRuntimeOnline
export type MachineState = "active" | "unreachable" | "draining";

export function machineState(
  status: string | null | undefined,
  lastHeartbeat: string | Date | null | undefined,
  now: number = Date.now(),
): MachineState
```

`draining` wins only while the machine is still reachable — a machine that
declared it was shutting down and then went quiet **is** unreachable, and
saying "shutting down" about something that stopped talking twenty minutes ago
asserts a cause we do not know (spec decision 1, the same rule that rejected
"turned off").

`isRuntimeOnline` stays exactly as it is. It is called by two handlers and the
health endpoint, all of which want the boolean, not the label.

### 2. `runtimes.status` is not migrated, renamed, or given new values

The column carries what a daemon **declares** about itself. Reachability is
derived from heartbeat age — M3 decision 4, restated in
[`system.ts:11-18`](../../../apps/web/src/lib/api/handlers/system.ts:11) and in
the `/runtimes` handler's own comment. A crashed machine writes nothing, so a
stored status is whatever it was when the machine was last healthy. No
migration in this phase.

### 3. Machines goes in the **Workspace** nav group, directly after Runs

Not a new group, and not under Configure. A machine is where a run happens, so
it sits next to Runs; Configure is for things you set up once. `Workspace` also
already holds the seven destinations that are workspace-scoped rather than
personal, which a machine is.

### 4. The pairing panel keeps `sparstrow pair <code>` and adds a line about it

Plan decision 9 and FR-016. **Rejected:** removing the command, which leaves
someone with a code and nothing to do with it, and changing it to a
`pnpm --filter` invocation, which is right for a dev checkout today and wrong
the moment [`D-10`](../../Deferred.md) ships a real binary. The command stays;
one sentence above it says the machine needs a checkout of this repo today and
links nothing it cannot deliver.

---

## Files

| Path | Change |
|---|---|
| `packages/shared/src/cloud.ts` | edit — add `MachineState` and `machineState()` |
| `packages/shared/src/cloud.test.ts` | edit or new — tests for the above |
| `packages/ui/src/routes/pages/machines.tsx` | **new** — the page, moved from the card |
| `packages/ui/src/components/runtimes-card.tsx` | **deleted** |
| `packages/ui/src/routes/pages/settings.tsx` | edit — drop the import and the `<RuntimesCard />` usage |
| `packages/ui/src/router.tsx` | edit — register `/machines` |
| `packages/ui/src/components/layout/app-shell.tsx` | edit — nav entry |
| `packages/ui/src/lib/nav-meta.ts` | edit — `machines` label + icon |
| `packages/ui/src/components/layout/command-palette.tsx` | edit — destination |
| `apps/web/src/app/machines/page.tsx` | **new** — five-line re-export |
| `packages/core/src/cli/pair.ts` | edit — four path strings |
| `packages/ui/src/content/knowledge/*.md` | edit — wherever pairing is described |

## Traps

**Deleting `runtimes-card.tsx` and creating `machines.tsx` in separate commits
breaks the build in between.** `settings.tsx` imports it at line 41. The move,
the deletion and the settings edit are one task (T-M8-02) for exactly this
reason — do not split them across workers.

**`MonitorSmartphone` is the card's empty-state icon and `HardDrive` is used on
the dashboard.** Pick the nav icon deliberately and use the same one in all
three nav files, or the sidebar, breadcrumb and palette show three different
glyphs for one destination.

**The auto-retire effect compares `machines.length` to a count captured at
issue time.** It is subtle and looks like dead code if you skim it. Moving the
component without moving that `useEffect` produces a panel that counts down over
a code someone has already redeemed — the exact failure its comment describes.

**`reportedSettings` must stay the only thing the switch renders.** An
"improvement" to optimistic UI here reopens `G-6` in a new file. The comment
above `SnapshotControl` says why; move it with the code.

**The web dashboard is `apps/web/src/app/page.tsx`, not the shared
`dashboard.tsx`.** Nothing in this phase touches the dashboard, but the same
trap bites M10 — noted here because the two phases share reviewers.

## Verification

Full procedure in [T-M8-05 — verification](T-M8-05-verification.md).

The assertions that decide the phase:

1. Every one of the eleven scenarios above, walked on a rendered page.
2. Both machine states forced deliberately — core running, then stopped — and
   the label changing within 90 seconds (`HEARTBEAT_STALE_AFTER_MS`).
3. Settings → Workspace → General with nothing orphaned.
4. `sparstrow pair --help` naming a place that exists.
