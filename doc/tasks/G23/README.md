# G23 — shared sidebar nav groups

| | |
|---|---|
| **Plan** | [2026-08-23-shared-nav-groups.md](../../plans/2026-08-23-shared-nav-groups.md) |
| **Kind** | **foundational** — no new surface; fixes a silent defect in existing navigation |
| **Spec** | n/a (internal) |
| **Depends on** | — |
| **Blocks** | nothing |
| **Status** | ✅ done 2026-08-23 |
| **Open questions** | none |

## Why this phase exists

`KnownGaps.md`'s `G-23` names the defect: `packages/ui/src/components/layout/app-shell.tsx`
and `apps/web/src/components/layout/app-shell.tsx` each hardcoded their own
`NAV_GROUPS` literal. Registering a new destination in one and not the other
produces **no sidebar entry at all in the real (Next.js) app** — silently,
with a green typecheck, a passing test suite, and a route manifest that
lists the page. That is the class of defect this repo's own workflow is
designed to catch late (a browser pass), not early — this phase closes the
structural cause instead.

## Shared facts every task in this phase relies on

**`nav-meta.ts` already existed and was already imported by both hosts.**
`packages/ui/src/lib/nav-meta.ts` exports `NAV_META` (path segment →
`{label, icon}`) and `sectionMeta()`, used by both shells' `Breadcrumbs` and
`TabStrip`. What it did not carry was sidebar **membership, order, and
grouping** — that's the part that was duplicated.

**A path can be in `NAV_META` without a sidebar row.** `"setup"` is the
existing example — reachable only from the dashboard card and its own
breadcrumb, deliberately absent from any nav list (T-M10-03 phase decision).
`NAV_GROUPS` preserves this: it is a curated list of paths, not derived by
iterating `NAV_META`'s keys.

**`apps/web` already bridges `@tanstack/react-router`.**
`apps/web/src/lib/react-router-mock.tsx` is aliased over the real package so
shared `packages/ui` components using `Link`/`useNavigate`/`useRouterState`
work unmodified in the Next.js host — `command-palette.tsx` already relies on
this. This phase does not need to touch either shell's routing calls
(`Link href=` in Next stays Next's own `next/link`; the shared piece is only
the *data*, not the render).

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-G23-01 — extract `NAV_GROUPS` into `nav-meta.ts`](T-G23-01-shared-nav-groups.md) | `[S]` | foundational | — | ✅ done 2026-08-23 |

## Objective

One `NAV_GROUPS` array, in `nav-meta.ts`, that both `app-shell.tsx` files
render from. Label and icon come from the existing `sectionMeta()`, so
adding a destination to the sidebar is a one-line, one-file change that
shows up in both hosts by construction.

## Definition of done

- `packages/ui/src/lib/nav-meta.ts` exports `NAV_GROUPS`.
- Neither `app-shell.tsx` defines its own `{to, label, icon}` list.
- `pnpm --filter @sparstrow/ui --filter web typecheck` and `test` green.

**Not in this phase:** merging the two `AppShell` components into one (still
open — `G-23`'s wider half, blocked on the live-event-transport difference,
not attempted here). Folding `command-palette.tsx`'s separate `PAGES` list
into `NAV_GROUPS` (noted as future work, not the defect this phase closes).

---

## Decisions already made

Inherited from the plan — see its Decisions section. Nothing decided inside
this phase beyond what the plan already settled.

## Files

| Path | Change |
|---|---|
| `packages/ui/src/lib/nav-meta.ts` | new `NavGroup` type + `NAV_GROUPS` export |
| `packages/ui/src/components/layout/app-shell.tsx` | render from shared `NAV_GROUPS`/`sectionMeta`, drop local literal + unused icon imports |
| `apps/web/src/components/layout/app-shell.tsx` | same |

## Traps

**A stale local `NavItem` interface or icon import left behind reads as
harmless but breaks the point of the fix.** If a future edit reintroduces a
per-shell `{to, label, icon}` list "just for one extra item," the whole
defect is back — the fix only holds if both files exclusively `.map()` over
the shared array.

## Verification

Full procedure in [`T-G23-01`](T-G23-01-shared-nav-groups.md).
