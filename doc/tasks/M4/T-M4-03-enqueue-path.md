# T-M4-03 — Enqueue path: retire the M4 stubs

| | |
|---|---|
| **Tag** | `[P]` parallel — touches only `apps/web/src/lib/api/handlers/` |
| **Depends on** | T-M4-01 |
| **Blocks** | T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

## Objective

`POST /runs`, `POST /runs/:id/cancel` and `POST /tasks/:id/run` stop returning
501 and start enqueueing commands. Every other stub keeps its 501 and says
something true about why.

## Decisions already made

**Three endpoints, not fifteen.** `stubs.ts` currently parks fifteen patterns
behind "arriving in M4". Only these three are dispatch; the rest are chat,
pipelines, cron, goals, dream and agent drafting, each of which needs its own
payload, its own progress model, and its own UI. Shipping them as a batch of
half-tested command kinds is precisely the over-engineering AGENTS.md §9 rules
out.

The remaining stubs get an honest message. `needsRuntimeError(feature, "M4")`
currently promises M4 for all of them; change the default so each names a real
phase or says "not yet scheduled". A promise in an error message is a commitment
the next reader will hold you to.

**The router's ordering rules already handle this.** M2 defect 4 (static routes
losing to `:id`) and defect 5 (a route registered twice, with the real handler
shadowed by its own stub) are both live risks here: removing a pattern from
`stubs.ts` and adding a handler elsewhere is exactly that shape. Verify the
dispatch table has **one** entry per method+pattern after the change.

**Errors carry reason tokens.** The UI has to distinguish "no machine is online"
from "this machine doesn't have that project" to show the right action, and
matching on prose breaks the first time someone improves the wording. This is
the same rule `apps/web/src/lib/daemon/respond.ts` established for the daemon
surface.

## The handlers

### `POST /runs`

Calls `start_run(...)` with the user's session client. Maps the RPC's error
contract to HTTP:

| RPC condition | Status | `reason` |
|---|---|---|
| no online capable runtime | 409 | `no_runtime_available` |
| project bound to no candidate | 409 | `project_not_available` |
| agent missing or not in workspace | 404 | `agent_not_found` |
| unique violation on the idempotency key | 200 | — (return the existing run) |

Returns the created run row, case-converted like every other handler.

### `POST /runs/:id/cancel`

Calls `cancel_run(...)`. Returns the run unchanged when it is already terminal —
not a 409. A user pressing Cancel on a run that finished half a second ago has
not made an error.

### `POST /tasks/:id/run`

Reads the task, uses its `assignedAgentId`, `projectId` and `targetRuntimeId`,
and calls `start_run`. On `no_runtime_available` or `project_not_available` it
does **not** return 409 — it sets the task status (`project_not_available`, or
leaves it `todo` with the reason in `result`) and returns the task. Phase
decision 7: a task is a durable board object and parking it is the correct
outcome; a run is an action and failing it is.

A task with no `assignedAgentId` is a 400 with `reason: "no_agent_assigned"`.

## Checklist

- [ ] `POST /runs` in `handlers/runs.ts`
- [ ] `POST /runs/:id/cancel` in `handlers/runs.ts`
- [ ] `POST /tasks/:id/run` in `handlers/tasks.ts`
- [ ] The three patterns removed from `stubs.ts`, and no duplicate registration remains
- [ ] Remaining `needsRuntimePatterns` messages name a real phase or admit none is scheduled
- [ ] Reason tokens exported from `@sparstrow/shared` so the UI matches a constant, not a string literal
- [ ] Handler tests: each error path returns its documented status and reason
- [ ] A cross-workspace run id returns 404, not 200-with-no-effect (M2's delete lesson)

## Traps

**`start_run` is `SECURITY DEFINER`, so RLS is not the backstop here.** The
membership check inside the function is. Do not "simplify" the handler by
passing a workspace id from the request.

**The UI already has these mutations.** `useCreateRun`, `useCancelRun` and
`useRunTask` in `packages/ui/src/api/hooks.ts` are written and wired; this task
gives them a server. Read their expected request and response shapes before
choosing yours — `packages/ui` is not to be edited for this.

**`POST /goals` was registered twice in M2** and the real handler shadowed its own
stub. Grep for every registration of each pattern you touch.

## Verification

- [ ] Handler tests pass
- [ ] Live against staging: `POST /runs` with no machine paired returns 409 `no_runtime_available` — not 501, not 500
- [ ] Live: with the machine paired and online, a run row appears with `target_runtime_id` set and one `runtime_commands` row beside it
- [ ] Deferred to T-M4-08: that the command is then claimed and executed

## On completion

- [ ] Tick 6.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
