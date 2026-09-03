# Retire the Vite app — 2026-08-24

| | |
|---|---|
| **Spec** | n/a (internal) — no user-visible change is intended; this moves files between packages and removes a second host. The one behaviour change it *does* cause is a capability loss, handled under Decisions below rather than by writing a spec for a deletion |
| **Status** | ✅ **Completed 2026-08-24** — P1–P7 all done |
| **Trigger** | Owner, 2026-08-24: "our priority right now is transitioning to the next.js app from the vite app and clearing that out. That's the priority, then we can work new feature or access" |
| **Depends on** | — |
| **Touches** | `packages/ui/` (all of it), `apps/web/src/app/`, `apps/web/src/lib/react-router-mock.tsx`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `packages/core/src/api/server.ts`, `packages/desktop/src/urls.ts` |
| **Tasks** | [`../tasks/VR/`](../tasks/VR/) — band 19; `T-VR-01` done, 02–05 written as their predecessor lands |
| **Open questions** | none — the one real decision (accepting the capability loss) is taken below, not deferred |

## Summary

Executes [`D-24`](../Deferred.md)'s page move and switch-off: 26 page
components and the 10 non-page components that depend on the router shim move
from `packages/ui` into `apps/web`, the shim and its two build aliases are
deleted, `packages/ui` narrows to a design system, and the Vite host, core's
static file serving and Electron's local-UI fallback are removed. Mechanical
throughout, with one deliberate exception ([`D-25`](../Deferred.md)'s worked
example) and one accepted loss.

## What this turns out to cost, which D-24 did not know

**Retiring the Vite app removes working features, not just duplication.**

`packages/core/src/api/routes/` implements 31 handlers across six files that
`apps/web` stubs with a 501: `terminal.ts` (6), `git.ts` (5), `graph.ts` (9),
`host-fs.ts` (3), `providers.ts` (3), `skill-imports.ts` (5). The Vite app
reaches them because it is served by core and its requests are same-origin;
the Next.js app cannot, because it is a different origin on a different
machine and has no way to ask a machine anything
([`specs/2026-08-24-reaching-my-machine-from-the-browser.md`](../specs/2026-08-24-reaching-my-machine-from-the-browser.md)).

So the Vite app is not merely the old UI. Until that spec is built, it is the
only place terminals, folder browsing, project git, the code graph, provider
settings and local skill import actually work — and only for someone sitting at
the machine.

D-24 was written on the belief that this was a duplication cleanup. It is a
cleanup **plus** a deliberate feature removal, and it should be executed
knowing that.

## Work breakdown

Everything here is foundational — no user story exists, because nothing the
owner can see is meant to change. The one thing they *would* see is the
capability loss, and that is a removal rather than a delivery.

### Foundational — the whole plan

| Work | Why no story owns it |
|---|---|
| Move 26 page components into `apps/web/src/app/<route>/` | Same pages, same routes, same rendering — the owner sees no difference |
| Move the 10 components that import the router shim | Internal dependency reshuffle |
| Delete `react-router-mock.tsx` and its aliases in `next.config.ts` and `tsconfig.json` | Removes an adapter, changes no behaviour |
| Narrow `packages/ui` to the design system; drop `routes/` as a name | Package structure |
| Delete the Vite host — `index.html`, `vite.config.ts`, `main.tsx`, `router.tsx`, the `dev`/`build` scripts | Removes a host nobody is meant to run |
| Delete the static-serving and SPA-fallback block in `packages/core/src/api/server.ts` | Core stops being a web host and goes back to being an API |
| Delete `resolveLocalUiUrl` and the `SPARSTROW_DEV` fallback in `packages/desktop/src/urls.ts`; make the hosted app the default | Electron becomes the shell D-24 describes |
| Convert 1–2 moved pages to Server Components | Deliberate exception — see Decisions |

## Decisions

### 1. Accept the capability loss; do not rebuild the 31 handlers here

The alternative — filling the highest-value stubs before deleting — was
rejected on three grounds. The features are already unreachable in the owner's
day-to-day, which has been the hosted app throughout M8–M15. Rebuilding them
against core's same-origin assumption means building on exactly the thing being
deleted, and they would have to be built a second time for the browser. And the
spec that rebuilds them properly already exists and is scoped to do it once,
cloud-brokered, working from any browser rather than only at the machine.

