# T-M8-03 — Route, sidebar, and nav metadata

| | |
|---|---|
| **Tag** | `[P]` — five nav/route files nothing else in this phase touches |
| **Serves** | `US1` — Machines reachable in one click from anywhere |
| **Depends on** | T-M8-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-20) |

## The scenarios this satisfies

> 1. **Given** I am signed in, **When** I look at the sidebar, **Then** there is
>    a Machines destination reachable in one click from anywhere.
> 11. **Given** I am on the Machines page, **When** I do any of the above,
>     **Then** I never had to open Settings.

## Objective

Register `/machines` as a destination in **both hosts and all three nav
surfaces**, so the page the previous task built is reachable, correctly
labelled in the breadcrumb and tab strip, and findable from Ctrl-K.

## Decisions already made

### Five files, and skipping any one fails quietly

> **It was seven.** Two more were found by opening the page rather than reading
> the tree — see *What decomposition missed*, below. The table as written was
> still correct; it was incomplete.

| File | What it does | Failure if skipped |
|---|---|---|
| `apps/web/src/app/machines/page.tsx` | **new** — five-line `"use client"` re-export, same as every other route | hosted app 404s |
| [`packages/ui/src/router.tsx`](../../../packages/ui/src/router.tsx) | register the route | local desktop build 404s |
| [`packages/ui/src/components/layout/app-shell.tsx`](../../../packages/ui/src/components/layout/app-shell.tsx) | `NAV_GROUPS` entry | no sidebar link — scenario 1 fails |
| [`packages/ui/src/lib/nav-meta.ts`](../../../packages/ui/src/lib/nav-meta.ts) | `NAV_META.machines` | breadcrumb and tab strip read a lowercase `machines` with a dashboard icon |
| [`packages/ui/src/components/layout/command-palette.tsx`](../../../packages/ui/src/components/layout/command-palette.tsx) | destination row | Ctrl-K cannot reach it |

`nav-meta.ts` calls itself "one source of truth for section label + icon" and is
the one that gets missed, because forgetting it produces a page that works —
`sectionMeta()` falls back to `{ label: section, icon: LayoutDashboard }`, so
the breadcrumb quietly reads `machines`.

### Placement and icon

**Workspace group, directly after Runs** (phase decision 3). A machine is where
a run happens; Configure is for things set up once.

Icon: **`MonitorSmartphone`** from `lucide-react` — already the card's
empty-state icon, so the page's own illustration and its nav glyph agree. Use
the same icon in all three nav files.

### The web route file is a re-export, not a page

Match the existing shape exactly
([`apps/web/src/app/imports/page.tsx`](../../../apps/web/src/app/imports/page.tsx)):

```tsx
"use client";

import { MachinesPage } from "@sparstrow/ui/routes/pages/machines";

export default function Page() {
  return <MachinesPage />;
}
```

## Checklist

- [x] `apps/web/src/app/machines/page.tsx` created, matching the shape above
- [x] `/machines` registered in `packages/ui/src/router.tsx` next to the other
      page routes
- [x] `NAV_GROUPS` in `app-shell.tsx`: `{ to: "/machines", label: "Machines",
      icon: Monitor }` in the **Workspace** group, after `/runs` — **and the
      same entry in `apps/web/src/components/layout/app-shell.tsx`**, which
      keeps its own copy
- [x] `NAV_META.machines = { label: "Machines", icon: Monitor }` in
      `nav-meta.ts`
- [x] `command-palette.tsx` destination row added, same label and icon
- [x] `breadcrumbs.tsx` reads `NAV_META` instead of its own duplicate label map
- [x] `pnpm typecheck` green; `pnpm --filter web build` lists `/machines` in
      the route manifest
- [x] Knowledge Center: any article that tells a user to find machines under
      Settings is corrected (AGENTS.md §3.2 — and re-read the four
      global-claim pages, since this changes where a user is sent)

## Traps

**Registered is not rendered.** `next build` listing the route is what decides
404-versus-not and nothing more — [`G-16`](../../KnownGaps.md) exists because
M7's five routes were registered and never looked at. This task may tick "the
manifest lists it"; it may not tick "the page works".

**`pathname.startsWith(item.to)` decides the active highlight**
([`app-shell.tsx:176`](../../../packages/ui/src/components/layout/app-shell.tsx:176)).
`/machines` has no sibling prefix today, so this is safe — but do not name a
future route `/machines-something` without revisiting it.

**Three nav files, one icon.** Importing a different glyph in each produces a
destination that looks like three different things depending on where you see
it.

## Verification

- [x] `pnpm typecheck` clean
- [x] `pnpm --filter web build` output includes `/machines`
- [x] The sidebar entry, breadcrumb label, tab-strip label and Ctrl-K entry are
      confirmed visually in [T-M8-05](T-M8-05-verification.md) — not here.
      **They were**, in a real browser, in both hosts.

## On completion

- [x] Tick 10.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table

## Result

**Landed 2026-08-20**, in the same commit as `T-M8-02`.

`/machines` is registered and reachable in one click from at least three
different routes (checked from `/`, `/runs` and `/settings`; clicking the
sidebar entry from Settings landed on `/machines`). Ctrl-K finds it. The
breadcrumb, the tab strip and the sidebar all say **Machines** with the same
`Monitor` glyph. The vite/desktop build resolves `/machines` too — it renders
the page and, with no core behind the dev proxy, its error state, which is a
second independent sighting of that branch.

### What decomposition missed: two more registration points

The task's five-file table was right and incomplete. Both extras fail exactly
the way the task warned about — quietly:

| File | What it does | How it failed |
|---|---|---|
| `apps/web/src/components/layout/app-shell.tsx` | the hosted app's **own** `NAV_GROUPS` | **No sidebar entry in the browser at all.** `packages/ui`'s shell is the vite/desktop one; the Next app duplicates it. Scenario 1 failed in the host that matters most, and nothing in the build or the type checker noticed. |
| `packages/ui/src/components/layout/breadcrumbs.tsx` | a **second** copy of the section-label map | The breadcrumb read a lowercase `machines` directly beside a tab strip reading `Machines`. |

The breadcrumb one is fixed by **deleting the duplicate**, not by adding a row
to it: `breadcrumbs.tsx` now reads `NAV_META`, the file that calls itself "one
source of truth for section label + icon". A second copy of a map is a
destination that renders correctly in one place and wrongly in another, which
is the failure mode this task's own table exists to prevent.

The two shells are a real duplication and a standing trap for the next
destination anyone adds. Recorded as [`G-23`](../../KnownGaps.md) rather than
fixed here — merging them is its own piece of work with its own regression
surface.

### Icon: `Monitor`, not `MonitorSmartphone`

This task specified `MonitorSmartphone` on 2026-08-16. `DESIGN.md` was written
on 2026-08-18 and its §6 semantic map assigns `Monitor` to a machine, with an
explicit rule that the doctrine wins any disagreement. `Monitor` it is, in all
four nav surfaces.
