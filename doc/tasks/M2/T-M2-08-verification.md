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
- [ ] `curl -i localhost:3000/api/v1/nonsense` signed in → 404 JSON

## Checklist — every route loads

Daemon stopped, `next dev` running, signed in. Each renders data or a legitimate
empty state, with no 404/401 in the network tab and no console errors.

- [ ] `/` (dashboard + attention queue)
- [ ] `/chat` · `/messages` · `/tasks` · `/memory`
- [ ] `/agents` · `/agents/create` · `/teams` · `/projects`
- [ ] `/runs` · `/runs/[runId]` · `/pipelines` · `/schedule`
- [ ] `/skills` · `/terminals` · `/settings` · `/knowledge`

## Checklist — the assertions that actually matter

- [ ] **jsonb intact.** Seed a `run_events` row whose payload contains a
      `tool_use` block; fetch via `/api/v1/runs/:id/events`; confirm the key is
      still `tool_use`, not `toolUse`. Confirm `GraphUsageLine` on the run detail
      page counts it rather than reporting "not used".
- [ ] **RLS holds through HTTP.** Create a second user in a second workspace.
      Signed in as them, confirm none of the first user's rows are returned by
      any endpoint. M1 proved this at the SQL layer — a handler that accidentally
      used a service-role client would pass M1's test and fail this one, which is
      precisely why it is re-proved here.
- [ ] **Bootstrap.** A brand-new user gets exactly one workspace, one membership,
      one users row, and a working app.
- [ ] **Degradation is legible.** `/terminals` and a project's git panel show a
      clear "runs on the local daemon" message.
- [ ] **Realtime fires.** Update a `runs` row directly in staging; an open
      `/runs` page refetches without a manual reload.

## Checklist — browser agent pass (`AGENTS.md` §10)

- [ ] Invoke the browser agent against the running app
- [ ] It navigates every route, interacts with primary controls, and reports
      console errors and usability issues
- [ ] Fix everything reported
- [ ] Re-invoke and repeat until clean

## On completion

- [ ] Tick 4.1 `done` in `../MasterTaskQueue.md`
- [ ] Mark M2 done in `../README.md`
- [ ] If any item here is blocked on an open question, mark it `[~] blocked → OQ-n`
      and report M2 as *done except OQ-n* rather than leaving the task open
