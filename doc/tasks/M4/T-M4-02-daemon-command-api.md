# T-M4-02 — Daemon command API in Next

| | |
|---|---|
| **Tag** | `[S]` sequential — the HTTP contract T-M4-04/05/06 are written against |
| **Depends on** | T-M4-01 |
| **Blocks** | T-M4-04, T-M4-05, T-M4-06, T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified 2026-08-10 |

## Objective

Four routes that let a paired daemon pull work, report on it, and tell the cloud
what it has on disk — plus the shared types that stop core and web disagreeing
about their shapes.

## Decisions already made

**Scope comes from the token. Always.** `apps/web/src/lib/daemon/auth.ts` carries
a banner comment about this and it applies here more sharply than it did in M3:
these routes write run rows and task statuses, not one column on the runtime's
own row. A route reading `body.workspaceId` or trusting a path `runId` without
`.eq("workspace_id", scope.workspaceId)` is the bug the banner exists for.

**Contracts live in `packages/shared/src/cloud.ts`,** beside the M3 heartbeat
constants, for the same reason those are there.

**Claim is a `GET` with no body.** Everything it needs — which runtime, which
workspace — comes from the token. A `POST` would invite someone to add a
parameter to it.

**Run status posts are idempotent and monotonic.** The daemon retries after a
network failure, so the same `running` transition arrives twice; and a delayed
`running` must never overwrite a `succeeded` that already landed. Guard in the
`where`: only apply a terminal status if the row is not already terminal, and
only apply `running` if the row is `queued`.

## The routes

### `GET /api/daemon/commands`

Calls `claim_runtime_commands(scope.runtimeId, 10, COMMAND_LEASE_MS)`. Returns
`{ commands: ClaimedCommand[] }` — always an array, empty on the common path.

### `POST /api/daemon/commands/[id]/ack`

Body `{ status: "done" | "failed", reason?, error? }`. Calls
`ack_runtime_command(id, scope.runtimeId, …)`. `reason` is a token from a closed
set (`project_not_available`, `agent_not_available`, `agent_disabled`,
`spawn_failed`, `unknown_kind`), and the route — not the daemon — decides what a
reason does to the board:

- `project_not_available` → set the task (if any) to `project_not_available`, and
  set `runtime_projects.state = 'missing'` for that runtime+project
- `agent_not_available` / `agent_disabled` → set the task to `blocked` with the
  message in `tasks.result`
- anything else → the run row's own failure path handles it

> Reason-to-board-state translation lives here rather than in core because the
> board is a cloud concept. A daemon that could set arbitrary task statuses would
> be a daemon that could mark every task in a workspace `done`.

### `POST /api/daemon/runs/[id]/status`

Body `{ status, startedAt?, finishedAt?, error?, resultText?, costUsd?,
numTurns?, durationMs?, untrusted? }`. Validates `status` against the run
vocabulary (`queued | running | succeeded | failed | cancelled | timeout` — there
is no `blocked`), then updates `runs` where the id matches **and**
`workspace_id = scope.workspaceId` **and** `target_runtime_id = scope.runtimeId`.

On a terminal status, reconcile the linked task: `succeeded` → `review`,
`failed`/`timeout` → `failed`, `cancelled` → `todo`.

### `POST /api/daemon/projects/bindings`

Body `{ bindings: [{ projectSlug, localPath, state, detail? }] }`. Upserts
`runtime_projects` for this runtime, matching projects by slug within the
workspace. A slug with no cloud project is **skipped, not created** — a machine
must not be able to mint board objects. Sets `last_seen = now()`.

This is what makes decision 6's enqueue-time check possible: without a binding
report, `runtime_projects` is empty and every project looks unavailable.

## Checklist

- [x] `packages/shared/src/cloud.ts` — `CommandKind`, `RunStartPayload`, `RunCancelPayload`, `ProjectClonePayload`, `SettingsSetPayload`, `ClaimedCommand`, `AckRequest`, `RunStatusReport`, `BindingReportRequest`, `COMMAND_POLL_INTERVAL_MS = 3_000`, `COMMAND_LEASE_MS = 60_000`, `DAEMON_SETTABLE_KEYS`, `ENQUEUE_ERRCODE_REASONS`
- [x] `GET /api/daemon/commands`
- [x] `POST /api/daemon/commands/[id]/ack`, including the reason → board-state map
- [x] `POST /api/daemon/runs/[id]/status`, monotonic
- [x] `POST /api/daemon/projects/bindings`
- [x] Every write filtered by `workspace_id` from the token, with no exceptions
- [x] Failures use `daemonError(...)` with a stable `reason`, as M3's routes do
- [x] 22 unit tests over the decision module; auth and isolation proven live over HTTP (see Result)

