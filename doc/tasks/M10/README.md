# M10 — The setup guide

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-16-setup-and-machines.md`](../../plans/2026-08-16-setup-and-machines.md) (M10) |
| **Kind** | **serves US2** — ends in a guide the owner follows from a fresh account to a paired machine |
| **Spec** | [`../../specs/2026-08-16-setup-and-machines.md`](../../specs/2026-08-16-setup-and-machines.md) |
| **Depends on** | **M9** (the three handlers). Soft-depends on **M8** for the machines step's link target. |
| **Blocks** | M11 |
| **Status** | not started |
| **Open questions** | none |

## The story this serves

> **US2 — A setup guide that shows me what is left** (P1)
>
> When I create an account — or come back to one that is half-finished — the app
> shows me what still needs doing to be set up, in order, and walks me through
> it. Profile, then workspace, then machines. I can tell at a glance how far
> along I am, and pick up where I left off.

**Acceptance scenarios this phase must satisfy** (verbatim from the spec):

1. **Given** I have just created an account, **When** I land in the app, **Then**
   I am shown the setup steps and which one is next — not an empty dashboard.
2. **Given** I am partway through setup, **When** I return later, **Then** the
   guide shows completed steps as done and points me at the next one.
3. **Given** I complete a step elsewhere in the app — say I pair a machine from
   the Machines menu — **When** I look at the guide, **Then** that step reads as
   done. It reflects real state, never a separate checkbox I have to tick.
4. **Given** I am fully set up, **When** I look, **Then** the guide is not in my
   way — it stands down rather than nagging.
5. **Given** a step cannot be completed yet, **When** I reach it, **Then** it
   says so and why, rather than failing when I click.
6. **Given** I want to skip ahead, **When** I try, **Then** I can — the guide is
   a guide, not a gate.
7. **Given** I reach the workspace step, **When** I read it, **Then** I can give
   my workspace a real name in place, and doing so is what marks the step done —
   the default `"Personal Workspace"` name does not count as complete.
8. **Given** I reach the machines step, **When** I read it, **Then** it tells me
   plainly what connecting a machine currently requires, including the dev
   checkout, rather than implying a command that does not exist.
9. **Given** an account that existed before this guide shipped, **When** I open
   it, **Then** the guide reflects what I have actually already done — an
   existing workspace still carrying its auto-generated name reads as
   not-yet-done, exactly like a new one.

**Independent test:** create a fresh account and reach a paired, working machine
using only what the guide tells you.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| **`/setup`** | Three steps, each `done` / `current` / `todo`, with what it is for and its action inline | **n/a — never empty.** A fresh account is the *fullest* case. When all three are done the page says so and points at what to do next | Skeletons while the account, workspace and machine queries resolve — the step list keeps its shape, no reflow | A step whose query failed reads **"couldn't check this"** with a retry, and is **not** counted as done or not-done |
| **Dashboard setup card** | A compact `1 of 3 done` summary linking to `/setup` | n/a | Skeleton of the same height, so the dashboard does not jump | Hidden rather than shown broken — the dashboard is not where a failed setup query gets debugged |

The **error** column is the one that gets skipped, and here it is load-bearing:
a step whose state cannot be read must say so, or someone is sent to redo work
they already did (spec scenario 5, plan decision 5).

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M10-01 — `setupSteps()` derivation](T-M10-01-derivation.md) | `[S]` | US2 | — | not started |
| [T-M10-02 — the naming controls](T-M10-02-naming-controls.md) | `[P]` | US2 | M9 | not started |
| [T-M10-03 — `/setup` page and route](T-M10-03-setup-page.md) | `[C]` | US2 | 01, 02 | not started |
| [T-M10-04 — dashboard card + workspace name in the shell](T-M10-04-dashboard-and-shell.md) | `[C]` | US2 | 01 | not started |
| [T-M10-05 — verification](T-M10-05-verification.md) | `[S]` | US2 | 01–04 | not started |

01 is `[S]` — every other task renders what it decides. 02 is `[P]`, two new
component files. 03 and 04 are `[C]` against each other: both touch nav/route
registration and both consume 01's output.

## Objective

Build the guide the owner asked for: a real page, three steps, every step's
state derived from something the app already knows, and two of the three steps
completable without leaving it. Then put an entry point on the dashboard so a
fresh account is met with direction rather than an empty grid.

## The shape of what was found

**There is no onboarding of any kind.** Confirmed by search — nothing matching
onboarding, getting-started, first-run or setup exists in the codebase. This is
built from nothing, not extended.

**The web dashboard is not the shared dashboard.**
[`apps/web/src/app/page.tsx`](../../../apps/web/src/app/page.tsx) is its own
~200-line implementation, unlike every other route, which is a five-line
re-export of a `packages/ui` page. A card added to
`packages/ui/src/routes/pages/dashboard.tsx` would be shown to **nobody** on
the web. T-M10-04 targets the web file specifically.

**The local desktop build has no account and no workspace to name.**
`useAccount()` returning `null` already means "this host has no concept of
accounts"
([`account.tsx:14-17`](../../../packages/ui/src/lib/account.tsx:14)) — the
existing, correct switch. The guide is web-only, and that is a decision (below)
rather than an omission.

**The sidebar has never shown the workspace name.** `WorkspaceSwitcher` prints
the literal `"Sparstrowgen"`
([`workspace-switcher.tsx:50`](../../../packages/ui/src/components/layout/workspace-switcher.tsx:50)).
Naming a workspace with nothing showing the name would be a control whose
effect is invisible — which is why T-M10-04 carries that change rather than
leaving it for later.

**Scenario 9 is free, and that is the point of plan decision 5.** Because
nothing is stored, an account created before the guide existed is not a special
case — it is just an account whose workspace name happens to still be
`"Personal Workspace"`. No migration, no backfill, no "has seen onboarding"
column.

## Definition of done

- All nine US2 acceptance scenarios walked in a browser, including scenario 9
  on an account that predates the guide (the owner's own).
- All four states on both surfaces per the table above — with the **error**
  state reached deliberately by failing a query, not reasoned about.
- `setupSteps()` unit-tested across every combination of the three inputs,
  including each one failing independently.
- The guide is reachable at `/setup`, gates nothing, and stands down when
  complete.
- A machine paired from `/machines` flips the guide's third step with no
  stored flag anywhere (scenario 3).
- Knowledge Center pass (AGENTS.md §3.2). This phase changes **what a new user
  is told the app is**, so `first-run-setup.md` and `what-is-sparstrowgen.md`
  are re-read, not just skimmed.
- `pnpm typecheck` and `pnpm test` green.

**Not in this phase:** avatar upload, email change, password change, invites,
workspace switching, workspace deletion, or a fourth setup step. See the plan's
Scope boundaries.

---

## Decisions already made

Plan decisions 4, 5, 6 and 7 are inherited; cite them rather than restating.

### 1. The three steps, and exactly what makes each one done

| Step | Done when | Where the signal comes from |
|---|---|---|
| **Your profile** | The account's display name is not the email local part | `account.name` vs `account.email.split("@")[0]` |
| **Your workspace** | The workspace slug no longer matches `^personal-[0-9a-f]{8}$` | `useWorkspace()` |
| **Your first machine** | At least one runtime row exists — **paired**, not necessarily reachable | `useRuntimes()` |

**The machine step counts pairing, not reachability.** A machine that paired
and is currently switched off completed the step; telling someone to pair again
because their laptop is asleep would be wrong and would make the guide flicker.

**The workspace signal is the slug, not the name.** The name could legitimately
be typed as "Personal Workspace" by someone who likes it; the slug is set by
`bootstrap_workspace` and only ever changed by a deliberate first rename
(M9 phase decision 2), so it is the honest record of "was this ever named".

### 2. The guide is web-only, and the local build is unchanged

`useAccount()` is `null` in the desktop build — no account to name, no cloud
workspace, and machines are not paired to anything there. `/setup` is not
registered in `packages/ui/src/router.tsx`, and the dashboard card is in the
web dashboard only. **Rejected:** a degraded guide in the local build showing
one step, which would be a surface teaching a workflow that host does not have.

### 3. `unknown` is a first-class step state, not an error screen

Four states per step: `done`, `current`, `todo`, `unknown`. `unknown` is what a
failed query produces, and it renders as "couldn't check this — retry" inline
on that step, leaving the other two accurate. **Rejected:** treating a failed
query as `todo`, which sends someone to redo finished work, and a whole-page
error, which throws away two steps that resolved fine.

### 4. Exactly one step is `current` — the first that is not `done`

Not "the first non-done in priority order with special cases". If all three are
done there is no `current` and the page says setup is complete. This is what
makes scenario 2 ("points me at the next one") a property of the function
rather than a rendering judgement.

### 5. Nothing gates. There is no dismiss button either

Scenario 6. The guide is a page you can navigate away from; that is the whole
skip mechanism. A dismiss button would need somewhere to store "dismissed",
which is the stored flag plan decision 5 rules out — and the card disappearing
on its own when setup completes makes dismissal pointless anyway.

---

## Files

| Path | Change |
|---|---|
| `packages/ui/src/lib/setup.ts` | **new** — `setupSteps()` and its types |
| `packages/ui/src/lib/setup.test.ts` | **new** — the derivation's tests |
| `packages/ui/src/components/workspace-name-card.tsx` | **new** |
| `packages/ui/src/components/profile-name-card.tsx` | **new** |
| `packages/ui/src/routes/pages/setup.tsx` | **new** — the guide |
| `apps/web/src/app/setup/page.tsx` | **new** — re-export |
| `apps/web/src/app/page.tsx` | edit — the setup card |
| `packages/ui/src/routes/pages/settings.tsx` | edit — `WorkspaceNameCard` into Workspace → General |
| `packages/ui/src/components/layout/workspace-switcher.tsx` | edit — show the real name |
| `packages/ui/src/lib/nav-meta.ts` | edit — `setup` label + icon |
| `packages/ui/src/content/knowledge/first-run-setup.md` | edit — this phase makes it describe a real thing |

## Traps

**Adding the card to the shared dashboard shows it to nobody.** See *the shape
of what was found* #2. The web dashboard is `apps/web/src/app/page.tsx`.

**`account.name` falls back to the email local part, so "done" and "not done"
differ by a string comparison that must be exact.** `sriharicoder@gmail.com`
gives `sriharicoder`. Comparing case-insensitively is right; comparing
`includes()` is not — a name of "Srihari" would then read as not-done forever.

**Do not add an `onboarding_completed` column.** Plan decision 5. Every
argument for it is an argument for a second source of truth that will disagree
with the first the moment a step is completed elsewhere in the app — which is
what scenario 3 tests.

**The setup card must not shift the dashboard on load.** It renders above the
stat grid and appears after three queries resolve; without a skeleton of the
same height, the whole dashboard jumps once per load.

**`useWorkspace` does not poll** (M9 decision). If the guide feels stale after
a rename, the fix is invalidation, not a `refetchInterval`.

## Verification

Full procedure in [T-M10-05 — verification](T-M10-05-verification.md).

The assertions that decide the phase:

1. All nine scenarios, walked in a browser.
2. Scenario 3 specifically: pair from `/machines`, watch the guide's step flip,
   with no stored flag anywhere.
3. Scenario 9 on a pre-existing account.
4. All four states on both surfaces, with the error state forced.
