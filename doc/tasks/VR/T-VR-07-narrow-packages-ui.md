# T-VR-07 — finish narrowing `packages/ui` to a design system

| | |
|---|---|
| **Tag** | `[S]` — moves files `apps/web` imports; conflicts with anything else touching either package |
| **Serves** | foundational — delivers the half of `D-24`'s "narrow `packages/ui` to a design system" that T-VR-03 did not |
| **Depends on** | T-VR-04 — un-shimming may change which files count as app code |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-24 |

## Why this exists

T-VR-03 moved the ten components that imported the router, and the plan said
what was left would be the design system. **It is not.** Measured after
T-VR-03 landed, `packages/ui/src` still holds, beyond the 27 `components/ui/*`
primitives:

- **App composites**: `agent-form`, `profile-form`, `workspace-form`,
  `setup-card`, `skill-viewer`, `run-transcript`, `run-status-badge`,
  `blocked-project-actions`, `new-agent-button`, `directory-picker-dialog`,
  `update-banner`, `actor-avatar`, `image-upload-field`
- **Whole feature directories**: `board/`, `canvas/`, `goals/`, `pipelines/`,
  `team/`
- **`api/hooks.ts`** — the React Query layer, which is application data access,
  not design
- **`lib/`** — a mix: `utils.ts` (`cn()`) is design system; `live-events.ts`,
  `workspace-tabs.ts`, `setup.ts`, `chat-turn-state.ts` are not
- **`content/knowledge/`** — the Knowledge Center's markdown, which is product
  content and reaches `apps/web` through `knowledge.server.ts`

They stayed because none of them imports the router, so none was in scope for a
task defined by that. The narrowing was never a router problem.

## The decision this needs, which the earlier tasks did not

**What is the design system?** T-VR-01 through T-VR-04 never had to answer
that — they moved files by a mechanical test (does it import the router). This
task cannot: `run-status-badge` is arguably a design-system token made visual,
`actor-avatar` arguably likewise, and `board/` arguably not. Splitting them
requires a rule, and the rule belongs with the doctrine.

Proposed test, to be confirmed before moving anything: **a design-system file
knows nothing about Sparstrowgen's domain.** A `Badge` is design system; a
`RunStatusBadge` that maps `run.status` to a colour is not, because it encodes
what a run is. By that test `cn()` stays and `api/hooks.ts` goes.

`content/knowledge/` is a third category — neither design nor app code, but
product content. It may deserve its own home rather than either package.

## Checklist

- [x] Confirm or replace the domain-knowledge test above; record it in
      `design-system/DECISIONS.md`, per `AGENTS.md` §3.13 — this is a design
      decision with a reason, not a file-shuffling preference
- [x] Classify every remaining file in `packages/ui/src` against it, and write
      the classification down before moving anything
- [x] Move the app code to `apps/web`, in batches small enough to review
- [x] Decide where `content/knowledge/` belongs and move it deliberately
- [x] Re-derive and fix both packages' dependency lists afterwards
- [x] `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` all green

## Traps

**`@fontsource-variable/inter` was an unimported dependency of `packages/ui`
and had to stay that way *until the bug was fixed*.** It was left alone
earlier in this session while
[`BUG-2026-08-24-hosted-app-never-loads-its-typeface`](../../bug/BUG-2026-08-24-hosted-app-never-loads-its-typeface.md)
was still open, since deleting it would have erased the trail to the fix. That
bug is now resolved — `apps/web/src/app/layout.tsx` genuinely imports it — so
this task's dependency re-derivation correctly finds it unused in
`packages/ui` and removes it from there. The trap was real at the time it was
written and stopped applying the moment the bug closed; recorded here so
nobody re-adds it "to be safe."

**This is where the move stops being mechanical.** Every prior task in this
phase could be checked by "does it still compile and render the same". This one
can too, but compiling proves nothing about whether the split is *right* — a
wrong classification compiles perfectly and leaves the same mess under new
paths.

## Result

**Done 2026-08-24.** 114 files touched — 66 moves, 2 deletions, 46 edits.
`packages/ui/src` now holds exactly what [`DD-015`](../../../design-system/DECISIONS.md)
defines as the design system: `components/ui/*` (27 shadcn primitives),
`page-container`, `form-field`, `actor-avatar`, `cn()`, `format.ts`,
`globals.css`, `theme/*`. Nothing else.

### The rule, and what it actually decided

Confirmed the proposed test from the task header — *a design-system file
knows nothing about Sparstrowgen's domain* — and recorded it as `DD-015`
rather than inventing a second version while executing. One case the test
had to actually resolve rather than restate: `actor-avatar.tsx` takes a bare
`name: string` and implements `DESIGN.md` §2.5's identity-hue algorithm
directly — the doctrine's own colour derivation, not app logic reusing design
tokens. Ruled **in**, on that basis, over `run-status-badge.tsx`, which looks
similar (a coloured badge keyed off a prop) but fails the test because the
prop it keys off — `run.status` — encodes what a run *is*.

### What moved, and where

- **~30 app-code files** (forms, `board/`, `canvas/`, `goals/`, `pipelines/`,
  `team/`, `api/hooks.ts`, and the domain half of `lib/`) into
  `apps/web/src/{components,api,lib}/`, mirroring their previous
  subdirectory structure.
- **`content/knowledge/`** (22 articles) into `apps/web/src/content/knowledge/`,
  alongside the `knowledge.server.ts` that already reads it — the "third
  category, neither design nor app code" the task predicted.
- **Two files deleted outright, not moved:** `vite-env.d.ts` (dead Vite
  type-reference boilerplate) and `lib/knowledge.ts` (see the bug below).