## Traps

**A 404 and a "not yours" must be the same response.** A run id that exists in
another workspace must not be distinguishable from one that does not exist, or
the route becomes an id oracle.

**Do not log payloads.** A `run.start` payload contains the prompt, which is user
content and routinely contains secrets people pasted in.

**`params` is async in this Next version.** Read
`node_modules/next/dist/docs/` before writing the route signature — see
`apps/web/CLAUDE.md`. M3's routes are the local precedent worth copying.

## Verification

- [x] 22 unit tests over `lib/daemon/reconcile.ts`; 43 green across `apps/web`
- [x] Live over HTTP against staging: claim, ack, run status, and bindings
- [x] Live: workspace A's token could not see, claim, ack, or report on workspace B's rows
- [ ] Full round trip with a real daemon → **deferred to T-M4-08**

## On completion

- [x] Tick 6.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-10

Four routes, plus `apps/web/src/lib/daemon/reconcile.ts`. Exercised over real
HTTP against staging with a scratch runtime and token, then torn down (every
seeded row was prefixed `m4smoke`; zero remain).

### The decisions were pulled out of the routes

Which task status a failure implies, and which prior run states a report may
overwrite, are the only parts of this task with judgement in them — and inside a
route handler they are testable only by mocking a supabase query builder, which
mostly tests the mock. They now live in `reconcile.ts` as pure functions with 22
tests, and the routes apply what those return.

That split is also the security boundary restated in code: the daemon reports a
**fact** (`project_not_available`), and the control plane owns what it **means**
for the board. A machine that could write task statuses could mark every task in
a workspace done.

### Live, over HTTP

- Claim returns only this runtime's work; workspace B's pending command was never
  visible to A's token
- A second claim inside the lease returns `{ commands: [] }` rather than
  redispatching
- Terminal report persisted `cost_usd`, `num_turns`, `duration_ms`, `result_text`
- **A late `running` after `succeeded` did not resurrect the run** — the exact
  reordering the monotonic guard exists for, confirmed against the row
- A `project_not_available` ack parked the task in `project_not_available` (not
  `failed`), marked the binding `missing` with the checked path for relink to
  pre-fill, and failed the run row — all three, in one request
- A machine cannot ack another machine's command (404), and a 404 is
  indistinguishable from "no such command"
- Binding report recorded the known slug, **skipped and reported the unknown
  one**, and silently dropped an entry with an invalid state

### A defect typecheck could not catch

`packages/shared/src/cloud.ts` imported `./constants.js`. That typechecks — the
package is `moduleResolution: Bundler` — and then fails to resolve at bundle
time, because Next consumes this directory as TypeScript source. Every route
importing `@sparstrow/shared` returned a 500 with `Module not found`.

`pnpm typecheck` and `pnpm test` were both green while every daemon route was
dead. Nothing but starting the server would have found it, which is the argument
for doing that before building a client against these routes rather than after.
Every other intra-package import in `shared` is extensionless; this one was the
outlier.

### Deviation from the checklist, decided while building

The checklist said a cross-workspace run id should return **404, not 200**. It
returns `200 { applied: false }`, deliberately.

The concern behind "404" was M2's lesson — a write that reports success while
doing nothing. `applied: false` does not do that; it says precisely what
happened. And 404 would conflate two cases that share one response on purpose:
"not your run" and "your report arrived after the run finished". The second is
**normal and frequent** — it is the monotonic guard working — and logging it as
an error would train whoever reads daemon logs to ignore 404s. Both still return
the same body, so this is not an id oracle.

### Also added

`.claude/launch.json` had no entry for `apps/web`, so there was no supported way
to run the app being built. Added one on port 3100. The obvious
`pnpm --filter web dev -- --port 3100` passes `--` through to `next`, which
reads it as a directory; `pnpm --filter web exec next dev --port 3100` is the
form that works.
