# T-M8-02 — Promote the Machines card to a page

| | |
|---|---|
| **Tag** | `[S]` — moves a file `settings.tsx` imports; the create, the delete and the settings edit must land together or the build breaks between them |
| **Serves** | `US1` — pair, see status, rename, revoke, remove, all on one page |
| **Depends on** | T-M8-01 |
| **Blocks** | T-M8-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-20) |

## The scenarios this satisfies

> 2. **Given** I open Machines with none paired, **When** the page loads,
>    **Then** it explains what a machine is for and offers **Pair a machine** as
>    the primary action — the empty state teaches the surface.
> 3. **Given** I press **Pair a machine**, **When** the code appears, **Then** I
>    see the code, a live countdown, a copy button, and the exact steps to run
>    on the machine — naming places that actually exist, and honest about
>    needing a dev checkout today.
> 4. **Given** a machine finishes pairing, **When** I look at the page without
>    refreshing, **Then** it appears in the list.
> 7. **Given** a machine in the list, **When** I rename it, **Then** the new
>    name sticks.
> 8. **Given** a machine in the list, **When** I revoke or remove it, **Then** I
>    am told the difference before confirming.
> 9. **Given** a machine is unreachable, **When** I try a control that needs it,
>    **Then** the control refuses with the reason rather than queuing silently.
> 10. **Given** I go to Settings → Workspace → General, **When** I look for
>     machines, **Then** the old card is gone and nothing is orphaned.

## Objective

Move `packages/ui/src/components/runtimes-card.tsx`
to `packages/ui/src/routes/pages/machines.tsx` as a full page, adopt
`machineState()` for the row's label, make the pairing instructions honest, and
delete the card from Settings — all in one change, because `settings.tsx`
imports the file being moved.

This is a **relocation**. Scenarios 4, 7, 8 and 9 are already true today; the
task is graded on none of them regressing.

## Decisions already made

### The four inner components move unchanged in behaviour

`relativeTime`, `PairingCodePanel`, `RuntimeRow`, `SnapshotControl` and the
list container move together. Three carry comments explaining a specific
failure they prevent — **move the comments with the code**, they are the only
record of why the behaviour exists:

| Piece | The failure its comment records |
|---|---|
| `PairingCodePanel`'s countdown | a dead code read into a terminal on another machine |
| `RuntimesCard`'s auto-retire `useEffect` | a *redeemed* code that keeps counting down |
| `SnapshotControl`'s `reportedSettings`-only read | the exact defect `G-6` was opened about |

### The page loses its `Card` chrome and gains a page header

The `<Card>` / `<CardHeader>` / `<CardTitle>Machines</CardTitle>` wrapper
existed because it sat in a settings column. As a page it becomes an `<h1>` plus
the same description text. The rows, dialogs and panel are unchanged.

### The empty state is rebuilt for a page, not resized

Today it is a dashed panel sized for a column. On a page it is the first screen
a new owner sees and where the setup guide sends them, so it gets:

- what a machine is and why anything needs one;
- **Pair a machine** as the *primary* button (`variant="default"`), not the
  outline button it is today — this is the page's one action;
- the honest sentence about the dev checkout (below).

### The pairing instructions say what is actually required today

Phase decision 4 / plan decision 9 / FR-016. The panel keeps
`sparstrow pair {code}` and gains one sentence above it, in the panel and in
the empty state, to this effect:

> `sparstrow` is not published yet — the machine needs a checkout of this
> repository to run it. Packaged installers are coming.

Wording is the implementer's; the **claim** is fixed: it must not imply a
command the owner can obtain today. See [`D-10`](../../Deferred.md).

### The row's label comes from `machineState()`, and last-seen is mandatory

```tsx
const state = machineState(runtime.status, runtime.lastHeartbeat);
```

