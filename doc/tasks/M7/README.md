# M7 — Route parity and Electron

| | |
|---|---|
| **Plan** | `doc/plans/2026-08-09-daemon-cloud-control-plane.md` (M7) |
| **Depends on** | M2 (complete). Not M5 or M6 — all three are `[P]` |
| **Blocks** | nothing. Last phase in the plan |
| **Status** | decomposed 2026-08-13 — not started |
| **Open questions** | none blocking. One owner action: [OA below](#the-owner-action-this-phase-cannot-do-for-itself) |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Depends on |
|---|---|---|
| [T-M7-01 — the five missing routes](T-M7-01-routes.md) | `[P]` | — |
| [T-M7-02 — Electron loads the hosted app](T-M7-02-electron-hosted.md) | `[C]` | — |
| [T-M7-03 — Electron offline and failure screen](T-M7-03-electron-offline.md) | `[C]` | — |
| [T-M7-04 — verification](T-M7-04-verification.md) | `[S]` | 01–03 |

This file holds what they share. Individual tasks reference it rather than
restating it.

## Objective

Two unrelated halves that happen to be the last things the plan asks for.

**Route parity.** Five pages exist in `@sparstrow/ui` and have no App Router
entry, so they 404 in the hosted app. One of them, `/imports`, is in the sidebar
and 404s from a link the product itself renders.

**Electron.** The desktop window loads the daemon's own bundled UI. The plan
asks it to load the hosted app instead, so the desktop app becomes a shell that
runs the daemon and shows the same product everyone else sees.

## The shape of what was found

Two things worth stating before the tasks, both established by reading the code
rather than assumed from the plan's bullets.

**The routes half is smaller than the plan implies.** A hosted page for a
`@sparstrow/ui` route is seven lines — `"use client"` and render the component.
Route params, `Link`, `useNavigate` and `useSearch` are already solved: a
TanStack-shaped adapter (`apps/web/src/lib/react-router-mock.tsx`) is aliased
over `@tanstack/react-router` in both `next.config.ts` (bundler) and
`tsconfig.json` (types). `useParams` there delegates to Next's, which is what
makes the `{ from: "/runs/$runId" }` call sites work unchanged. There is no
adapter work in this phase, and no API work either — all four detail endpoints
already exist in `/api/v1`.

**The Electron half is blocked on something the plan assumes exists.** "Point
`mainWindow.loadURL` at the hosted app" presupposes a deployment. **There isn't
one.** `config.cloudUrl` still defaults to `http://localhost:3000` with the
comment "Set `SPARSTROW_CLOUD_URL` once the app is deployed", and nothing in
`doc/` records a deployed URL. This is the same class of thing M5's decomposition
turned up — a phase inheriting a premise from an earlier phase's bullet list that
stopped being true.

It does not block the work, because the fix is to make the URL configuration
rather than a constant. It does mean this phase cannot end with "the desktop app
opens the hosted product" being *observed*, and T-M7-04 says so rather than
quietly grading itself on the half it can reach.

## Definition of done

- All five routes render in the hosted app, with real data, under the same
  `AppShell` every other page gets
- `/imports` no longer 404s from its own sidebar link
- A detail page reached by clicking a row shows THAT row's record — the param
  actually arrives, which is the only part of the routes half that can fail
  quietly
- The Electron window loads whatever `SPARSTROW_APP_URL` names, and a build with
  it unset still starts and still says something true
- A window that cannot reach the app shows a native screen explaining why, with
  a retry — not a white rectangle
- `pnpm -r typecheck` and `pnpm -r test` stay green

**Not in this phase:** making host-local features work inside the hosted window.
See decision 5.

---

## Decisions already made

### 1. The five routes are thin re-exports. Resist making them anything else

Every existing page in `apps/web/src/app/` that wraps a `@sparstrow/ui` route is
`"use client"` plus a single render. The four new dynamic pages are the same, and
the temptation to "improve" them — server-fetch the record, add `generateMetadata`,
add `notFound()` handling — should be refused in this phase. Those are real
improvements and they belong to whoever redesigns these pages, not to a task
whose whole point is that a page which exists stops 404ing.

`/knowledge/[articleId]` is the one existing counter-example, and it is a server
component for a specific reason that does not generalise: its content is bundled
markdown read off disk at build time. Nothing here has that property.

### 2. The directory name IS the param name. Getting it wrong fails silently

Next's `useParams()` keys off the directory: `app/runs/[runId]` yields
`{ runId }`. The adapter passes that straight through, and the UI destructures
by name — `const { teamId } = useParams({ from: "/teams/$teamId" })`.

So `[teamId]`, not `[id]`. A mismatch does not throw: `useParams()` returns an
object without that key, the page destructures `undefined`, and the fetch runs
against `/teams/undefined`. What the user sees is an empty or failed detail page,
which reads as a data problem rather than a routing one.

| TanStack path | App Router directory | Param the page reads |
|---|---|---|
| `/imports` | `app/imports/` | — |
| `/teams/$teamId` | `app/teams/[teamId]/` | `teamId` |
| `/projects/$projectId` | `app/projects/[projectId]/` | `projectId` |
| `/tasks/goals/$goalId` | `app/tasks/goals/[goalId]/` | `goalId` |
| `/skills/$skillId` | `app/skills/[skillId]/` | `skillId` |

### 3. The goal route lives under `/tasks`, and the plan's bullet is loose about it

The plan says "`goals`/goal-detail". The actual route is
**`/tasks/goals/$goalId`** (`router.tsx`, commented "P6-Q1: goal detail lives
under the `/tasks` surface"), and `goal-detail.tsx` reads
`useParams({ from: "/tasks/goals/$goalId" })`.

Building `app/goals/[goalId]/` instead would produce a page that renders, takes
its param correctly, and is unreachable from every link in the product — because
`tasks.tsx` links to `/tasks/goals/...`. It would look done and be dead.

### 4. No API work. All four detail endpoints already exist

Checked, not assumed: `GET /goals/:id`, `/projects/:id`, `/skills/:id` and
`/teams/:id` are all registered in `apps/web/src/lib/api/handlers/`, and
`/imports` reads `/agents/imports` and `/agents/imports/:id`, which exist too.

Some **actions** on these pages are deliberately `501` in the hosted app —
project dreaming, syncing from base, starting a goal, team-manager chat, local
skill import. That is M2's design, documented in `stubs.ts`, and this phase must
not "fix" any of it. A page whose primary content loads and whose runtime-only
button explains itself is the intended hosted experience.

### 5. The desktop app's value after this change is that it runs the daemon — host-local features stay unavailable in the window

Once the window loads the hosted app, the page is served from a remote origin.
It cannot call `http://127.0.0.1:48750`, and it should not: a hosted HTTPS page
reaching localhost is blocked as mixed content, and relaxing `webSecurity` to
allow it would be a genuinely bad trade for a feature the architecture already
solved another way.

It is solved another way — that is what M3–M6 are. The window talks to the cloud;
the cloud talks to this machine's daemon over commands, transcripts and memory
sync. So terminals, git and the local filesystem stay `501` in the desktop
window exactly as they are in a browser tab, and **that is not a regression this
phase introduces, it is the architecture arriving.** It is still worth saying
out loud, because someone will open the desktop app expecting a terminal.

The preload bridge is the one exception and survives: `contextBridge` attaches
per window regardless of origin, so `sparstrowDesktop.dialogs.pickDirectory`
and the updater keep working. `nativePickerAvailable()` probes for the function
rather than the object, so a hosted page in a desktop shell gets the native
folder dialog and the same page in a browser falls back — no change needed.

### 6. The app URL is configuration, not a constant — and the fallback must not lie

`UI_URL` today is `SPARSTROW_UI_URL` in dev and `SPARSTROW_CORE_URL` in
packaged mode, defaulting to the local core. This phase adds
`SPARSTROW_APP_URL` as the hosted target.

What it must NOT do is default to a guessed production hostname. There is no
deployment (see above), and a default pointing at a domain nobody has registered
turns "we haven't deployed yet" into "the desktop app is broken and the error
mentions a domain that does not exist". Unset means fall back to the local core,
which is exactly today's behaviour and is a working product.

### 7. `did-finish-load` is not enough. Failure needs `did-fail-load`

`main.ts` currently logs on `did-finish-load` and handles no failure at all. A
`loadURL` against an unreachable host rejects, and the window sits there empty —
which is what the plan's "native offline screen" is for.

The screen is Electron-side and not a route in the app, deliberately: an offline
screen served by the thing that is offline is not an offline screen.

---

## The owner action this phase cannot do for itself

**Deploy the web app and record its URL.** T-M7-02 ships the configuration and a
runbook entry for it; it cannot ship the deployment, which needs a hosting
account and environment variables only the owner has. Until that exists,
`SPARSTROW_APP_URL` has nothing true to point at and the desktop half of
T-M7-04 cannot be verified.

This is stated here rather than filed as an `OpenQuestions.md` entry because
nothing is undecided — the work is decided, someone just has to have an account.

## Files

| Path | Change |
|---|---|
| `apps/web/src/app/imports/page.tsx` | new |
| `apps/web/src/app/teams/[teamId]/page.tsx` | new |
| `apps/web/src/app/projects/[projectId]/page.tsx` | new |
| `apps/web/src/app/tasks/goals/[goalId]/page.tsx` | new |
| `apps/web/src/app/skills/[skillId]/page.tsx` | new |
| `packages/desktop/src/main.ts` | edit — `SPARSTROW_APP_URL`, `did-fail-load`, retry |
| `packages/desktop/src/offline.ts` | new — the native failure screen |
| `doc/runbooks/` | new entry — deploying the app and setting the URL |

## Traps

**A route that renders is not a route that works.** The only failure mode in the
routes half that matters is a param that does not arrive (decision 2), and it
produces a page that renders fine and shows nothing. Every verification step for
a detail page must reach it **by clicking a row**, not by typing a URL with a
made-up id — a fabricated id fails the same way a broken param does, so typing
one proves nothing.

**Do not add a `/goals` redirect "for safety".** Nothing links there. A redirect
from a path the product never produces is dead code that makes the next reader
believe both paths are real.

**The window is not the only consumer of `UI_URL`.** Read every reference before
changing its meaning — the tray and the updater resolve the core over a separate
token-authed client (`core-client.ts`), and those must keep pointing at the local
core no matter where the window points.

**An offline screen must not be reachable as a normal page.** Load it from a
`data:` URL or a packaged file, never by navigating the window to a route — the
window's location is what retry needs to restore.

## Verification

Full procedure in [T-M7-04](T-M7-04-verification.md). The assertions that matter:

1. **Each of the five routes renders with real data**, reached by clicking,
   under the same shell as every other page.
2. **A detail page shows the record that was clicked**, not an empty state.
3. **`/imports` resolves from its own sidebar link.**
4. **A desktop build with `SPARSTROW_APP_URL` unset still starts** and loads the
   local core, unchanged from today.
5. **A desktop build pointed at an unreachable host shows the native screen and
   recovers on retry** — testable today against a dead port, without a
   deployment.
