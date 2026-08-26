# T-VR-04 — un-shim, and delete the shim

| | |
|---|---|
| **Tag** | `[S]` — the shim can only be deleted once the last importer is gone, so the rewrite and the deletion are one unit |
| **Serves** | foundational — removes the adapter D-24 calls the clearest marker of the transition |
| **Depends on** | T-VR-03 |
| **Blocks** | T-VR-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-24 |

## Objective

Rewrite all 27 router-using files off `@tanstack/react-router` onto Next's own
navigation, then delete `react-router-mock.tsx`, both build aliases, and
`packages/ui`'s TanStack dependency.

## What is actually in use

Counted across `packages/ui` before the move (T-VR-02/03 changed locations, not
call sites):

| Shim export | Files | Replacement |
|---|---|---|
| `Link` | 20 | `next/link`, `to=` → `href=` — see decision 1 |
| `useNavigate` | 11 | `useRouter()` from `next/navigation`, `router.push(...)` |
| `useParams` | 6 | `useParams` from `next/navigation` — already a pass-through, so this is an import change |
| `useRouterState` | 2 | `usePathname()` |
| `useRouter` | 1 | `useRouter()`, but `.history.push` → `.push` |
| `useSearch` | 1 | `useSearchParams()` |

## Decisions already made

### 1. `Link` becomes raw `next/link`. No owned component. ~~NavLink~~

**Revised 2026-08-24, before writing any code.** This decision originally said
to build an owned `NavLink` carrying the active-state behaviour, on the
reasoning that "the sidebar, breadcrumbs and pinned items" depend on it and
dropping to `next/link` would mean reimplementing it 20 times.

**That premise was wrong.** Checked before building it:

- **The sidebar was never on the shim.** `apps/web/src/components/layout/app-shell.tsx`
  already imports `next/link` directly and computes `isActive` itself,
  including the `to === "/" ? pathname === "/" : pathname.startsWith(to)` guard.
- **No call site anywhere uses `activeProps`.** The only references are inside
  the shim's own definition.
- **One call site uses `activeOptions`** — `breadcrumbs.tsx:92`, with
  `{ exact: true }`, and only to stop a parent crumb also being marked
  `aria-current="page"`.

So the active-state feature has exactly one consumer, and that consumer wants
it *switched off*. Building a component for it would be an abstraction with no
users — `AGENTS.md` §9's over-engineering rule, arrived at by writing the
decision first and checking second.

Every `Link` is therefore one of two shapes, both handled inline:

| Shape | Becomes |
|---|---|
| `to="/machines"` | `href="/machines"` |
| `to="/runs/$runId" params={{ runId: x }}` | ``href={`/runs/${x}`}`` |

### 2. `aria-current="page"` stays correct, and gets simpler

The shim set it automatically on any prefix match, which is what forced
`breadcrumbs.tsx` to opt out with `exact: true`. `next/link` sets it never, and
that is the right default here: the only crumb that *is* the current page is
the last one, which renders as `BreadcrumbPage` rather than a link. So the
trail keeps exactly one current-page marker and the guard disappears with the
thing it was guarding against.

The sidebar is unaffected — `app-shell.tsx` sets `aria-current` itself and
always did. `DESIGN.md` §9 makes ARIA correctness mandatory, so this must be
confirmed in the browser (T-VR-06), not inferred from the diff.

### 3. The dependency goes in the same task

`packages/ui/package.json` still lists `@tanstack/react-router` as a real
dependency — that is how `packages/ui` typechecked against the real library
while `apps/web` aliased it. Leaving it after the last import is gone would
leave a package depending on a router it never calls.

## Checklist

- [x] Rewrite the 20 `Link` call sites to `next/link`; where `params` was used,
      build the href inline
- [x] Rewrite the 11 `useNavigate` call sites to `router.push` / `router.replace`
- [x] Repoint the 6 `useParams` imports to `next/navigation`
- [x] Rewrite `breadcrumbs.tsx` and `tab-strip.tsx` off `useRouterState` to
      `usePathname`
