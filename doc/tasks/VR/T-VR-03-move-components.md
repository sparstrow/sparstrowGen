# T-VR-03 — move the app-code components into `apps/web`

| | |
|---|---|
| **Tag** | `[S]` — `apps/web`'s `app-shell.tsx` is edited by this and by nothing else concurrently; five of the nine components are its direct imports |
| **Serves** | foundational — puts the components where P4's owned nav module can reach them |
| **Depends on** | T-VR-02 — every importer must already be in `apps/web` |
| **Blocks** | T-VR-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-24 |

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

- [x] `git mv` the ten files into `apps/web/src/components/`, preserving
      `layout/` and `chat/` subdirectories
- [x] Repoint the five imports in `apps/web/src/components/layout/app-shell.tsx`
      that name `@sparstrow/ui/components/layout/*` (`breadcrumbs`,
      `command-palette`, `pinned-items`, `tab-strip`, `workspace-switcher`) at
      their new `@web/components/layout/*` locations
- [x] Repoint every other importer per the table above, re-derived by search
      rather than trusted from this document
- [x] Confirm nothing left in `packages/ui` imports any of the ten — this is
      the check that proves the dependency direction is intact
- [x] Prune `packages/ui`'s now-unused dependencies. As of T-VR-02 that is
      `@xterm/xterm`, `@xterm/addon-fit` and `react-resizable-panels` (zero
      users); re-derive the list after this task's moves rather than trusting
      it, and add any dependency the ten moved files need to `apps/web`
- [x] `pnpm typecheck` green
- [x] `pnpm test` green
- [x] `pnpm --filter web build` green — typecheck cannot see a client-boundary
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

**Done 2026-08-24.** All ten moved; `packages/ui/src/components/chat/` is gone
and `layout/` holds only `page-container.tsx`. Fifteen import sites rewritten.
The importer table in this document was re-derived by search before moving, as
its own checklist demanded, and matched.

### Dependencies, both directions

Added to `apps/web` (the moved code needs them there):
`@dnd-kit/sortable`, `@dnd-kit/utilities`, `react-markdown`,
`rehype-highlight`, `remark-gfm` — at the versions `packages/ui` already
pinned, not freshly resolved.

Removed from `packages/ui` (zero remaining importers, re-derived rather than
trusted): `@tanstack/react-router`, `@xterm/xterm`, `@xterm/addon-fit`,
`react-markdown`, `rehype-highlight`, `remark-gfm`, `react-resizable-panels`,
`zod`.

**`@tanstack/react-router` came out here, not in T-VR-04.** That task's
checklist expects to remove it; it is already gone, because moving the last
router-importing file out of `packages/ui` made the dependency unused. The
shim itself and `apps/web`'s two aliases are untouched and remain T-VR-04's.

**`@fontsource-variable/inter` was deliberately NOT pruned** despite being
unimported — see below.

**`cmdk` correctly stays.** `command-palette.tsx` moved, but `cmdk` is used by
`components/ui/command.tsx`, a shadcn primitive that is design system.

### Found while doing it, and filed

**[`BUG-2026-08-24-hosted-app-never-loads-its-typeface`](../../bug/BUG-2026-08-24-hosted-app-never-loads-its-typeface.md).**
`DESIGN.md` §3 mandates Inter Variable, `globals.css` sets
`--font-sans: "Inter Variable"`, and `apps/web` loads *Geist* via
`next/font/google` under different variable names that nothing references. So
the hosted app has always rendered in the `ui-sans-serif` fallback, and Geist
is downloaded on every cold load and used by nothing. Not caused by this
phase — Inter was imported by the Vite entry, so it was right in the Vite app
and never right in `apps/web`. T-VR-01 removed the last importer and made it
total. Not fixed here: typography needs a browser to verify, and choosing
between "load Inter" and "adopt Geist and amend the doctrine" is a design
decision.

### The plan's P3 claim was wrong, and is corrected

P3 said what remained after this task would be the design system. It is not.
`packages/ui` still holds ~17 app composites, five feature directories,
`api/hooks.ts`, half of `lib/`, and the Knowledge Center markdown. They stayed
because none imports the router — and the narrowing was never a router problem.
Opened as **T-VR-07**, which needs a stated rule for what the design system
*is* before it can move anything.

### Verification

- `pnpm typecheck` — **green, 7/7 packages**
- `pnpm test` — **green, 1,385 passing across 5 packages** (core 718, shared
  279, web 299, ui 61, desktop 28)
- `pnpm --filter web build` — **compiled successfully**

The build's 5 `Dynamic filesystem access` warnings are unchanged in count from
before this task, which is the first real evidence they are pre-existing rather
than introduced — T-VR-02 could only infer it from the source.

**Not verified:** nothing rendered in a browser. That is T-VR-06.
