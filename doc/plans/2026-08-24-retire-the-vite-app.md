# Retire the Vite app — 2026-08-24

| | |
|---|---|
| **Spec** | n/a (internal) — no user-visible change is intended; this moves files between packages and removes a second host. The one behaviour change it *does* cause is a capability loss, handled under Decisions below rather than by writing a spec for a deletion |
| **Status** | **Draft — not decomposed** |
| **Trigger** | Owner, 2026-08-24: "our priority right now is transitioning to the next.js app from the vite app and clearing that out. That's the priority, then we can work new feature or access" |
| **Depends on** | — |
| **Touches** | `packages/ui/` (all of it), `apps/web/src/app/`, `apps/web/src/lib/react-router-mock.tsx`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `packages/core/src/api/server.ts`, `packages/desktop/src/urls.ts` |
| **Tasks** | not decomposed yet |
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

**The condition that would reverse it:** the owner actively using terminals or
folder browsing from the local Electron app today. That was put to them
directly when this plan was proposed; this decision records their answer as
"proceed". If that changes, `host-fs` and `terminal` are the two to fill first,
in that order — the picker is smaller and on the entry path.

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

### P1 — Move the components (foundational)

The 10 non-page components that import the router shim, moved into `apps/web`
and switched to Next's router directly. Done first because every page depends
on some of them, and doing it second would mean touching the same files twice.
Done when `apps/web` typechecks and tests pass with no component in
`packages/ui` importing `@tanstack/react-router`.

### P2 — Move the pages (foundational)

The 26 pages, in batches, each batch deleting its 7-line re-export as it lands.
Done when no `packages/ui/src/routes/` remains and every route still renders.
This is the phase where the Vite host stops building — expected, and the reason
P3 follows immediately rather than being scheduled separately.

### P3 — Delete the hosts (foundational)

The Vite entry, core's static serving, Electron's fallback, the shim and its
aliases. Done when `packages/ui` has no `dev`/`build` script, core serves only
its API, and Electron's default is the hosted app.

### P4 — One worked Server Component (foundational, per decision 3)

One or two moved pages converted, as the pattern `apps/web/CLAUDE.md` already
mandates for new surfaces. Done when the converted page renders with data on
first paint rather than a skeleton.

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

<!-- Filled in as the plan lands. -->
