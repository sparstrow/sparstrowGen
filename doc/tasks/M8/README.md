# M8 — Machines gets a menu of its own

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-16-setup-and-machines.md`](../../plans/2026-08-16-setup-and-machines.md) (M8) |
| **Kind** | **serves US1** — ends in a page the owner opens and pairs a machine from |
| **Spec** | [`../../specs/2026-08-16-setup-and-machines.md`](../../specs/2026-08-16-setup-and-machines.md) |
| **Depends on** | — (every endpoint shipped in M3/M4) |
| **Blocks** | M11. M10 soft-depends on it for the machines step's link target. |
| **Status** | ✅ **complete** — 01 and 04 landed 2026-08-18; 02, 03 and 05 on 2026-08-20. |
| **Open questions** | none |

> **The CLI's instruction is now true.** `T-M8-04` landed ahead of `T-M8-03`,
> which was always the plan, and for two days `sparstrow pair` said *"open
> Machines in the sidebar"* while the only Machines surface was a card in
> Settings. `T-M8-03` closed that window on 2026-08-20: Machines is a
> destination, the CLI's four strings name it, and `sparstrow pair --help` was
> run against the built CLI to confirm rather than read.

> **The hold for the design-system rebuild was lifted, and the rebuild then
> landed underneath it.** 02, 03 and 05 were parked for lack of a doctrine;
> `DESIGN.md` (2026-08-18) removed that reason, so they were built on
> 2026-08-20 against the tokens that existed at the time. **PR #100 merged the
> same day**, closing `G-19` and rebuilding `globals.css` parametrically, and
> this branch was rebased onto it.
>
> The judgement that the page did not depend on the rebuild was **half right,
> and the wrong half mattered.** Neutrals (`bg-background`,
> `text-muted-foreground`) were re-derived, not renamed, exactly as assumed.
> **Status tokens inverted their meaning**: `--success` used to be a pale tint
> with `--success-foreground` carrying the saturated colour, and now
> `--success` *is* the status colour while `--success-foreground` is the
> neutral that sits on top of a solid fill. Every `bg-success-foreground` and
> `text-success-foreground` in this page — the status dot, the state label, the
> paired-confirmation tick — therefore became near-white, invisible in light
> mode. Caught on the rebase and corrected; re-verified in a browser on Paper
> and Mono, both modes.
>
> **The lesson is the general one, not the specific one:** "the rebuild renames
> nothing" was an assumption about someone else's unmerged work, stated in this
> file as if it were a fact. It should have been checked against the branch, or
> written as an assumption.

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
| [T-M8-02 — promote the card to a page](T-M8-02-machines-page.md) | `[S]` | US1 | 01 | ✅ done (2026-08-20) |
| [T-M8-03 — route, sidebar, nav metadata](T-M8-03-route-and-nav.md) | `[P]` | US1 | 02 | ✅ done (2026-08-20) |
| [T-M8-04 — fix the CLI's pairing path](T-M8-04-cli-path-strings.md) | `[P]` | US1 | — | ✅ done (2026-08-18) |
| [T-M8-05 — verification](T-M8-05-verification.md) | `[S]` | US1 | 01–04 | ✅ done (2026-08-20) |

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

> **It was seven.** `T-M8-03`'s pass found two more, both by opening the page
> rather than reading the tree: `apps/web/src/components/layout/app-shell.tsx`
> keeps its **own** `NAV_GROUPS` — so the hosted app had no sidebar entry at all
> — and `breadcrumbs.tsx` kept a **second** copy of the section-label map, so
> the breadcrumb read a lowercase `machines` beside a tab strip reading
> `Machines`. The breadcrumb duplicate was deleted rather than extended; the two
> app shells remain, recorded as [`G-23`](../../KnownGaps.md).

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

Full procedure and results in [T-M8-05 — verification](T-M8-05-verification.md).
**Walked 2026-08-20** against `localhost:3000` in a real browser, with four
machines paired and a live daemon: ten of eleven scenarios ticked, all four
states seen, both themes, 375px and keyboard. Four defects found by rendering
that nothing in 1044 passing tests could see.

The assertions that decide the phase:

1. Every one of the eleven scenarios above, walked on a rendered page.
2. Both machine states forced deliberately — core running, then stopped — and
   the label changing within 90 seconds (`HEARTBEAT_STALE_AFTER_MS`).
3. Settings → Workspace → General with nothing orphaned.
4. `sparstrow pair --help` naming a place that exists.

---

## What this phase learned

**Rendered verification is available in this environment after all.** Three
`KnownGaps.md` entries — `G-12`, `G-13`, `G-16` — rest on "the Browser pane has
never composited a frame here". That is still true of the pane, and it is not
true of the **Playwright MCP**, which drives its own browser. Every visual
assertion in `T-M8-05` was reached that way. The other half of the unlock is
just as mundane: copying `apps/web/.env.local` into the worktree gets past the
app's "not configured" guard, which `G-16` had declined to do. Both are now in
[`runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md).

**A move is not a small task when the destination is new.** The page itself was
close to a straight relocation, as the task predicted. Everything that went
wrong was in the *registration*: two nav surfaces the decomposition did not know
existed, both failing silently, both invisible to the type checker and the test
suite. The lesson generalises past this phase — the next destination anyone adds
hits the same two files.

**Rows are taller than `DESIGN.md` §4's 48px target**, because each carries the
per-machine snapshot control on a second line. Four machines fill the viewport.
Not changed here: the control is moved behaviour, and the right home for it is
the machine profile that [`D-18`](../../Deferred.md) parks. Noted so the next
person does not read the current density as a decision.

**A slop pass belongs in the build, not after it.** The chain gained
`ai-design-slop` (loaded while writing UI) and `slop-audit` (run afterwards, by
someone who did not write it) in PR #100, after this page was first written.
Reading the catalogue found a real tell the page had introduced —
`nested-cards`: the row is a bordered container and the snapshot control drew a
second bordered box inside it. The original card avoided it by accident, using
a divider rather than an outline for the row. Flattened to a hairline-separated
footer, which is both the catalogue's stated direction and §5 Flat by Default.
