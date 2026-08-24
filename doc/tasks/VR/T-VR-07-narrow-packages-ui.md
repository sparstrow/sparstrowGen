# T-VR-07 — finish narrowing `packages/ui` to a design system

| | |
|---|---|
| **Tag** | `[S]` — moves files `apps/web` imports; conflicts with anything else touching either package |
| **Serves** | foundational — delivers the half of `D-24`'s "narrow `packages/ui` to a design system" that T-VR-03 did not |
| **Depends on** | T-VR-04 — un-shimming may change which files count as app code |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] Confirm or replace the domain-knowledge test above; record it in
      `design-system/DECISIONS.md`, per `AGENTS.md` §3.13 — this is a design
      decision with a reason, not a file-shuffling preference
- [ ] Classify every remaining file in `packages/ui/src` against it, and write
      the classification down before moving anything
- [ ] Move the app code to `apps/web`, in batches small enough to review
- [ ] Decide where `content/knowledge/` belongs and move it deliberately
- [ ] Re-derive and fix both packages' dependency lists afterwards
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` all green

## Traps

**`@fontsource-variable/inter` is an unimported dependency of `packages/ui` and
must not be pruned as dead.** It is the package `DESIGN.md` §3 names, and
deleting it erases the trail to
[`BUG-2026-08-24-hosted-app-never-loads-its-typeface`](../../bug/BUG-2026-08-24-hosted-app-never-loads-its-typeface.md).
Resolve that bug first, or leave the dependency alone.

**This is where the move stops being mechanical.** Every prior task in this
phase could be checked by "does it still compile and render the same". This one
can too, but compiling proves nothing about whether the split is *right* — a
wrong classification compiles perfectly and leaves the same mess under new
paths.

## Result

<!-- Filled in when the task lands. -->
