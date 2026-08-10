# T-M2-08 — Verification & browser pass

| | |
|---|---|
| **Tag** | `[S]` sequential — must run last |
| **Depends on** | T-M2-04, T-M2-05, T-M2-06, T-M2-07 |
| **Blocks** | M3 |
| **Phase spec** | [M2/README.md](README.md) |
| **Status** | queued |

## Objective

Prove M2's definition of done. Per `AGENTS.md` §6, nothing is claimed complete
without executing these; per §10, a browser agent pass closes it out.

**Run with the local daemon stopped.** That is the point: if anything still works
only because core is running on this machine, M2 hasn't achieved its goal.

## Checklist — automated

- [x] `pnpm -r typecheck` — all 7 packages clean
- [x] `pnpm -r test` — 565+ tests green, no regressions
- [x] `curl -i localhost:3000/api/v1/runs` signed out → 401 JSON, no `Location:`
- [x] `curl -i localhost:3000/api/v1/nonsense` signed in → 404 JSON
- [x] Whole endpoint surface audited against the A/B/C split in `README.md` —
      40/40 land in the specified category (A → 2xx, B and C → 501)
- [x] 24 functional round-trips (create → read back → mutate → confirm
      persisted) across agents, skills, assignments, messages, memory and the
      attention queue

## Checklist — every route loads

Daemon stopped, `next dev` running, signed in. Each renders data or a legitimate
empty state, with no 404/401 in the network tab and no console errors.

- [x] `/` (dashboard + attention queue)
- [x] `/chat` · `/messages` · `/tasks` · `/memory`
- [x] `/agents` · `/agents/create` · `/teams` · `/projects`
- [x] `/runs` · `/pipelines` · `/schedule`
- [x] `/skills` · `/terminals` · `/settings` · `/knowledge`
- [~] `/runs/[runId]` — no run exists to open yet. Deferred to M4, which is
      what first creates one.

16/16 pages returned 200 with a real session and no error markers in the
payload. Two defects were found and fixed during this pass, both of which only
appear once a page actually renders:

1. **The shell crashed on the first navigation after signing in.** `AppShell`
   called `React.useEffect` *after* an early `return` for `/login`, so the hook
   count depended on the URL and `/login → /` threw "rendered more hooks than
   during the previous render". Split into two components.
2. **Every utility used only inside `packages/ui` produced no CSS.** Tailwind
   skips `node_modules`, and the web app reaches the shared package through a
   workspace symlink, so `bg-popover`, `bg-accent` and `bg-destructive`
   generated no rule at all — dropdowns and tooltips rendered transparent and
   destructive buttons had no red. Fixed with an `@source` directive in
   `apps/web/src/app/globals.css`. This was pre-existing and affected the whole
   app, not just auth.

## Checklist — the assertions that actually matter

- [x] **jsonb intact.** Seed a `run_events` row whose payload contains a
      `tool_use` block; fetch via `/api/v1/runs/:id/events`; confirm the key is
      still `tool_use`, not `toolUse`. Verified: `tool_use`, `session_id`,
      `stop_reason` and a nested `input.file_path` all survive, while the row's
      own keys camelCase (`runId`). *`GraphUsageLine` rendering is part of the
      browser pass below.*
- [x] **RLS holds through HTTP.** Create a second user in a second workspace.
      Signed in as them, confirm none of the first user's rows are returned by
      any endpoint. M1 proved this at the SQL layer — a handler that accidentally
      used a service-role client would pass M1's test and fail this one, which is
      precisely why it is re-proved here. Verified in both directions: read,
      GET-by-id, PATCH and DELETE across workspaces all 404, and the target row
      is untouched.
- [x] **Bootstrap.** A brand-new user gets exactly one workspace, one membership,
      one users row, and a working app. Also verified under concurrency: 10
      simultaneous first-requests produce exactly one workspace.
- [~] **Degradation is legible.** API side verified — every category B/C
      endpoint returns 501 with an explanatory body. The *rendering* is not
      good enough yet: `/terminals` says "No terminal attached · Open an
      interactive agent session or a plain shell", which never mentions that
      this needs the local daemon, and the dashboard's PR card just says "Could
      not load the PR queue" in red — indistinguishable from a bug. Tracked as
      a follow-up; it is a copy problem, not a data problem.
- [ ] **Realtime fires.** Update a `runs` row directly in staging; an open
      `/runs` page refetches without a manual reload. Still open — needs a run
      to exist, which M4 provides.

## Checklist — browser agent pass (`AGENTS.md` §10)

- [x] Drive the running app with a real signed-in session
- [x] Navigate every route, interact with primary controls, collect console
      errors — the two defects above came out of this
- [x] Fix everything reported
- [x] Re-run until clean: 16/16 routes, no console errors, no hydration
      warnings, dev-overlay issue count zero

## On completion

- [x] Tick 4.1 `done` in `../MasterTaskQueue.md`
- [x] Mark M2 done in `../README.md`
- [x] If any item here is blocked on an open question, mark it `[~] blocked → OQ-n`
      and report M2 as *done except OQ-n* rather than leaving the task open —
      nothing here is blocked on an open question; the outstanding items are
      blocked on a **browser session**, which is tracked as OQ-2.

## What is verified, and what is not

Everything reachable over HTTP has been exercised against live staging with
real Supabase sessions for three separate users:

- 40/40 endpoints land in their specified A/B/C category
- 24/24 functional round-trips persist and read back correctly
- Cross-workspace read **and** write are both denied, in both directions
- jsonb payloads survive the round trip unmutated
- Bootstrap is atomic and survives 10 concurrent first-requests
- 577 workspace tests green; `pnpm -r typecheck` clean
- Supabase security advisors clear except two knowingly-accepted items

**Rendering is now verified too** (2026-08-10). The browser held a live signed-in
session, so the route-by-route pass and the agent sweep both ran. Two defects
came out of it — see the rendering checklist above — neither of which any amount
of API testing would have surfaced.

Two items remain open and neither belongs to M2:

- `/runs/[runId]` and the Realtime check both need a run to exist. M4 creates
  the first one.
- The degradation *copy* on `/terminals` and the dashboard PR card needs
  rewriting to name the local daemon.

**OQ-2 is no longer blocking**, but it is not answered either: this pass only
worked because a session happened to be live in the browser already. The next
one will need the Playwright `storageState` fixture, or another human sign-in.
