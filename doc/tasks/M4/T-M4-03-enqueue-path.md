# T-M4-03 — Enqueue path: retire the M4 stubs

| | |
|---|---|
| **Tag** | `[P]` parallel — touches only `apps/web/src/lib/api/handlers/` |
| **Depends on** | T-M4-01 |
| **Blocks** | T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified 2026-08-10 |

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

- [x] `POST /runs` in `handlers/runs.ts`
- [x] `POST /runs/:id/cancel` in `handlers/runs.ts`
- [x] `POST /tasks/:id/run` in `handlers/tasks.ts`
- [x] The three patterns removed from `stubs.ts`, and no duplicate registration remains
- [x] Remaining `needsRuntimePatterns` messages name a real phase or admit none is scheduled
- [x] Reason tokens exported from `@sparstrow/shared` so the UI matches a constant, not a string literal
- [x] `fail()` carries an optional `reason` alongside its prose
- [x] 8 tests over the SQLSTATE → HTTP mapping, including that an unrecognised error is rethrown
- [x] A cross-workspace run id returns 404 — `cancel_run` raises SPG15 for a run the caller cannot see, and "not yours" is indistinguishable from "does not exist"

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

- [x] 50 tests green across `apps/web`; typecheck clean
- [x] Cold-boot dispatch table has **zero** duplicate registrations (the M2 defect 5 shape)
- [x] Live against staging with a real user session: `start_run` with no machine online returns SQLSTATE `SPG12` and the message the UI will show
- [ ] The same through `POST /api/v1/runs` with a browser session → **deferred to T-M4-08**, which owns the signed-in browser pass
- [ ] Command claimed and executed → **deferred to T-M4-08**

## On completion

- [x] Tick 6.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-10

Three endpoints served, twelve stubs left standing and re-worded.

### The error contract was proved end to end, not assumed

The whole design rests on PostgREST surfacing a custom SQLSTATE as `error.code`.
If it did not — if the code were flattened into prose, or replaced with a
generic `P0001` — every reason token would silently collapse to a 500 and the
UI would have nothing to switch on.

Checked against real staging with a real user session, created through the
admin API and `verifyOtp` (the OQ-2 path, no password typed):

```
no machine online  -> code: "SPG12" | No machine is online that can run claude-code.
unknown agent      -> code: "SPG10" | That agent does not exist.
unknown run        -> code: "SPG15" | That run does not exist.
```

Both halves hold: the code arrives intact, and the message is the human-readable
one written in the `RAISE`, so there is no second copy of that prose in
TypeScript to drift from it.

### An unrecognised error must never become a tidy 409

`enqueueFailureFrom` returns null for anything it does not recognise, and both
handlers rethrow. It would have been one line shorter to map everything unknown
onto "could not start the run" — and that line would send a user to check their
machines because of a connection failure or a bug on the server. Tested
explicitly, including that M3's `SPG01`–`SPG03` (pairing) never map here.

### Tasks park; runs fail

The asymmetry is the point, and it is now written where it is enforced. A run is
an action, so failing it is honest. A task is a durable board object, so refusing
to place it right now says nothing about whether it still needs doing:
`project_not_available` parks it where the four recovery actions hang off, and
`no_runtime_available` puts it back in `todo` — deliberately not under a
project-shaped status, which would send someone hunting for a project problem
that does not exist.

A task with no assigned agent is the exception that returns 400: parking it would
hide a configuration mistake behind a status that blames the machines.

### Two things the spec asked for that turned out not to exist

**The unique-violation-returns-the-existing-run path is unreachable.** The
checklist called for mapping a 23505 on the idempotency key to a 200. `start_run`
mints a fresh run id on every call, so `run.start:<runId>` is unique by
construction and that collision cannot happen. Writing the branch would have
produced dead code that looks like a considered decision. `cancel_run` is where
the real race lives, and it handles it in SQL with `on conflict do nothing`.

**`fail()` had nowhere to put a reason.** It returned `{ error }` only. Extended
with an optional third argument rather than adding a parallel helper, so there is
one way to fail a v1 request.

### Handed to T-M4-07

`ApiError` in `packages/ui/src/lib/api.ts` carries only `status` and `message`,
so nothing can read the `reason` these handlers now send. Plumbing it through is
on that task's checklist — it is a `packages/ui` file, and editing it here would
have broken the `[P]` tag that lets 6.3 and 6.7 run in parallel.
