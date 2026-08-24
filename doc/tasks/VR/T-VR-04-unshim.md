# T-VR-04 — un-shim, and delete the shim

| | |
|---|---|
| **Tag** | `[S]` — the shim can only be deleted once the last importer is gone, so the rewrite and the deletion are one unit |
| **Serves** | foundational — removes the adapter D-24 calls the clearest marker of the transition |
| **Depends on** | T-VR-03 |
| **Blocks** | T-VR-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Rewrite all 27 router-using files off `@tanstack/react-router` onto Next's own
navigation, then delete `react-router-mock.tsx`, both build aliases, and
`packages/ui`'s TanStack dependency.

## What is actually in use

Counted across `packages/ui` before the move (T-VR-02/03 changed locations, not
call sites):

| Shim export | Files | Replacement |
|---|---|---|
| `Link` | 20 | An owned `NavLink` — see decision 1 |
| `useNavigate` | 11 | `useRouter()` from `next/navigation`, `router.push(...)` |
| `useParams` | 6 | `useParams` from `next/navigation` — already a pass-through, so this is an import change |
| `useRouterState` | 2 | `usePathname()` |
| `useRouter` | 1 | `useRouter()`, but `.history.push` → `.push` |
| `useSearch` | 1 | `useSearchParams()` |

## Decisions already made

### 1. `Link` becomes an owned `NavLink`, not raw `next/link`

The shim's `Link` does three things `next/link` does not: it substitutes
`$param` placeholders from a `params` object, serialises a `search` object into
a query string, and applies `activeProps.className` plus `aria-current="page"`
based on whether the current path matches.

That active-state behaviour is real and is used by the sidebar, breadcrumbs and
pinned items. Dropping to raw `next/link` means reimplementing it at 20 call
sites. So it moves into `apps/web/src/components/nav-link.tsx` as a component
the app owns.

**This is not the shim renamed.** The shim's purpose was to make Next answer to
TanStack's API so unmodified `packages/ui` code would run in two hosts. There
is one host now, so `NavLink` takes `href` — Next's own vocabulary — and drops
`params`/`search`/`from`/`strict` entirely. Call sites that used `params` build
their own href.

### 2. `aria-current="page"` is behaviour, not decoration

The shim sets it. Any replacement must too — `DESIGN.md` §9 makes ARIA
correctness mandatory from the first commit, and losing it during a mechanical
rewrite is exactly the kind of silent accessibility regression nobody notices.

### 3. The dependency goes in the same task

`packages/ui/package.json` still lists `@tanstack/react-router` as a real
dependency — that is how `packages/ui` typechecked against the real library
while `apps/web` aliased it. Leaving it after the last import is gone would
leave a package depending on a router it never calls.

## Checklist

- [ ] Write `apps/web/src/components/nav-link.tsx` — `href`, optional
      `activeClassName`, `exact`, `aria-current="page"` when active
- [ ] Unit-test `NavLink`'s active matching, including the prefix-vs-exact
      distinction and that `/` does not match everything
- [ ] Rewrite the 20 `Link` call sites; where `params`/`search` were used,
      build the href at the call site
- [ ] Rewrite the 11 `useNavigate` call sites to `router.push` / `router.replace`
- [ ] Repoint the 6 `useParams` imports to `next/navigation`
- [ ] Rewrite `breadcrumbs.tsx` and `tab-strip.tsx` off `useRouterState` to
      `usePathname`
- [ ] Rewrite `tab-strip.tsx`'s `useRouter().history.push` to `router.push`
- [ ] Rewrite `chat.tsx`'s `useSearch` to `useSearchParams`
- [ ] Delete `apps/web/src/lib/react-router-mock.tsx`
- [ ] Delete the `@tanstack/react-router` path from `apps/web/tsconfig.json`
- [ ] Delete the `resolveAlias` entry from `apps/web/next.config.ts` (and the
      whole `turbopack` block if it holds nothing else)
- [ ] Remove `@tanstack/react-router` from `packages/ui/package.json`
- [ ] Confirm no file in the repo imports `@tanstack/react-router`
- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green

## Traps

**`useSearchParams` needs a Suspense boundary.** The shim wrapped it in
try/catch specifically because it throws during static generation without one.
Removing the shim removes that guard — a page calling `useSearchParams`
directly must either be inside `<Suspense>` or opt out of static rendering.
`apps/web/src/app/login/page.tsx` already does the Suspense dance; copy that
shape rather than reinventing it.

**The shim's active matching has a deliberate `href !== "/"` guard.** Without
it, the dashboard link matches every route and the whole sidebar renders
active. Carry that into `NavLink` — it is the kind of one-character condition a
rewrite drops.

**`useNavigate` with no `to`.** The shim falls back to the current pathname,
because TanStack treats a missing `to` as "same route, new search params".
Check each of the 11 call sites for that pattern before assuming `to` is always
present.

**`forwardRef` and index signatures.** The shim carries a comment explaining
that a string index signature on `LinkProps` collapses under `Omit` and erases
`onClick`. Do not add one to `NavLink`.

## Result

<!-- Filled in when the task lands. -->
