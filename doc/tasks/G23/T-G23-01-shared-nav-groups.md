# T-G23-01 — extract `NAV_GROUPS` into `nav-meta.ts`

| | |
|---|---|
| **Tag** | `[S]` — touches the same three files start to finish, no benefit to splitting |
| **Serves** | foundational — closes the silent-failure half of `G-23` |
| **Depends on** | — |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-23 |

## Objective

Move the sidebar's grouping/order/membership data out of both `app-shell.tsx`
files and into `packages/ui/src/lib/nav-meta.ts`, so there is exactly one
list controlling what appears in the sidebar, in what order, under which
heading — read by both hosts instead of copy-pasted into each.

## Decisions already made

**Shape:** `NAV_GROUPS: { heading: string | null; items: string[] }[]` —
items are bare paths (`"/chat"`, not `{to, label, icon}`). Label and icon are
looked up per-item at render time via the existing `sectionMeta(path)`,
which already correctly derives them from `NAV_META`. This avoids a second
copy of every label/icon pair sitting next to the first.

```ts
export interface NavGroup {
  heading: string | null;
  items: string[];
}

export const NAV_GROUPS: NavGroup[] = [
  { heading: null, items: ["/"] },
  { heading: "Personal", items: ["/chat", "/messages", "/tasks", "/memory"] },
  {
    heading: "Workspace",
    items: ["/agents", "/teams", "/projects", "/runs", "/machines", "/pipelines", "/schedule", "/imports"],
  },
  { heading: "Configure", items: ["/skills", "/terminals", "/knowledge", "/settings"] },
];
```

## Checklist

- [x] Add `NavGroup` interface + `NAV_GROUPS` export to
      `packages/ui/src/lib/nav-meta.ts`, below the existing `sectionMeta()`
- [x] `packages/ui/src/components/layout/app-shell.tsx`: import
      `NAV_GROUPS, sectionMeta` from `@/lib/nav-meta`; delete the local
      `NavItem` interface and `NAV_GROUPS` literal; delete the now-unused
      icon imports (everything except `Menu`, `Search`, `X`); render
      `group.items.map((to) => { const meta = sectionMeta(to); ... })`
      instead of `group.items.map((item) => ...)`
- [x] `apps/web/src/components/layout/app-shell.tsx`: same change, importing
      from `@sparstrow/ui/lib/nav-meta`
- [x] `pnpm --filter @sparstrow/ui --filter web typecheck` green
- [x] `pnpm --filter @sparstrow/ui --filter web test` green

## Traps

**Unused icon imports fail typecheck/lint, not silently.** Every icon that
was only there to build the old literal (`Bot`, `Brain`, `CalendarClock`,
`FolderKanban`, `Inbox`, `ListChecks`, `MessagesSquare`, `Monitor`,
`PackagePlus`, `Play`, `Puzzle`, `TerminalSquare`, `Users`, `Workflow`,
`BookOpen`, `Settings`, `LayoutDashboard`) must be dropped from both files'
import lists — this is loud (build fails), not a real trap, but easy to
half-do by only clearing one file.

**`sectionMeta("/")` must still resolve to Dashboard.** It splits on `/`
and looks up the first segment against `NAV_META[""]`, which is exactly
the case `"/"` produces (empty segment). Confirmed by reading the function
rather than assumed — no behavior change needed here, just relied upon.

## Verification

- [x] `pnpm --filter @sparstrow/ui --filter web typecheck` — both clean
- [x] `pnpm --filter @sparstrow/ui --filter web test` — 51 + 246 tests
      passing (no test targets `app-shell.tsx` or `nav-meta.ts` directly;
      this is typecheck + the surrounding suite staying green, not a
      dedicated regression test)
- [x] Vite/Electron shell (`packages/ui`) rendered live via
      `pnpm --filter @sparstrow/ui dev` + the Playwright accessibility tree
      — all four groups, correct headings/order/labels/hrefs, matching
      `NAV_GROUPS` exactly
- [ ] `apps/web` rendered live — **not run**, no Supabase credentials in
      this environment (same blocker as `G-16`/`G-22`). Recorded as residue
      below rather than assumed.

## On completion

- [x] Tick 17.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row
- [x] Update the phase README's task table
- [x] `KnownGaps.md`: narrow `G-23` to record what this task closed and what
      of the gap remains (the full-shell-merge half)

## Result

Shipped 2026-08-23. `NAV_GROUPS` (list of paths, grouped and ordered) added
to `packages/ui/src/lib/nav-meta.ts`; both `app-shell.tsx` files now render
from it via `sectionMeta()` for label/icon, with no local nav-item list left
in either. `pnpm --filter @sparstrow/ui --filter web typecheck` clean;
`pnpm --filter @sparstrow/ui --filter web test` green — 51 tests in
`@sparstrow/ui`, 246 in `web`, none of which target these two files
specifically (no pre-existing test did before this change either).

**Verified live in one of the two hosts.** `pnpm --filter @sparstrow/ui dev`
booted the Vite/Electron shell and the sidebar was read via the Playwright
accessibility tree: Dashboard, then Personal (Chat/Inbox/Task Board/Memory),
Workspace (Agents/Teams/Projects/Runs/Machines/Pipelines/Schedule/Imports),
Configure (Skills/Terminals/Knowledge Center/Settings) — exact match to
`NAV_GROUPS`, correct `href`s throughout. **`apps/web` was not rendered** —
it needs Supabase credentials this environment doesn't have (the `G-22`
blocker). Since both shells consume the identical shared array through the
identical `sectionMeta()` call, the residual risk is narrow (a Next-specific
render quirk, not a data error), but it is unconfirmed: see the updated
`G-23` entry in `KnownGaps.md`.
