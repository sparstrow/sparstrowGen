# T-VR-03 — move the pages into `apps/web/src/app/`

| # | |
|---|---|
| **Tag** | `[S]` — the pages cross-import, so they move as one batch |
| **Serves** | foundational — completes `packages/ui`'s narrowing to a design system |
| **Depends on** | T-VR-02 |
| **Blocks** | T-VR-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] Delete the four orphans listed above; re-verify each has no importer
      immediately before deleting rather than trusting this document
- [ ] Move the remaining 22 into their route directories, keeping every
      component export name unchanged
- [ ] Rewrite the cross-page imports (`team-detail` → `tasks`, `pipelines`,
      `schedule`; `tasks` → `goal-detail`) to their new locations
- [ ] Replace each 7-line `page.tsx` re-export with a direct import of the
      moved component
- [ ] `terminals/page.tsx` uses `next/dynamic` rather than a plain re-export —
      keep that wrapper, repoint its import
- [ ] Delete `packages/ui/src/routes/` once empty
- [ ] Confirm nothing anywhere still imports `@/routes/` or
      `@sparstrow/ui/routes/`
- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green

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

<!-- Filled in when the task lands. -->