- **`lib/api.ts` renamed to `lib/api-client.ts`** landing in `apps/web` — a
  bare `api.ts` next to the existing `apps/web/src/lib/api/` directory
  (the server-side route handlers) would have been resolvable but genuinely
  confusing; disambiguated rather than left to be found the hard way.

Import rewriting was mechanical and scripted: every `@/<moved-path>` or
`@sparstrow/ui/<moved-path>` across `apps/web/src` became `@web/<moved-path>`
— 45 files, 94 substitutions in the first pass, with the files' own internal
cross-references (agent-form.tsx → lib/account, etc.) needing the same
treatment separately since `@/` from a file **now living in `apps/web`**
still resolves to `packages/ui/src` (the alias is repo-wide, not
file-relative) and would have silently pointed at the wrong package
otherwise. Imports to what stayed behind (`@/components/ui/*`, `@/lib/utils`,
`@/lib/format`, `@/components/actor-avatar`, `@/components/form-field`) were
correctly left as `@/` — that alias reaching into `packages/ui` from a file
in `apps/web` is exactly how every previously-moved page already works.

### Found while classifying, not by design review

**A second Vite-only silent failure, filed and fixed in the same change.**
`lib/knowledge.ts` built its article registry with Vite's `import.meta.glob`
— syntax Turbopack does not implement and, critically, does not error on
either. `KNOWLEDGE_ARTICLES` had been empty since `T-VR-01` deleted the Vite
host, so `getArticle(slug)` had returned `undefined` on every call, silently,
because both call sites (`breadcrumbs.tsx`, `tab-strip.tsx`) already guarded
with `?? fallback`. Confirmed live before touching anything: a Knowledge
Center breadcrumb read the raw slug `what-is-sparstrowgen` instead of "What
is Sparstrowgen?" Filed as
[`BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank`](../../bug/BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank.md),
same shape as the typeface bug — Vite-only behaviour degrading silently
rather than erroring, invisible to typecheck, tests, and build alike.

Fixed by deleting the broken file rather than repairing it —
`knowledge.server.ts` already reads the same content correctly via
`node:fs` — and threading a small `{slug, title}[]` index from
`layout.tsx` (Server Component) down through `AppShell` to the two client
consumers, since they cannot import a server-only `fs`-reading module
directly. Verified live: the breadcrumb and tab label both read "What is
Sparstrowgen?" after the fix, on the exact route the bug was confirmed on.

**A stale two-host premise in three files, recorded but not touched.**
`account.tsx`, `image-upload.tsx` and `directory-picker.ts` each carry a
branch built when two UI hosts genuinely disagreed about what existed — the
web app authenticated, the local desktop build had no account to speak of.
`D-24` retired that second host; the branch's premise is gone. Not removed
here — that is behavioural surgery a file-organization task should not also
be doing — recorded in full in `DD-015` and surfaced as
[`I-12`](../../Ideas.md) so it does not require finding `DD-015` by accident.

### Dependencies, re-derived rather than assumed

Removed from `packages/ui` (re-checked by grep against actual imports, not
carried over from memory): `@dnd-kit/*` (all three), `@xyflow/react`,
`zustand`, `@sparstrow/shared`, `@tanstack/react-query`, `react-dom`,
`@types/react-dom`, `vite` (the last devDependency remnant of the Vite host —
nothing in `packages/ui` had referenced it since `T-VR-01`), and
`@fontsource-variable/inter` (see the Traps correction above). `@dnd-kit`,
`@xyflow/react` and `zustand` added to `apps/web`, which now genuinely needs
them; `@radix-ui/react-dialog` correctly kept in **both** —
`components/ui/dialog.tsx` still uses it as a primitive, `skill-viewer.tsx`
uses it directly in `apps/web`.

`packages/ui#test` moved from 6 passing test files to **zero** — every test
moved to `apps/web` along with the code it tested. `passWithNoTests: true`
added to `packages/ui/vitest.config.ts`, since vitest's default (fail when no
test files exist) would otherwise have turned "this package's tests all
moved" into a permanently red `pnpm test`. Not a workaround: zero tests is
the actually-correct state for a package of presentational primitives with no
tests of their own, and the gate should say so rather than fail on a
technicality.

### Verified live, signed in, on the same infrastructure T-VR-05/06 used

Disposable-account procedure per the runbook, cleaned up after (2 accounts,
2 workspaces removed — one from this pass, one left over from an earlier
interrupted session, both confirmed gone with no orphans).

- All 19 non-parameterised routes and 6 parameterised routes (`/runs/[id]`,
  `/teams/[id]`, etc., with synthetic ids): **200, no error markers**
- Knowledge Center breadcrumb and tab label: **fixed, confirmed on the exact
  route the bug was found on**
- `pnpm typecheck` — green, 7/7
- `pnpm test` — green, **1,385 passing across 5 packages** (unchanged total;
  tests moved, none were lost or duplicated — `web` went from 19/299 to
  25/360, `ui` went from 6/61 to 0/0)
- `pnpm --filter web build` — compiled successfully, all 22 routes in the
  manifest, one full clean rebuild (`.next` cleared) to rule out the same
  stale-cache trap `T-VR-05` hit

### What this does NOT close

- **`I-12`** (the stale two-host branch) is recorded, not fixed — a
  deliberate scope boundary, not an oversight.
- **`D-19`** (renaming `@sparstrow/daemon` back to `@sparstrow/core`) is
  untouched and unrelated — this task narrowed a frontend package, not the
  daemon split.
- **This was the last content-shape task in the phase.** `T-VR-06`
  (verification) is what remains, and it now grades a `packages/ui` that
  finally matches what `D-24` described from the start.
