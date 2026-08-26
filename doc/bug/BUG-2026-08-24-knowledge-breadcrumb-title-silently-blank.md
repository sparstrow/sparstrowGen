# BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank

**Status:** 🟢 resolved 2026-08-24 (fixed in the same change that found it, as
part of `T-VR-07`)
**Reported by:** agent — found while classifying `packages/ui` files for
`T-VR-07`, unrelated to that task's own purpose
**Reported:** 2026-08-24

## Symptom

On a Knowledge Center article page, the breadcrumb trail and the tab-strip
label show the raw URL slug (`what-is-sparstrowgen`) instead of the article's
real title (`What is Sparstrowgen?`). The article's own heading, and its
body, are correct — only these two secondary labels are wrong.

Confirmed live, signed in, on `/knowledge/what-is-sparstrowgen`:

```js
document.querySelector('main h1').textContent
// => "What is Sparstrowgen?"   (correct — a different code path)

[...document.querySelectorAll('[aria-label="breadcrumb"] *')].map(e => e.textContent)
// => [..., "what-is-sparstrowgen"]   (wrong — the raw slug)
```

## Investigation

`packages/ui/src/lib/knowledge.ts` — imported by
[`breadcrumbs.tsx`](../../apps/web/src/components/layout/breadcrumbs.tsx) and
[`tab-strip.tsx`](../../apps/web/src/components/layout/tab-strip.tsx) for
exactly this lookup — built its article registry with:

```ts
const files = import.meta.glob("../content/knowledge/*.md", { ... eager: true });
```

`import.meta.glob` is Vite-specific syntax. Turbopack does not implement it,
and — critically — does not error on it either; the expression evaluates to
`{}` at runtime. `KNOWLEDGE_ARTICLES` was therefore always empty, and
`getArticle(slug)` always returned `undefined`, silently, on every call.

Both call sites already guard with `?? fallback` (`?.title ?? rest[0]!` and
`?.title ?? meta.label`), which is exactly why this degraded to a wrong label
instead of a crash — and exactly why nothing caught it. `pnpm typecheck`,
`pnpm test` and `pnpm --filter web build` were all green throughout, because
none of them evaluate what a module-scope expression actually *returns* at
runtime, only whether it type-checks and compiles.

**Not caused by `T-VR-07`.** `import.meta.glob` only ever worked inside the
Vite host. `T-VR-01` (2026-08-24, earlier in this phase) deleted that host,
which is the exact moment this became permanently broken rather than merely
fragile. It went unnoticed through `T-VR-02`–`T-VR-06`'s verification passes
because none of them happened to check a Knowledge Center article's
breadcrumb specifically.

## Impact

Cosmetic and narrowly scoped — two secondary navigation labels on Knowledge
Center article pages only, nowhere else in the app. No data loss, no crash,
no incorrect content. Worth fixing precisely because it is the same failure
shape as
[`BUG-2026-08-24-hosted-app-never-loads-its-typeface`](BUG-2026-08-24-hosted-app-never-loads-its-typeface.md):
Vite-only behaviour that silently degrades rather than erroring, so typecheck
and build both stay green while the running app is quietly wrong.

## Resolution

`packages/ui/src/lib/knowledge.ts` deleted outright rather than repaired —
`apps/web/src/lib/knowledge.server.ts` already reads the same content
correctly via `node:fs`, and duplicate readers of the same content were
exactly what invited this drift. Since that reader is server-only and
`breadcrumbs.tsx`/`tab-strip.tsx` are client components, the fix threads a
small `{slug, title}[]` index down from `apps/web/src/app/layout.tsx` (a
Server Component, already reading account/theme state the same way) through
`AppShell` to both consumers, rather than adding a second content-reading
implementation or a new client-side fetch for what is small, static,
non-user data.

Verified in the browser: the breadcrumb and tab label both read "What is
Sparstrowgen?" after the fix, on the same route the bug was confirmed on.
