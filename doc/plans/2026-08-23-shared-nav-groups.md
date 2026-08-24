# Shared sidebar nav groups — 2026-08-23

| | |
|---|---|
| **Spec** | n/a (internal) — fixes a silent defect in existing navigation; no new owner-visible behavior to describe as a story |
| **Status** | ✅ Completed 2026-08-23 |
| **Trigger** | Priority sweep of `doc/KnownGaps.md` for gaps that directly affect the app functioning, at the owner's request. `G-23` was the clearest case: registering a destination in the shared nav metadata produces no sidebar entry in the real (Next.js) app, with a green typecheck and passing tests. |
| **Depends on** | — |
| **Touches** | `packages/ui/src/lib/nav-meta.ts`, `packages/ui/src/components/layout/app-shell.tsx`, `apps/web/src/components/layout/app-shell.tsx` |
| **Tasks** | [`doc/tasks/G23/`](../tasks/G23/) |
| **Open questions** | none |

## Summary

`packages/ui/src/components/layout/app-shell.tsx` (the Vite/Electron shell)
and `apps/web/src/components/layout/app-shell.tsx` (what the hosted app
actually renders) each hardcoded their own `NAV_GROUPS` literal — same
headings, same items, same order, entered by hand twice. `nav-meta.ts`
already existed as the declared "one source of truth for section label +
icon," but the thing that actually decides **which paths appear in the
sidebar, in what order, under what heading** was not part of it. This plan
moves that grouping into `nav-meta.ts` alongside the label/icon lookup it
already owns, and both shells now render from it instead of their own copy.

## What the spec asks for that isn't obvious

N/A — no spec. The technical surprise, found while reading the code rather
than assumed going in: `apps/web` already carries a `@tanstack/react-router`
→ Next.js adapter (`apps/web/src/lib/react-router-mock.tsx`, aliased over the
real package) specifically so shared `packages/ui` components can use
`Link`/`useNavigate`/`useRouterState` unmodified in both hosts —
`command-palette.tsx` already does exactly this. `G-23`'s text framed a full
shell merge as blocked partly on "differ in routing primitive," which is
weaker than it reads: the primitive is already bridged for everything except
`Outlet` (Next's shell takes `children`, not a route outlet). This plan does
not attempt the full merge — see Scope boundaries — but the adapter is why
the *nav data* extraction was safe to do with zero routing-layer changes.

## Work breakdown

Single-shot, internal, no user stories.

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| Extract `NAV_GROUPS` into `nav-meta.ts`; both shells render from it | Fixes a defect in existing navigation wiring, not a feature the owner opens |

## Decisions

**Extract the grouping/order, not the label/icon — those already lived in
`NAV_META`.** `sectionMeta()` already existed and already correctly derives
`{label, icon}` from a path. The only genuinely duplicated data was *which*
paths are in the sidebar and how they're grouped. `NAV_GROUPS` is now
`{ heading: string | null; items: string[] }[]` — a list of paths — and both
shells call `sectionMeta(path)` for the label/icon instead of carrying their
own `{to, label, icon}` triples.

**Did not merge the two `AppShell` components.** `G-23` names three real
differences: routing primitive (bridged, see above), live-event transport
(`useLiveEvents()`/Realtime vs `wsHub`), and the footer text. The transport
difference is load-bearing product behavior (M5's own comment: "a chip
claiming live while the channel is dead is worse than a conservative
offline reading") and merging it safely is a bigger, separate piece of work
with its own risk profile — not a drive-by alongside a data-dedup fix.
`G-23` stays open for that larger merge; this plan closes only the specific,
provably-silent failure mode the gap led with.

**`sectionMeta` picks up `NAV_GROUPS`'s import, not the reverse.** Both live
in `nav-meta.ts` now; `sectionMeta` was already there and unchanged.

## Scope boundaries

Does not merge the two `AppShell` components into one. Does not touch
`command-palette.tsx`'s separate `PAGES` list (a different, already-flat
list used for the command palette's "Pages" group, not the sidebar — a
future pass could fold it into `NAV_GROUPS` too, but that wasn't the defect
this plan closes and is left as future work under the same `G-23` entry).

`G-23` in `KnownGaps.md` is narrowed, not deleted — the full-merge half of
the gap is still real.

## Verification

| Criterion | How it gets checked |
|---|---|
| Both shells render the identical sidebar (headings, order, items, labels, icons) from one source | Read `nav-meta.ts`'s `NAV_GROUPS` + both `app-shell.tsx` files — neither defines its own `{to, label, icon}` list any more |
| No regression | `pnpm --filter @sparstrow/ui --filter web typecheck` and `pnpm --filter @sparstrow/ui --filter web test` both green |
| A new destination added to `NAV_GROUPS` now appears in both hosts by construction | Structural — a single array both shells `.map()` over, not re-observed live (see Result) |

## Result

Shipped 2026-08-23. `NAV_GROUPS` (paths only) now lives in
`packages/ui/src/lib/nav-meta.ts`; both `app-shell.tsx` files import it and
`sectionMeta()` for label/icon, and no longer define their own nav-item
list. `pnpm --filter @sparstrow/ui --filter web typecheck` and `test` both
green (51 + 246 tests). Verified live in the Vite/Electron shell —
`pnpm --filter @sparstrow/ui dev`, sidebar read via the Playwright
accessibility tree, all four groups present in the correct order with
correct labels and `href`s. **Not** verified in `apps/web` — this
environment has no configured Supabase credentials (the same blocker
`G-22`/`G-16` already record). Recorded as a residual verification item
rather than silently assumed: see
[`T-G23-01`](../tasks/G23/T-G23-01-shared-nav-groups.md)'s Result and the
updated `G-23` entry in `KnownGaps.md`.