**What makes this reversible:** the handlers are not deleted from core. Only
the UI that could reach them goes. Nothing has to be rewritten if the decision
turns out to be wrong — a host would have to be restored, which is a revert.

**The condition that would reverse it — asked and answered.** The reversing
condition was the owner actively using terminals or folder browsing from the
local Electron app. Put to them directly, 2026-08-24: *"right now I am not
using electron. I will only use electron once everything is configured and
working in webapp as we want. Electron is the final step."*

So nothing is in use that this removes, and the plan runs as written. Should
that change before the machine-reaching spec is built, `host-fs` and
`terminal` are the two to fill first, in that order — the picker is smaller
and on the entry path.

> **Reversed for the code graph, 2026-09-01.** The owner decided against
> reviving it and asked for it to be removed outright instead of kept dormant.
> Unlike the other 30 handlers, the code-graph engine/client/lifecycle/viz
> module, its 9 API routes, the 7 curated MCP tools, and every consumer
> (preamble, capability docs, factory-health, project provisioning, the
> Settings and project-workspace UI) were deleted — not left in place. See
> [`Ideas.md` I-11](../Ideas.md#i-11--the-rest-of-the-machine-reaching-surfaces)
> for the removal record. The other 30 handlers are unaffected by this — this
> decision's reasoning still holds for them.

### 2. Move the pages; do not convert them

`D-25` already settled that converting the 26 pages to Server Components is a
separate, per-route, opportunistic concern. Folding it in here would turn a
mechanical move whose correctness is checkable by "the page renders the same"
into 26 simultaneous rewrites with no such check. The move must stay boring
enough that a reviewer can confirm it by reading imports.

### 3. Convert exactly one or two pages, deliberately, as the example

`D-25`'s own backstop asks for one worked example in-tree so the rest have
something to copy. Doing it inside this plan is cheaper than a separate pass,
and it is the only way the new pattern gets exercised against a *moved* page
rather than a greenfield one. Pick pages that are read-only and small — a list
with no mutations. Two is the ceiling; if it starts to feel like a migration,
it has escaped decision 2.

### 4. `packages/ui` keeps its name and narrows in place

Renaming the package as well as emptying it would put a rename in every import
in `apps/web` on top of a move, and make the diff unreviewable. The `routes/`
directory does go, since nothing routes through it once the Vite router is
deleted.

### 5. Electron is repointed but not repackaged

Making the hosted app the default is a small change in one file and belongs
with the deletion it depends on. Building and shipping a packaged installer is
explicitly *after* feature completeness, per the owner's 2026-08-24 direction
recorded in `D-24`. This plan changes the default and verifies the window
loads; it does not produce a release.

## Phases

> **Order revised 2026-08-24, before decomposition**, on tracing the actual
> dependencies. The original order (move → move → delete) assumed the move was
> the hard part. It is not, and delete-first is both safer and smaller:
>
> - `packages/ui/src/components/layout/app-shell.tsx` is imported by exactly
>   one file — `packages/ui/src/router.tsx`, the Vite router. `apps/web` uses
>   its own shell. So the entire Vite host is a closed set nothing else
>   reaches.
> - **The move needs almost no import rewriting.** `apps/web/tsconfig.json`
>   already maps `@/*` to `packages/ui/src/*`, and no page uses a relative
>   import. A moved page keeps resolving as-is.
> - While the Vite host exists, every shared component must satisfy *two*
>   routers, which is the only reason the shim exists. Deleting the host first
>   removes that constraint before the un-shimming rather than during it.

### P1 — Delete the Vite host (foundational)

The closed set nothing else imports: `index.html`, `vite.config.ts`,
`src/main.tsx`, `src/router.tsx`, `src/components/layout/app-shell.tsx`, the
`dev`/`build` scripts and Vite dependencies. Plus the three things that exist
only to serve its output — core's `fastifyStatic` block and `SPARSTROW_UI_DIST`,
the desktop packaging step's `ui/` staging, and Electron's `resolveLocalUiUrl`
/ `SPARSTROW_DEV` fallback, whose default becomes the hosted app.

Done when nothing builds or serves a Vite bundle, `apps/web` still typechecks
and every route still renders.

> **Order revised a second time, 2026-08-24**, during decomposition. Move now
> comes *before* un-shim, on a constraint the first revision missed:
> **`packages/ui` cannot import from `apps/web`** — the dependency runs the
> other way. Any owned navigation module the un-shimming needs has to live in
> `apps/web`, so the files must already be there to use it. Moving first is
> also safe in a way that was not obvious: `apps/web` aliases
> `@tanstack/react-router` to the shim, so a moved file keeps working
> unchanged until it is un-shimmed deliberately.

### P2 — Move the pages (foundational)

22 pages into `apps/web/src/app/<route>/`, re-exports deleted. Four are **not**
moved but deleted — `dashboard.tsx`, `knowledge.tsx`, `knowledge-article.tsx`
and `placeholder.tsx` are orphaned by P1, since `apps/web` already has its own
implementations of the first three and the fourth existed only for the Vite
router. Pages import each other (`team-detail` → `tasks`/`pipelines`/`schedule`,
`tasks` → `goal-detail`), so they move as one batch.

**Before the components, not after** — corrected on contact, 2026-08-24. Moving
components first breaks every page still in `packages/ui`; moving pages first
breaks nothing, because a page in `apps/web` still resolves `@/components/*`
back to `packages/ui`.

### P3 — Move the app-code components (foundational)

Ten components into `apps/web/src/components/`: the nine that import the router
(`app-shell` was the tenth such and went in P1), plus `chat/chat-bits.tsx`,
which imports `markdown` and would otherwise strand a `packages/ui` →
`apps/web` import. By this point every remaining importer is already in
`apps/web`.

**This does not leave `packages/ui` as a design system** — a claim this phase
made and T-VR-03 disproved on landing. ~17 app composites, five feature
directories, `api/hooks.ts` and the Knowledge Center markdown remain, because
none of them imports the router and the narrowing was never a router problem.
Finishing it is **P7**, and it needs a stated rule for what the design system
is before it can move anything.

### P4 — Un-shim and delete it (foundational)

An owned navigation module in `apps/web` — a real `NavLink` carrying the
active-state behaviour Next has no equivalent for — then all 27 files rewritten
off `@tanstack/react-router`, then `react-router-mock.tsx`, both build aliases
and `packages/ui`'s TanStack dependency deleted together.

### P5 — One worked Server Component (foundational, per decision 3)

One or two moved pages converted, as the pattern `apps/web/CLAUDE.md` already
mandates for new surfaces. Done when the converted page renders with data on
first paint rather than a skeleton.

### P7 — Finish narrowing `packages/ui` (foundational)

The app code left behind by P3, classified against a written rule and moved.
Ordered after P4 because un-shimming changes which files count as app code.
See `T-VR-07` — this is the phase that stops being mechanical.

### P6 — Verification (foundational)

The browser pass the other phases defer: all routes walked against the feature
branch's own Vercel preview, per `AGENTS.md` §2 rule 3. Separate from the
phases that produce the change, because it is the only one that needs a
deployed host and it grades the whole plan rather than any single phase.

## Scope boundaries

- **Rebuilding the 31 handlers** — decision 1;
  [`specs/2026-08-24-reaching-my-machine-from-the-browser.md`](../specs/2026-08-24-reaching-my-machine-from-the-browser.md)
  owns it, pending owner review.
- **Converting the other 24 pages** — [`D-25`](../Deferred.md), per-route and
  opportunistic.
- **Packaging Electron** — [`D-24`](../Deferred.md), explicitly after feature
  completeness.
- **The access model** —
  [`specs/2026-08-24-what-an-agent-is-allowed-to-do.md`](../specs/2026-08-24-what-an-agent-is-allowed-to-do.md),
  pending owner review. Unrelated to this plan and deliberately not sequenced
  against it.
- **Renaming `@sparstrow/daemon` to `@sparstrow/core`** — [`D-19`](../Deferred.md).
  It triggers on the daemon package split, not on this.
- **Merging the two app shells** — was [`G-23`](../KnownGaps.md); superseded by
  this plan, which deletes one of them. Do not build the `Outlet` equivalent.

## Verification

No spec means no `SC-` criteria, so the bar is stated here instead. This plan
is correct when the app does exactly what it did before, minus the removed
host.

| What | How it gets checked |
|---|---|
| Every route still renders | `pnpm typecheck` and `pnpm test` green, then all 26 routes walked in a browser against the feature branch's own Vercel preview, per `AGENTS.md` §2 rule 3 |
| No behaviour changed by the move | Each moved page compared before/after on the same route — the move is only correct if nothing looks different |
| The shim is genuinely gone | No import of `@tanstack/react-router` anywhere outside historical docs; both build aliases removed |
| Core is an API again | Core boots, serves `/api/v1`, and returns nothing at `/` |
| Electron loads the hosted app | The window opens on the configured app URL, and the offline screen still appears when it is unreachable |
| The capability loss is the *expected* one | The six switched-off areas fail with the existing stub messages rather than crashing — and `KnownGaps.md` carries an entry naming what was removed and what restores it |

**Known verification limit, stated up front:** `apps/web` needs Supabase
credentials this environment lacks for some checks — the same blocker as
[`G-22`](../KnownGaps.md) and [`G-23`](../KnownGaps.md). The browser pass
therefore belongs on the feature branch's own Vercel preview, not localhost.
If any route cannot be reached there, it gets a `KnownGaps.md` entry rather
than a ticked box.

## Result

**Completed 2026-08-24.** All seven phases done; the app now has exactly the
three components the plan set out to leave: one Next.js web app, Electron as
a thin shell pointed at it, and core as an API. Full task-level evidence
lives in `doc/tasks/VR/T-VR-01` through `T-VR-07`; this section is the
plan-level rollup against the Verification table above.

| Verification row | Result |
|---|---|
| Every route still renders | All 26 routes (19 static + 6 detail + `/login`'s redirect) walked live on the feature branch's own Vercel preview with a real signed-in session — 200, no page errors, no console errors, on every one (`T-VR-06`) |
| No behaviour changed by the move | `T-VR-04`'s interim pass compared every router-adapter behaviour before/after; `T-VR-06` re-confirmed sidebar/breadcrumb `aria-current` and the T-VR-05 SSR page against real data |
| The shim is genuinely gone | `packages/ui`'s Vite entry, config, and shell deleted in `T-VR-01`; `@tanstack/react-router` now used only by the router-mock adapter itself, per design |
| Core is an API again | `fastifyStatic` block, `SPARSTROW_UI_DIST`, and the SPA fallback removed in `T-VR-01`; a plain 404 JSON handler replaces it |
| Electron loads the hosted app | `resolveAppUrl` returns `string \| null`, no local-UI fallback (`T-VR-01`). The window opening on the configured URL is typechecked/tested; the offline screen itself was **not** rendered — no display environment available to this agent. Recorded as [`G-36`](../KnownGaps.md) rather than assumed |
| The capability loss is the expected one | All six switched-off areas (terminals, host-fs/Browse, project git, code graph, providers, local skill import) confirmed failing with their existing stub messages, zero crashes (`T-VR-06`) |

**Found along the way, not by design review:** two silent Vite-only
degradations of the exact same shape — code that compiled, ran, and quietly
did nothing, because Turbopack doesn't implement (and doesn't error on) a
Vite-only API. `BUG-2026-08-24-hosted-app-never-loads-its-typeface`
(`next/font` scaffolding never reconciled with `@fontsource-variable/inter`)
and `BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank`
(`import.meta.glob`). Both resolved. Neither was caused by this plan; both
were exposed by it, because deleting the Vite host removed the one place
each was still (accidentally) working.

**Found live during `T-VR-06`, deliberately not fixed there, fixed in a
follow-up turn at the owner's request:** `BUG-2026-08-24-project-provision-always-400s`.
Pre-existing, unrelated to this plan's file moves — the "New project" dialog
could not create a project at all, in any mode. Fixed by mirroring
`BUG-2026-08-22-team-create-500-missing-slug`'s already-proven pattern on the
one insert path that never got it; verified live end-to-end and with 5 new
unit tests. Full detail in the bug file's Resolution section.

**What this plan does not cover:** `doc/Ideas.md` I-12 (a stale two-host
premise in three files, found and deliberately not touched during `T-VR-07`'s
classification pass) and `G-36` above are both real, both intentionally left
for someone else's turn.
