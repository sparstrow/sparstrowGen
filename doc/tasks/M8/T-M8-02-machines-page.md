# T-M8-02 — Promote the Machines card to a page

| | |
|---|---|
| **Tag** | `[S]` — moves a file `settings.tsx` imports; the create, the delete and the settings edit must land together or the build breaks between them |
| **Serves** | `US1` — pair, see status, rename, revoke, remove, all on one page |
| **Depends on** | T-M8-01 |
| **Blocks** | T-M8-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

Move [`runtimes-card.tsx`](../../../packages/ui/src/components/runtimes-card.tsx)
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

- [ ] `packages/ui/src/routes/pages/machines.tsx` created with the moved
      components, their comments intact, and a page header
- [ ] Row label switched to `machineState()`; `unreachable` always carries a
      last-seen time
- [ ] Empty state rebuilt: explains the surface, **Pair a machine** as the
      primary action, honest about the dev checkout
- [ ] Loading state: skeleton rows shaped like real rows
- [ ] Error state: the query's real message rendered **in place of the list**
      with a retry — not a toast, not a silent empty list
      (`runtimes.isError` is not currently handled at all; today a failed list
      renders as "No machines paired yet", which is a lie)
- [ ] Pairing-code creation error still rendered (it is today; keep it)
- [ ] `packages/ui/src/components/runtimes-card.tsx` deleted
- [ ] `settings.tsx` import and usage removed; `WipSnapshotCard` untouched
- [ ] `grep -rn "runtimes-card\|RuntimesCard" packages apps` returns nothing
- [ ] `pnpm --filter @sparstrow/ui typecheck` and `pnpm typecheck` green
- [ ] `pnpm test` green

## Traps

**The list currently has no error state.** `runtimes.isLoading` and
`machines.length === 0` are the only branches
([`runtimes-card.tsx:370-375`](../../../packages/ui/src/components/runtimes-card.tsx:370)),
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

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `grep -rn "RuntimesCard" packages apps` → no matches
- [ ] `grep -n "WipSnapshotCard" packages/ui/src/routes/pages/settings.tsx` →
      still present
- [ ] Rendering, all four states, and scenarios 2, 3, 4, 7, 8, 9, 10 are proved
      in [T-M8-05](T-M8-05-verification.md). Nothing here claims a rendered
      pixel — see [`G-12`](../../KnownGaps.md) on why that is stated rather
      than assumed.

## On completion

- [ ] Tick 10.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
