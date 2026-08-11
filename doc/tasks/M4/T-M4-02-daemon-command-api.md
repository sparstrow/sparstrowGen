# T-M4-02 — Daemon command API in Next

| | |
|---|---|
| **Tag** | `[S]` sequential — the HTTP contract T-M4-04/05/06 are written against |
| **Depends on** | T-M4-01 |
| **Blocks** | T-M4-04, T-M4-05, T-M4-06, T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

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

- [ ] `packages/shared/src/cloud.ts` — `CommandKind`, `RunStartPayload`, `RunCancelPayload`, `SettingsSetPayload`, `ClaimedCommand`, `AckRequest`, `RunStatusReport`, `BindingReport`, `COMMAND_POLL_INTERVAL_MS = 3_000`, `COMMAND_LEASE_MS = 60_000`
- [ ] `GET /api/daemon/commands`
- [ ] `POST /api/daemon/commands/[id]/ack`, including the reason → board-state map
- [ ] `POST /api/daemon/runs/[id]/status`, monotonic
- [ ] `POST /api/daemon/projects/bindings`
- [ ] Every write filtered by `workspace_id` from the token, with no exceptions
- [ ] Failures use `daemonError(...)` with a stable `reason`, as M3's routes do
- [ ] Route tests: unauthenticated → 401, revoked → 403, cross-workspace run id → 404 not 200

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

- [ ] Unit/route tests above pass
- [ ] Live: claim against staging with the paired machine's token returns `{ commands: [] }`
- [ ] Live: the same call with workspace B's token returns nothing belonging to A
- [ ] Deferred to T-M4-08: the full round trip

## On completion

- [ ] Tick 6.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
