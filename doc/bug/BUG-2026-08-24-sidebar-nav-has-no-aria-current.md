# BUG-2026-08-24-sidebar-nav-has-no-aria-current

**Status:** 🟢 resolved 2026-08-24
**Reported by:** agent — found during `T-VR-04`'s browser verification, by
querying the DOM rather than reading the diff
**Reported:** 2026-08-24

## Symptom

No link in the primary sidebar navigation carries `aria-current="page"`, on any
route. A screen-reader user gets no indication of which of the 17 destinations
they are currently on. Sighted users are fine — the active item is styled.

Measured on `/agents`, signed in, localhost:

```js
[...document.querySelectorAll('nav a')].filter(a => a.getAttribute('aria-current'))
// => []   (17 links total)

[...document.querySelectorAll('nav a')]
  .filter(a => a.className.includes('bg-sidebar-accent')
            && !a.className.includes('hover:bg-sidebar-accent'))
  .map(a => a.getAttribute('href'))
// => ["/agents"]   — correct, and purely visual
```

## Investigation

[`apps/web/src/components/layout/app-shell.tsx`](../../apps/web/src/components/layout/app-shell.tsx)
computes `isActive` and spends it entirely on `className`:

```tsx
const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
return <Link key={to} href={to} title={meta.label} className={cn(..., isActive ? "bg-sidebar-accent …" : "…")}>
```

The state is known and correct — it is simply never expressed to assistive
technology.

**Not caused by the Vite retirement.** `app-shell.tsx` has used `next/link`
directly since before this phase; `T-VR-03` only repointed its imports and
`T-VR-04` did not touch it. The `packages/ui` shell that *did* go through the
router adapter got `aria-current` for free, because the adapter set it — so
this was per-host, and deleting that shell made it universal.

**Breadcrumbs are correct and are not part of this.** Verified in the same
pass: exactly one `aria-current="page"`, on the last crumb, rendered as a
`<span>` rather than a link.

## Impact

`DESIGN.md` §9 makes ARIA and keyboard correctness mandatory "from the first
commit" for the navigation model specifically. This is the single most
load-bearing landmark in the app — the thing that answers "where am I" — and it
is the one that is silent.

Narrow in blast radius: nothing is broken for sighted mouse or keyboard users,
and no data is at risk. It is a correctness gap against a stated standard, not
a failure.

## Fix

One attribute, on the `Link` in `app-shell.tsx`:

```tsx
aria-current={isActive ? "page" : undefined}
```

Deliberately **not** applied inside `T-VR-04`. That task was a mechanical
un-shimming with a "nothing changes behaviour" bar, and this is a behaviour
change to a file that task did not otherwise touch — folding it in would have
put an unrelated fix inside a diff whose whole value is being boring. It is
small enough to take on its own at any time.

**When fixing, re-verify in a browser, not by reading the diff.** The reason
this survived is that it is invisible in source review: the `isActive` variable
is right there and looks used.

## Resolution — 2026-08-24

One attribute on the sidebar `Link` in `app-shell.tsx`:

```tsx
aria-current={isActive ? "page" : undefined}
```

**Verified in a browser, on two routes:**

| Route | `aria-current` in nav | Visual active |
|---|---|---|
| `/machines` | `["/machines"]` | `["/machines"]` |
| `/` | `["/"]` | `["/"]` |

Exactly one of 17 links in each case, matching the styled item, and the
`to === "/"` guard still holds — Dashboard is not current on `/machines`.

The root page carries **two** `aria-current="page"` markers in total: the
sidebar link and the breadcrumb's trailing `<span>`. That is correct rather
than a duplicate — they are separate navigation landmarks, and each marks the
current page within its own.
