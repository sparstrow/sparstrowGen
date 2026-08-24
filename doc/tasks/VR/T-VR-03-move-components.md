# T-VR-03 — move the app-code components into `apps/web`

| | |
|---|---|
| **Tag** | `[S]` — `apps/web`'s `app-shell.tsx` is edited by this and by nothing else concurrently; five of the nine components are its direct imports |
| **Serves** | foundational — puts the components where P4's owned nav module can reach them |
| **Depends on** | T-VR-02 — every importer must already be in `apps/web` |
| **Blocks** | T-VR-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Move the nine components that import `@tanstack/react-router` out of
`packages/ui` and into `apps/web/src/components/`, so `packages/ui` is left
holding only design-system code. Behaviour is unchanged: they keep importing
the shim, which resolves in `apps/web` exactly as it did in `packages/ui`.

## The ten

Nine that import the router — `attention-queue.tsx`, `chat/markdown.tsx`,
`pr-queue.tsx`, `work-launcher.tsx`, `layout/breadcrumbs.tsx`,
`layout/command-palette.tsx`, `layout/pinned-items.tsx`, `layout/tab-strip.tsx`,
`layout/workspace-switcher.tsx` — plus **`chat/chat-bits.tsx`**, which does not
import the router itself but imports `chat/markdown` and is used by exactly two
pages (`chat`, `agent-create`). It is app code by the same test as the rest, and
leaving it behind would make `packages/ui` import from `apps/web`, which the
dependency direction forbids.

(`layout/app-shell.tsx` was the eleventh and was deleted in T-VR-01.)

Confirmed importers, 2026-08-24 — every one is in `apps/web` once T-VR-02 has
landed:

| Component | Imported by |
|---|---|
| `attention-queue` | `app/page.tsx`, dashboard (deleted in T-VR-02) |
| `pr-queue` | `app/page.tsx`, `project-detail` |
| `work-launcher` | `project-detail`, `tasks` |
| `chat/markdown` | `chat-bits`, `skill-detail`, `app/knowledge/[articleId]/page.tsx` |
| `chat/chat-bits` | `chat`, `agent-create` |
| the five `layout/*` | `app/components/layout/app-shell.tsx` only |

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

- [ ] `git mv` the ten files into `apps/web/src/components/`, preserving
      `layout/` and `chat/` subdirectories
- [ ] Repoint the five imports in `apps/web/src/components/layout/app-shell.tsx`
      that name `@sparstrow/ui/components/layout/*` (`breadcrumbs`,
      `command-palette`, `pinned-items`, `tab-strip`, `workspace-switcher`) at
      their new `@web/components/layout/*` locations
- [ ] Repoint every other importer per the table above, re-derived by search
      rather than trusted from this document
- [ ] Confirm nothing left in `packages/ui` imports any of the ten — this is
      the check that proves the dependency direction is intact
- [ ] Prune `packages/ui`'s now-unused dependencies. As of T-VR-02 that is
      `@xterm/xterm`, `@xterm/addon-fit` and `react-resizable-panels` (zero
      users); re-derive the list after this task's moves rather than trusting
      it, and add any dependency the ten moved files need to `apps/web`
- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green
- [ ] `pnpm --filter web build` green — typecheck cannot see a client-boundary
      error and this move creates them

## Traps

**`chat/markdown.tsx` is imported by the Knowledge Center page**, which is
`apps/web`'s own SSG implementation rather than a re-export — easy to miss,
because it was never part of the re-export pattern.

**Components import each other.** `chat-bits` → `markdown` is the one that
forced this task to grow from nine files to ten. Re-run the per-filename search
before moving; another such edge would have the same consequence.

**A moved file's `@/` imports still resolve, but its relative imports may not.**
There were none in the pages; verify per component before assuming the same.

**Do not delete anything in this task.** If a component turns out to be
orphaned, note it in Result and leave it — deletions belong with the phase that
proves nothing needs them.

## Result

<!-- Filled in when the task lands. -->