- [x] Rewrite `tab-strip.tsx`'s `useRouter().history.push` to `router.push`
- [x] Rewrite `chat.tsx`'s `useSearch` to `useSearchParams`
- [x] Delete `apps/web/src/lib/react-router-mock.tsx`
- [x] Delete the `@tanstack/react-router` path from `apps/web/tsconfig.json`
- [x] Delete the `resolveAlias` entry from `apps/web/next.config.ts` (and the
      whole `turbopack` block if it holds nothing else)
- [x] Confirm `@tanstack/react-router` is absent from `packages/ui/package.json`
      (removed in T-VR-03) and from `apps/web`
- [x] Confirm no file in the repo imports `@tanstack/react-router`
- [x] `pnpm typecheck` green
- [x] `pnpm test` green

## Traps

**`useSearchParams` needs a Suspense boundary.** The shim wrapped it in
try/catch specifically because it throws during static generation without one.
Removing the shim removes that guard — a page calling `useSearchParams`
directly must either be inside `<Suspense>` or opt out of static rendering.
`apps/web/src/app/login/page.tsx` already does the Suspense dance; copy that
shape rather than reinventing it.

**`useNavigate` with no `to`.** The shim falls back to the current pathname,
because TanStack treats a missing `to` as "same route, new search params".
Check each of the 11 call sites for that pattern before assuming `to` is always
present.

**`packages/ui`'s TanStack dependency is already gone** — T-VR-03 removed it
when the last router-importing file left that package. The checklist item below
covers only confirming it, not doing it.

## Result

**Done 2026-08-24.** No file in the repo imports `@tanstack/react-router`.
`react-router-mock.tsx` is deleted, and with it the `tsconfig.json` path and
the entire `turbopack` block in `next.config.ts` — that block existed only to
hold the one alias.

### What the shim was actually hiding

Decision 1 was rewritten before any code was written, because its premise was
false: the sidebar was never on the shim, no call site used `activeProps`, and
the one `activeOptions` user wanted the behaviour *off*. No `NavLink` was
built. That is recorded above rather than quietly skipped, because the wrong
version of the decision is the more instructive one.

Two real API differences surfaced only at typecheck, both papered over by the
shim's loose typing:

- **`useParams` takes no argument in Next**, and the shim accepted TanStack's
  `{ from }` / `{ strict }` route-scoping options and ignored them. Five call
  sites passed one.
- **Next returns `ParamValue`** (`string | string[] | undefined`), not
  `string`. The shim declared `Record<string, any>`, so every consumer had been
  typechecking against `any`. Fixed with `useParams<{ id: string }>()` rather
  than a cast — a cast would have preserved exactly the blind spot the shim
  had.

That second one is the substantive win here: 12 lines in `project-detail.tsx`
alone were passing an unchecked `any` into functions expecting `string`.

### Counts

`to=` → `href=` on 36 call sites (26 plain, 10 with `params` substitution
inlined as template literals), 17 `navigate({…})` calls rewritten to
`router.push`, 10 `useNavigate()` hooks renamed to `useRouter()`, and imports
rewritten in 22 files.

Three sites were done by hand rather than by pattern, because each was
genuinely different: `chat.tsx`'s search-param state, `command-palette.tsx`'s
`go(to, params)` helper (whose `PAGES` list still stores `$param`
placeholders as plain data — substitution moved into the helper rather than
rewriting 18 data rows), and `tab-strip.tsx`'s `router.history.*` → `router.*`.

### The `useSearchParams` trap did not fire

The task warned that removing the shim's try/catch would break static
generation without a Suspense boundary. It did not, because every route using
it is server-rendered on demand rather than prerendered. Worth knowing it is
latent rather than absent: converting one of those routes to static (T-VR-05's
territory) would surface it.

### Verification

- `pnpm typecheck` — **green, 7/7 packages**
- `pnpm test` — **green, 1,385 passing across 5 packages**
- `pnpm --filter web build` — **compiled successfully**, 5 filesystem-tracing
  warnings, unchanged in count for the third task running

**Not verified, and this is the task where it matters most.** Nothing was
rendered in a browser. This is the first task in the phase that changed
*behaviour* rather than locations: active-nav state, breadcrumb
`aria-current`, back/forward in the tab strip, and `?session=` round-tripping
in chat are all things that compile and test clean while being wrong. T-VR-06
must exercise each specifically, not just confirm pages load.
