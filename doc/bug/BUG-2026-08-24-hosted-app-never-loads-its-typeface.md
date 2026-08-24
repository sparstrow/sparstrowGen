# BUG-2026-08-24-hosted-app-never-loads-its-typeface

**Status:** 🟢 resolved 2026-08-24
**Reported by:** agent — surfaced while pruning dependencies in `T-VR-03`,
unrelated to that task's change
**Reported:** 2026-08-24

## Symptom

`apps/web` — the hosted app, and after `D-24` the only app — renders in the
browser's generic sans-serif fallback rather than the typeface `DESIGN.md`
mandates. Every screen is affected; nothing is broken enough to notice as a
failure, which is why it has survived.

## The three-way mismatch

| Layer | Says |
|---|---|
| [`DESIGN.md` §3](../../DESIGN.md) | **Font: Inter Variable (`@fontsource-variable/inter`)** |
| [`globals.css:410`](../../packages/ui/src/styles/globals.css:410) | `--font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif` |
| [`apps/web/src/app/layout.tsx`](../../apps/web/src/app/layout.tsx) | Loads **Geist** and **Geist Mono** via `next/font/google`, exposing `--font-geist-sans` / `--font-geist-mono` |

So the design tokens name Inter, the app loads Geist, and the two never meet:
nothing in `apps/web` references `--font-geist-sans`, and nothing in `apps/web`
imports `@fontsource-variable/inter`. `--font-sans` resolves to a family the
browser does not have, falls through to `ui-sans-serif`, and the app renders in
the system UI face.

Geist is loaded on every request and then used by nothing — a downloaded font
nobody sees.

## Reproduction

1. Open any page of the deployed app.
2. Inspect `body` and read the computed `font-family`.
3. It resolves past `"Inter Variable"` to `ui-sans-serif` / `system-ui`.

Or: search `apps/web` for `fontsource` — no hit. Search it for
`--font-geist-sans` outside `layout.tsx` — no hit.

## Investigation

Not caused by the Vite retirement, though that is what exposed it. Inter was
imported by `packages/ui/src/main.tsx`, the **Vite** entry — so the typeface
was correct in the Vite app and has never been correct in `apps/web`, which
never ran that entry. `T-VR-01` deleted `main.tsx`, which removed the last
place the dependency was used and made the mismatch total rather than
per-host.

The `next/font/google` Geist setup is scaffolding from
`create-next-app`, still present from the Next migration in `67bd615`, and was
never reconciled with the design system that arrived later.

`@fontsource-variable/inter` is therefore now an unimported dependency of
`packages/ui`. **It was deliberately left in place** during `T-VR-03`'s
dependency prune rather than removed as dead: it is the package `DESIGN.md`
names, and deleting it would erase the trail to this fix.

## Impact

Every screen renders in the wrong typeface. `DESIGN.md` §3's type scale — sizes,
weights, line heights, all tuned for Inter and deliberately denser than
shadcn's defaults — is applied to a face with different metrics, so the intended
density and rhythm are approximated rather than achieved. A design audit run
against the deployed app would grade a system nobody is actually seeing.

Also a small, permanent waste: two Google font families fetched per cold load
and never rendered.

## Fix

Not attempted here — `T-VR-03` is a file move, and typography needs a browser
to verify rather than a typecheck. Two candidate directions, to be decided
deliberately rather than by whoever touches `layout.tsx` next:

1. **Load Inter and drop Geist** — matches `DESIGN.md` as written. Either
   `next/font/google`'s `Inter` wired to `--font-sans`, or importing
   `@fontsource-variable/inter` in the app.
2. **Adopt Geist and update `DESIGN.md` §3** — a real option, but a doctrine
   change, and per `AGENTS.md` §3.13 the reason belongs in
   `design-system/DECISIONS.md`, not just the code.

Whichever is chosen, the mismatch must end with `--font-sans` naming a family
that is actually loaded, verified by reading the computed style in a browser —
not by reading the CSS.

## Resolution — 2026-08-24

**Option 1, and it needed no doctrine change.** `apps/web/src/app/layout.tsx`
now imports `@fontsource-variable/inter` — the exact package `DESIGN.md` §3
names — and the Geist / Geist Mono `next/font/google` loaders are gone, along
with the `--font-geist-*` variables on `<html>` that nothing referenced.
`@fontsource-variable/inter` moved from being an unimported dependency of
`packages/ui` to a declared, used dependency of `apps/web`.

`next/font/google`'s `Inter` was the alternative and was **not** taken. It is
arguably the better delivery mechanism in Next — build-time self-hosting,
preload hints, no layout shift — but it would have made the code disagree with
the doctrine's stated parenthetical for a benefit nobody had asked for. If it
is ever wanted, it is a `DESIGN.md` §3 edit plus a `design-system/DECISIONS.md`
entry, not a quiet swap.

**Verified in a browser, since that is the only place this is visible:**

```js
getComputedStyle(document.body).fontFamily
// => "Inter Variable", ui-sans-serif, system-ui, sans-serif
[...document.fonts].filter(f => f.family === "Inter Variable").length
// => 7   (was 0)
```

The two `__nextjs-Geist*` families still listed in `document.fonts` on a dev
server belong to Next's own error overlay, not to application code — they do
not appear in a production build.