- `active` → the live dot, the word `active`
- `unreachable` → a muted dot, the word `unreachable`, **always** followed by
  `· last seen {relativeTime(runtime.lastHeartbeat)}` (FR-006 requires the
  last-seen time unconditionally — a bare "unreachable" is the assertion the
  spec's decision 1 rejected)
- `draining` → keep today's `shutting down` badge

`runtime.online` stays on the wire and is still what `SnapshotControl` disables
against — that is a dispatchability question, not a label.

### Settings loses the card and keeps everything else

Remove the import at [`settings.tsx:41`](../../../packages/ui/src/routes/pages/settings.tsx:41)
and the `<RuntimesCard />` usage at
[`settings.tsx:783`](../../../packages/ui/src/routes/pages/settings.tsx:783).
**`WipSnapshotCard` stays** — it is the local build's own snapshot setting, a
different thing that shares a word. No placeholder, no redirect (phase
decision 3).

## Checklist

- [x] `packages/ui/src/routes/pages/machines.tsx` created with the moved
      components, their comments intact, and a page header
- [x] Row label switched to `machineState()`; `unreachable` always carries a
      last-seen time
- [x] Empty state rebuilt: explains the surface, **Pair a machine** as the
      primary action, honest about the dev checkout
- [x] Loading state: skeleton rows shaped like real rows
- [x] Error state: the query's real message rendered **in place of the list**
      with a retry — not a toast, not a silent empty list
      (`runtimes.isError` is not currently handled at all; today a failed list
      renders as "No machines paired yet", which is a lie)
- [x] Pairing-code creation error still rendered (it is today; keep it)
- [x] `packages/ui/src/components/runtimes-card.tsx` deleted
- [x] `settings.tsx` import and usage removed; `WipSnapshotCard` untouched
- [x] `grep -rn "runtimes-card\|RuntimesCard" packages apps` returns nothing
- [x] `pnpm --filter @sparstrow/ui typecheck` and `pnpm typecheck` green
- [x] `pnpm test` green

## Traps

**The list currently has no error state.** `runtimes.isLoading` and
`machines.length === 0` are the only branches
(`runtimes-card.tsx:370-375`, as it stood before the move),
so a failed query falls through to the empty state and tells a new owner they
have no machines when the truth is the request failed. Moving the component
verbatim carries that bug onto the most important screen in the spec. Fix it in
the move.

**The auto-retire effect looks like dead code.** It compares
`machines.length` against a count captured when the code was issued. Skimming
it as redundant and dropping it produces a panel counting down over a code that
has already been redeemed — its comment says exactly this.

**`reportedSettings` is the only thing `SnapshotControl` may render.** Adding
optimistic state "so the switch feels responsive" reopens `G-6` in a new file.

**Do not delete `WipSnapshotCard`.** Two snapshot controls exist and only one
is leaving. `WipSnapshotCard` (settings.tsx:252) is the local machine's own
setting in its own SQLite; `SnapshotControl` (inside the card being moved) is
the per-runtime remote one. Deleting the wrong one removes a working feature
from the desktop build.

**The delete and the create must be one commit.** `settings.tsx` imports the
file. Splitting them leaves `development` unbuildable between two merges.

## Verification

- [x] `pnpm typecheck` and `pnpm test` green
- [x] `grep -rn "RuntimesCard" packages apps` → no matches
- [x] `grep -n "WipSnapshotCard" packages/ui/src/routes/pages/settings.tsx` →
      still present
- [x] Rendering, all four states, and scenarios 2, 3, 4, 7, 8, 9, 10 are proved
      in [T-M8-05](T-M8-05-verification.md). **They were reached this time** —
      `G-12`'s "the pane never composites" is worked around by driving the
      Playwright MCP against a local dev server; see that task's Result.

## On completion

- [x] Tick 10.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table

## Result

**Landed 2026-08-20** on `claude/machine-pairing-task-dde544`, together with
`T-M8-03` — the two were built as one change because the page and the
destination that reaches it are useless apart.

`runtimes-card.tsx` (430 lines) became
[`routes/pages/machines.tsx`](../../../packages/ui/src/routes/pages/machines.tsx).
All three comment-bearing behaviours moved intact and were then proved live,
not just read: the countdown ticks (observed at `9:57` and falling), the
auto-retire effect fired when a real machine redeemed a code (the panel
retired itself with no refresh), and `SnapshotControl` did **not** move when
clicked — it flipped only after the daemon reported `git.wipSnapshot: "off"`
back, roughly 12 seconds later. That last one is `G-6`'s invariant, and this
is the first time it has been watched rather than reasoned about.

**Three decisions the task doc did not anticipate**, all because `DESIGN.md`
was written (2026-08-18) after this task was decomposed (2026-08-16):

1. **`Monitor`, not `MonitorSmartphone`.** §6's semantic map fixes one icon per
   concept and names `Monitor` for a machine. The doctrine wins over the task
   doc by its own §1 rule. Same icon in all four nav surfaces.
2. **The row is an `item`, and the machine gets an entity tile.** §8 names
   `item` as the default reach for a list row and records that this package
   lacked it; §6 calls the tile-plus-status-dot "the single most important
   visual pattern in the app". Both were adopted, which added one new primitive
   — [`components/ui/item.tsx`](../../../packages/ui/src/components/ui/item.tsx),
   a new file nothing else imports, so zero regression surface.
3. **The error state is two-tiered, not one.** The task asked for the real
   message "in place of the list". That is right when there is nothing to show,
   and wrong when there is: a background refetch that fails would erase a list
   whose rename, revoke and remove all still work. With machines on screen the
   failure is reported above them instead.

**Found by rendering it, not by reading it** — three defects the checklist
could not have caught:

- **The destination has to be registered in *seven* places, not five.**
  `apps/web/src/components/layout/app-shell.tsx` keeps its **own** copy of
  `NAV_GROUPS` — the sidebar the hosted app actually renders — and
  `components/layout/breadcrumbs.tsx` kept a **second** copy of the
  section-label map. The first meant no sidebar entry in the browser at all;
  the second meant the breadcrumb read a lowercase `machines` while the tab
  strip beside it read `Machines`. Breadcrumbs now read `NAV_META`, so that
  duplicate is deleted rather than extended. Written up in
  [T-M8-03](T-M8-03-route-and-nav.md).
- **The honesty note rendered twice at once** — once in the pairing panel and
  again in the empty state below it — on the one screen the phase spec calls
  the most important. Now the empty state's copy is suppressed while a code is
  on screen.
- **At 375px the identity line truncated to `active · win3…`** — exactly the
  fields scenario 5 requires the row to show. `truncate` dropped, and the
  capability badges take their own line below `sm` instead of squeezing the
  name.

**Vocabulary alignment:** `SnapshotControl`'s offline copy said "This machine
is offline" while the row above it said "unreachable". It now says unreachable
too. It still *disables* on `runtime.online` — deliverability is a different
question from what to call the machine — and the comment now says so.

`pnpm typecheck` green across 7 packages; `pnpm test` 1044 passed / 4 skipped;
`pnpm --filter web build` lists `/machines`.
