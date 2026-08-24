# T-VR-02 — move the router-using components into `apps/web`

| | |
|---|---|
| **Tag** | `[S]` — `apps/web`'s `app-shell.tsx` is edited by this and by nothing else concurrently; five of the nine components are its direct imports |
| **Serves** | foundational — puts the components where P4's owned nav module can reach them |
| **Depends on** | T-VR-01 |
| **Blocks** | T-VR-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Move the nine components that import `@tanstack/react-router` out of
`packages/ui` and into `apps/web/src/components/`, so `packages/ui` is left
holding only design-system code. Behaviour is unchanged: they keep importing
the shim, which resolves in `apps/web` exactly as it did in `packages/ui`.

## The nine

`attention-queue.tsx`, `chat/markdown.tsx`, `pr-queue.tsx`, `work-launcher.tsx`,
`layout/breadcrumbs.tsx`, `layout/command-palette.tsx`, `layout/pinned-items.tsx`,
`layout/tab-strip.tsx`, `layout/workspace-switcher.tsx`.

(`layout/app-shell.tsx` was the tenth and was deleted in T-VR-01.)

## Decisions already made

**They move to `apps/web/src/components/`, mirroring their current
subdirectories** — `layout/` stays `layout/`, `chat/` stays `chat/`. Flattening
would make the diff harder to read for no gain.

**They keep importing `@tanstack/react-router` in this task.** `apps/web`
aliases it to the shim in both `tsconfig.json` and `next.config.ts`, so a moved
file compiles and runs unchanged. Un-shimming is T-VR-04 and is deliberately
not folded in — this task must stay a move, so that a reviewer can confirm it
by reading import paths.

**Design-system imports stay pointed at `packages/ui`.** A moved component's
`@/components/ui/button` still resolves, because `apps/web/tsconfig.json` maps
`@/*` to `packages/ui/src/*`. Leave those alone; rewriting them to
`@sparstrow/ui/...` is churn this task does not need.

## Checklist

- [ ] `git mv` the nine files into `apps/web/src/components/`, preserving
      `layout/` and `chat/` subdirectories
- [ ] Repoint the five imports in `apps/web/src/components/layout/app-shell.tsx`
      that name `@sparstrow/ui/components/layout/*` (`breadcrumbs`,
      `command-palette`, `pinned-items`, `tab-strip`, `workspace-switcher`) at
      their new `@web/components/layout/*` locations
- [ ] Find and repoint every other importer of the nine — search for each
      filename across `apps/web` and `packages/ui`, do not assume `app-shell`
      is the only one
- [ ] Confirm nothing left in `packages/ui` imports any of the nine
- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green

## Traps

**`chat/markdown.tsx` is imported by the Knowledge Center pages**, which are
`apps/web`'s own SSG implementations rather than re-exports — check
`apps/web/src/app/knowledge/` specifically, since those files were never part
of the re-export pattern and are easy to miss.

**Components may import each other.** `app-shell` is not necessarily the only
consumer; `pinned-items` and `tab-strip` in particular are layout siblings.
Grep per filename rather than trusting this list.

**A moved file's `@/` imports still resolve, but its relative imports may not.**
There were none in the pages; verify per component before assuming the same.

**Do not delete anything in this task.** If a component turns out to be
orphaned, note it in Result and leave it — deletions belong with the phase that
proves nothing needs them.

## Result

<!-- Filled in when the task lands. -->
