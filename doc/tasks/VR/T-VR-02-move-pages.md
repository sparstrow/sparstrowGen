# T-VR-02 — move the pages into `apps/web/src/app/`

| | |
|---|---|
| **Tag** | `[S]` — the pages cross-import, so they move as one batch |
| **Serves** | foundational — completes `packages/ui`'s narrowing to a design system |
| **Depends on** | T-VR-01 |
| **Blocks** | T-VR-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-24 |

## Objective

Move 22 page components from `packages/ui/src/routes/pages/` into
`apps/web/src/app/<route>/` beside the `page.tsx` that re-exports them, delete
the re-exports, delete 4 orphans, and remove `packages/ui/src/routes/`
entirely.

## Decisions already made

**Four pages are deleted, not moved.** T-VR-01 orphaned them — verified by
search, nothing references any of them:

| File | Why it is dead |
|---|---|
| `dashboard.tsx` | `apps/web/src/app/page.tsx` is its own 212-line implementation, not a re-export |
| `knowledge.tsx` | `apps/web/src/app/knowledge/page.tsx` is its own SSG implementation |
| `knowledge-article.tsx` | `apps/web/src/app/knowledge/[articleId]/page.tsx` likewise |
| `placeholder.tsx` | Existed only for the Vite router, which P1 deleted |

**Pages move BEFORE the components they use, not after.** Swapped 2026-08-24
on contact — the first attempt moved components first and broke every page
still sitting in `packages/ui`, since `@/components/attention-queue` stops
resolving the moment that file leaves. The reverse is free: a page that lands
in `apps/web` keeps resolving `@/components/*` to `packages/ui`, because
`apps/web/tsconfig.json` maps `@/*` there. So this task moves pages while
their imports still point at a directory that still has the files, and
T-VR-03 moves the components afterwards, when every remaining importer is
already in `apps/web`.

**They move as one batch, not one per commit.** Pages import each other —
`team-detail` imports `TasksPage`, `PipelinesPage` and `SchedulePage`; `tasks`
imports `GoalCard` from `goal-detail`. Moving one at a time leaves
`@/routes/pages/...` imports pointing at a directory being emptied underneath
them.

**Each page lands beside its route's `page.tsx`,** named for what it is
(`agents-page.tsx` next to `agents/page.tsx`), and `page.tsx` imports it
relatively. This is what makes the eventual Server Component conversion (P5) a
local edit rather than a cross-package one.

**Cross-page imports become relative or `@web/`-qualified.** Once the files are
in `apps/web`, `@/routes/pages/tasks` no longer resolves — `@/*` points at
`packages/ui/src/*`, which will no longer contain `routes/`.

## Checklist

- [x] Delete the four orphans listed above; re-verify each has no importer
      immediately before deleting rather than trusting this document
- [x] Move the remaining 22 into their route directories, keeping every
      component export name unchanged
- [x] Rewrite the cross-page imports (`team-detail` → `tasks`, `pipelines`,
      `schedule`; `tasks` → `goal-detail`) to their new locations
- [x] Replace each 7-line `page.tsx` re-export with a direct import of the
      moved component
- [x] `terminals/page.tsx` uses `next/dynamic` rather than a plain re-export —
      keep that wrapper, repoint its import
- [x] Delete `packages/ui/src/routes/` once empty
- [x] Confirm nothing anywhere still imports `@/routes/` or
      `@sparstrow/ui/routes/`
- [x] `pnpm typecheck` green
- [x] `pnpm test` green

## Traps

**`"use client"` directives.** Every moved page is a client component. A page
file that lands in `app/` *without* the directive becomes a Server Component
by default and will fail at build on its first hook. Check each moved file
starts with it — the re-export `page.tsx` may have been carrying it.

**Two files named `page.tsx`.** Do not name the moved component `page.tsx`;
Next would treat it as a route. Use `<route>-page.tsx` or similar.

**`project-detail.tsx` exports `ProjectWorkspacePage`, not `ProjectDetailPage`.**
Export names do not all match filenames — read each re-export before rewriting
it rather than inferring the name.

**Route params.** Pages using `useParams` (`goal-detail`, `project-detail`,
`run-detail`, `skill-detail`, `team-detail`) rely on Next's param names
matching the shim's expectations. They already do — this task must not change
them, and a rename here would break silently at runtime rather than at compile.

**Do not convert anything to a Server Component here.** That is P5, deliberately
(plan decision 2).

## Result

**Done 2026-08-24.** 22 pages moved into their route directories, 4 orphans
deleted, `packages/ui/src/routes/` gone.

Each page kept its original filename inside the route directory
(`app/agents/agents.tsx` beside `app/agents/page.tsx`) rather than being
renamed. `git mv` then reports a rename rather than a delete plus an add, which
is what keeps the diff reviewable — the whole point of plan decision 2.

### Not in the checklist, found by doing it

**Four dependencies had to move to `apps/web`.** The pages import
`react-resizable-panels`, `@dnd-kit/core`, `@xterm/xterm` and
`@xterm/addon-fit`, which were `packages/ui` dependencies. Once the importing
code lives in `apps/web`, that package needs them declared. Caught by
typecheck, fixed by adding all four at the versions `packages/ui` already
pinned rather than resolving fresh ranges.

**Three of them are now dead weight in `packages/ui`** — `@xterm/xterm`,
`@xterm/addon-fit` and `react-resizable-panels` have zero remaining users
there (`@dnd-kit` still has five). Deliberately **not** removed here: T-VR-03
moves ten more files and will change that package's dependency surface again,
so the pruning is done once, afterwards, rather than twice. Added to T-VR-03's
checklist so it cannot be forgotten.

**The `"use client"` trap did not fire, and the task overstated it.** A module
imported by a `"use client"` file joins the client graph automatically; only
route files themselves default to server. Each `page.tsx` keeps the directive
and the moved component inherits it. The trap as written would have had someone
add 22 redundant directives.

### Verification

- `pnpm typecheck` — **green, 7/7 packages**
- `pnpm test` — **green, 718 passing / 4 skipped, 84 files, 5/5 packages**
- `pnpm --filter web build` — **compiled successfully**, and this is the check
  that mattered: typecheck cannot see a client-boundary error, only a build
  can. All 22 moved routes appear in the route manifest, including
  `/agents/create`, `/tasks/goals/[goalId]` and `/terminals`.

The build emits 5 `Dynamic filesystem access causes tracing of the whole
project` warnings. They come from `apps/web/src/lib/knowledge.server.ts`'s
`readdirSync`/`readFileSync` over the Knowledge Center markdown, which this
task did not touch and which no moved page calls. Not baselined against the
previous commit, so "pre-existing" is inference from the source rather than a
measured comparison — stated that way deliberately.

**Not verified:** nothing rendered in a browser. That is T-VR-06, against the
branch's Vercel preview.
