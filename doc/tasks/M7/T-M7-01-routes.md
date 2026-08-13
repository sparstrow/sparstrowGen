# T-M7-01 — The five missing routes

| | |
|---|---|
| **Tag** | `[P]` parallel — `apps/web/src/app/`, shares no file with the Electron tasks |
| **Depends on** | — |
| **Blocks** | T-M7-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Five App Router pages so five existing `@sparstrow/ui` routes stop 404ing in the
hosted app. One of them is in the sidebar.

## Decisions already made

**Thin re-exports, nothing more — phase decision 1.** Each page is the same
shape every other wrapper page in `apps/web/src/app/` already uses:

```tsx
"use client";

import { TeamDetailPage } from "@sparstrow/ui/routes/pages/team-detail";

export default function Page() {
  return <TeamDetailPage />;
}
```

No server fetching, no `generateMetadata`, no `notFound()`. `AppShell` comes
from the root layout; `Providers` is already above it. Params, `Link`,
`useNavigate` and `useSearch` are handled by the adapter aliased over
`@tanstack/react-router` — there is no adapter work in this task.

**The directory name is the param name — phase decision 2, and the one thing
here that fails silently.** Build exactly these:

| File | Component | Param |
|---|---|---|
| `app/imports/page.tsx` | `ImportsPage` (`@sparstrow/ui/routes/pages/imports`) | — |
| `app/teams/[teamId]/page.tsx` | `TeamDetailPage` (`.../team-detail`) | `teamId` |
| `app/projects/[projectId]/page.tsx` | `ProjectWorkspacePage` (`.../project-detail`) | `projectId` |
| `app/tasks/goals/[goalId]/page.tsx` | `GoalDetailPage` (`.../goal-detail`) | `goalId` |
| `app/skills/[skillId]/page.tsx` | `SkillDetailPage` (`.../skill-detail`) | `skillId` |

Note `project-detail.tsx` exports **`ProjectWorkspacePage`**, not
`ProjectDetailPage` — the file name and the export disagree, and the import will
simply fail to resolve if this is guessed.

**`/tasks/goals/[goalId]`, not `/goals/[goalId]` — phase decision 3.** The plan's
bullet says "goals"; the router and the component both say `/tasks/goals/$goalId`,
and `tasks.tsx` links there. The wrong path yields a working, unreachable page.

**No API work — phase decision 4.** Every endpoint these pages read already
exists. Some actions ON them return `501` by design (project dreaming, syncing
from base, starting a goal, team-manager chat, local skill import). Leave every
one of those alone; a hosted page whose runtime-only button explains itself is
the intended experience, not a defect this task discovered.

## Checklist

- [ ] `app/imports/page.tsx`
- [ ] `app/teams/[teamId]/page.tsx`
- [ ] `app/projects/[projectId]/page.tsx`
- [ ] `app/tasks/goals/[goalId]/page.tsx`
- [ ] `app/skills/[skillId]/page.tsx`
- [ ] Each imports the component name the module actually exports — check
      `project-detail.tsx` in particular
- [ ] `pnpm --filter @sparstrow/web build` succeeds — a dynamic route that Next
      cannot render is a build failure, not a runtime one, and is the cheapest
      place to catch a bad page
- [ ] No new route is added to `stubs.ts`, and no existing `501` is changed
- [ ] Nothing in `packages/ui/` is edited — if a page needs a UI change to work
      here, that is a finding for the Result section, not a fix to fold in

## Traps

**Reaching a detail page by typing a URL proves nothing.** A fabricated id and a
param that never arrived produce the same empty page. Every check must click a
row from the list page above it.

**Do not add a `/goals` redirect.** Nothing links there; a redirect from a path
the product never produces is dead code that implies both are real.

**`/imports` is the one with a visible bug attached.** It is in the sidebar and
404s today, so it is the only one of the five whose absence a user can hit
without knowing the route exists. Worth checking first.

## Verification

- [ ] `pnpm -r typecheck` clean and the web build succeeds
- [ ] All five render with real data, reached by clicking, and each detail page
      shows the record that was clicked → **T-M7-04**

## On completion

- [ ] Tick 9.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
