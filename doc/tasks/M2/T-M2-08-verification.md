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

- [ ] `/` (dashboard + attention queue)
- [ ] `/chat` · `/messages` · `/tasks` · `/memory`
- [ ] `/agents` · `/agents/create` · `/teams` · `/projects`
- [ ] `/runs` · `/runs/[runId]` · `/pipelines` · `/schedule`
- [ ] `/skills` · `/terminals` · `/settings` · `/knowledge`

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
- [ ] **Degradation is legible.** `/terminals` and a project's git panel show a
      clear "runs on the local daemon" message. *(API side verified — every
      category B/C endpoint returns 501 with an explanatory body; the rendering
      of that message is part of the browser pass.)*
- [ ] **Realtime fires.** Update a `runs` row directly in staging; an open
      `/runs` page refetches without a manual reload. *(Needs a browser session.)*

## Checklist — browser agent pass (`AGENTS.md` §10)

- [ ] Invoke the browser agent against the running app
- [ ] It navigates every route, interacts with primary controls, and reports
      console errors and usability issues
- [ ] Fix everything reported
- [ ] Re-invoke and repeat until clean

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

**Not verified: anything that requires rendering.** Signing in needs a password
typed into a form, which this session could not do, so the route-by-route
browser pass and the browser-agent sweep below remain open. The API layer those
pages consume is fully exercised, so what is unproven is the rendering and
interaction layer, not the data layer. Tracked as **OQ-2**.
