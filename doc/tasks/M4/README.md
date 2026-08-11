# M4 — Command spine

| | |
|---|---|
| **Plan** | `doc/plans/2026-08-09-daemon-cloud-control-plane.md` (M4) |
| **Depends on** | M3 (complete — a machine is paired, registered, and visibly online) |
| **Blocks** | M5 (transcripts), M6 (memory sync) |
| **Status** | decomposed 2026-08-10 — not started |
| **Open questions** | none — everything below is decided |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Depends on |
|---|---|---|
| [T-M4-01 — command RPCs: enqueue, claim, ack](T-M4-01-command-rpcs.md) | `[S]` | — |
| [T-M4-02 — daemon command API in Next](T-M4-02-daemon-command-api.md) | `[S]` | 01 |
| [T-M4-03 — enqueue path: retire the M4 stubs](T-M4-03-enqueue-path.md) | `[P]` | 01 |
| [T-M4-04 — core command loop](T-M4-04-command-loop.md) | `[P]` | 02 |
| [T-M4-05 — resolution + project preflight](T-M4-05-resolution-preflight.md) | `[P]` | 02 |
| [T-M4-06 — run status reporting + G-4](T-M4-06-run-status.md) | `[C]` | 02 |
| [T-M4-07 — UI: blocked actions + per-runtime snapshot toggle](T-M4-07-ui-blocked-and-toggle.md) | `[P]` | 01 |
| [T-M4-08 — verification](T-M4-08-verification.md) | `[S]` | 01–07 |

This file holds what they share. Individual tasks reference it rather than
restating it.

## Objective

Work queued in the browser executes on a paired machine, and the browser can
watch it reach a terminal state.

**M4 does not stream transcripts.** No `run_events` reach the cloud; `/runs/
[runId]` shows the run row's status and nothing inside it. That is M5, and it is
deliberately not smuggled in here — the run *row* round-trip is what proves the
spine, and it is provable in one afternoon. A phase that ships dispatch and
streaming together cannot tell you which half is broken.

## Definition of done

- Pressing **Run** in the web UI causes an agent process to start on this
  Windows machine within ~3 seconds, and the run row reaches `succeeded`
- A finished run leaves a `refs/sparstrow/wip/<run-id>` ref on that machine —
  this closes **`G-3`**, and is an assertion, not an observation
- Cancelling from the browser stops the local process
- Queueing work for a project the target machine does not have lands the task in
  `project_not_available` with relink / clone / unbind / reassign offered, and
  never spawns anything
- A command is executed **exactly once** across a daemon restart mid-claim, a
  duplicated enqueue, and two daemons racing the same row
- A daemon token for workspace A cannot claim, ack, or report status for
  anything in workspace B
- `pnpm -r typecheck` and `pnpm -r test` stay green

---

## Decisions already made

These were resolved while scoping. Do not re-open them.

### 1. M4 polls. The Realtime doorbell is deferred to M5

Plan decision 2 gives the daemon a per-runtime Realtime channel as a doorbell,
with ~3s polling as the always-on fallback. **M4 builds the fallback only.**

Three reasons, in order of weight:

1. **The poll is not optional and the doorbell is.** The doorbell is
   at-most-once by construction — the plan says never trust it for delivery — so
   the poll has to be correct and always-on regardless. Building the optional
   half first would mean the mandatory half gets whatever attention is left.
2. **The daemon still cannot authenticate to Realtime.** M3 decision 6 parked
   this precisely here, and nothing has changed: a daemon has no `auth.uid()`,
   so it needs either a Supabase session (which would grant it the whole
   workspace) or a custom JWT with a `runtime_id` claim — and the JWT means
   rewriting M1's policies to read the claim.
3. **M5 has to pay that cost anyway.** Live transcript deltas ride a Realtime
   broadcast channel *from the daemon*. Whatever authenticates the daemon to
   Realtime for M5 authenticates it for the doorbell, and the doorbell then
   costs almost nothing. Doing it in M4 means building it for a latency
   improvement alone.

**What 3 seconds actually costs:** a run takes minutes. The user-visible delay
between pressing Run and seeing `running` is bounded by the poll interval, and
it is the only thing that gets better with a doorbell.

**What the poll actually costs:** one `GET` per runtime per 3s ≈ 28,800/day. It
is a single indexed `UPDATE … RETURNING` over
`idx_runtime_commands_claim (runtime_id, status, created_at)` and returns an
empty array almost every time. `runtime_commands` is **not** added to the
realtime publication in this phase.

### 2. A command is acked when the work is *accepted*, not when it finishes

The lease covers the handoff — claim → local row created → ack — and nothing
more. It is 60 seconds because that is a generous ceiling on "spawn a row and
answer", not because runs are short.

Ack-on-completion is the obvious-looking alternative and it is wrong: a
40-minute run would hold a lease for 40 minutes, so leases would need renewal,
renewal needs its own heartbeat, and a missed renewal re-dispatches a run that
is *still executing*. That is duplicate execution introduced by the machinery
meant to prevent it.

Run progress travels on its own channel (`POST /api/daemon/runs/:id/status`,
[T-M4-06](T-M4-06-run-status.md)), which is idempotent and needs no lease.

### 3. Enqueue is one database function

Creating a run row and creating the command that dispatches it must be atomic.
Split across two round trips, a partial failure leaves either a run row no
daemon will ever claim (a spinner that never resolves) or a command with no run
to report against.

This is the same shape as `bootstrap_workspace` (004) and
`set_agent_skill_assignments` (006), and it is the M2 lesson repeating —
defect 2 of that phase was exactly this. `public.start_run(...)` in migration
`009`, `SECURITY DEFINER`, membership checked inside.

### 4. Runs adopt the cloud id. Agents and projects are linked, never renamed

The run row is created in Postgres at enqueue, so the cloud generates the id —
and the daemon creates its **local** run with that same id. Runs are new
objects with no history, so there is nothing to collide with, and every later
phase gets this for free: M5's `run_events` attach to the same id the browser is
already watching, with no translation table in the hot path.

Agents and projects are the opposite case. Both already exist on both sides with
independent ids (`agt_…` in local SQLite, an unrelated id in Postgres), both are
referenced by existing local rows, and `agents.slug` is `UNIQUE` locally.
Adopting cloud ids for them would mean rewriting the primary key of a live row
that `runs.agent_id` and `tasks.assigned_agent_id` point at, or inserting a
second row with a duplicate slug. Neither is acceptable for a dispatch feature.

So: **a link table, in local SQLite** — `cloud_links(kind, cloud_id, local_id)`,
core migration `0014`. One indexed lookup at exactly one boundary (the claim
path). This is not the "translation at the boundary is a bug farm" case the plan
warned about — that was about two *vocabularies* being translated at every
boundary forever; this is one id map consulted in one function.

### 5. M4 links definitions. It does not sync them

The daemon resolves a cloud agent to a local one **by slug**, and records the
link. On a miss it does **not** invent a local agent from the cloud definition:
it acks the command with `agent_not_available`, symmetric with
`project_not_available`.

Pulling the definition would be the start of bidirectional agent sync — who wins
when both sides edit, what happens to `mcpServers` paths that only exist on one
machine, what a disabled-locally/enabled-in-cloud agent means. That is a feature,
not a line of code inside a dispatcher. Parked as
[D-9](../../Deferred.md), with the consequence stated plainly: **the web UI can
name an agent no machine has**, and until D-9 the answer is a legible blocked
state rather than a surprise.

### 6. Project preflight runs twice, and the two checks are not redundant

**At enqueue, in the cloud.** Postgres already knows every `runtime_projects`
binding, so a request to run against a project no candidate runtime is bound to
is refused *before* a run row exists. Nothing is spawned, nothing is queued, and
the caller gets `reason: "project_not_available"` with the four actions.

**At claim, on the daemon.** A binding row is a claim about a disk that may be
weeks stale: the directory can be deleted, renamed, or on an unmounted drive.
The daemon re-verifies against the filesystem, and on a miss it (a) acks the
command failed with a structured reason, (b) sets
`runtime_projects.state = 'missing'` so the cloud stops choosing that runtime,
and (c) leaves the task in `project_not_available`.

Skipping the enqueue check would make every missing project cost a full
round-trip and a dead run row. Skipping the claim check would let a stale row
spawn an agent in a directory that no longer exists — which is the failure the
`rootDir` guard in `run-manager.start()` already catches, but only after a run
has been created and failed.

### 7. Target selection is explicit, and offline is not a queue

`tasks.targetRuntimeId` / `runs.targetRuntimeId`, when set, is obeyed exactly —
no fallback to another machine. A user who pinned work to their desktop did so
for a reason, and silently running it on the laptop is the single worst
behaviour this component could have.

When null, the cloud picks among runtimes that are **all** of:

- online by the M3 rule (`isRuntimeOnline(last_heartbeat)` — never
  `runtimes.status`)
- carry the agent's `provider` in `capabilities` (M3's probe writes what the
  machine can actually run, which is why it is trustworthy here)
- bound to the run's project with `state = 'bound'`, when the run has a project

Ties break on most recent heartbeat. **No candidate is an error, not a queue:**
`POST /runs` returns 409 with a reason token (`no_runtime_available`,
`project_not_available`, `agent_not_available`). Work that sits pending for an
offline machine is the shape of bug where someone closes their laptop on Friday
and finds eleven runs starting on Monday.

The task path differs on purpose: a task is a durable board object, so it parks
in `project_not_available` (or stays `todo`) instead of erroring.

### 8. Four command kinds ship, and one of them is allowlisted

`run.start`, `run.cancel`, `project.clone`, `settings.set`. `chat.turn`,
pipelines, cron, goals and dream keep their 501 stubs, with the stub message
updated to name the phase that will serve them rather than M4.

`project.clone` is in scope because the plan's own M4 verification requires all
four `project_not_available` actions to be offered, and clone is the only one
that needs the daemon. It stays small: `git clone` into a chosen directory, the
`bound | cloning | error` states the schema already anticipates, and no progress
streaming — progress is a transcript problem and transcripts are M5.

`settings.set` exists to close **`G-6`** — the WIP snapshot toggle currently
lives only in core's local UI because nothing could carry a setting to a specific
daemon. Its payload key is **allowlisted** to `git.wipSnapshot` and
`git.wipSnapshotKeep`. This is M3's `POST /api/daemon/status` lesson in a more
dangerous position: an un-allowlisted `settings.set` is a remote write into every
setting a machine has, including any added later by someone who never read this
paragraph.

### 9. `G-4` is closed here, by holding the busy key across the snapshot

`finalize()` releases the busy key before taking the WIP snapshot, so an
unrelated scheduler tick can start a run on that project mid-snapshot. That was
accepted in the OQ-1 work because closing it "stalls the queue for a backup".

M4 changes the arithmetic in two ways. Dispatch makes concurrent same-project
runs materially more likely — the board can now queue several at once from a
browser — and the cost is smaller than it looked: the key is
`busyKey(agentId, projectId)`, so holding it blocks that one identity plus one
global concurrency slot, for the duration of bounded git plumbing on a tree that
is already in the OS page cache.

Hold the key until the snapshot resolves, then release and tick. Delete the
`G-4` entry from `KnownGaps.md` in the same change, per the file's own rule.

---

## The shape of the daemon API

Four new routes under `apps/web/src/app/api/daemon/`, all bearer-authenticated,
all deriving scope from the token and **never** from the body — M3's containment
rule in `apps/web/src/lib/daemon/auth.ts` applies unchanged and is the reason
that file has a banner comment.

| Route | Purpose |
|---|---|
| `GET /api/daemon/commands` | Claim up to N pending commands for this runtime; leases them |
| `POST /api/daemon/commands/:id/ack` | `done` / `failed` + structured reason |
| `POST /api/daemon/runs/:id/status` | Run row transitions: `running`, terminal states, metrics |
| `POST /api/daemon/projects/bindings` | Report this machine's local project paths |

`/api/daemon/*` remains the daemon's surface, keyed on a bearer token;
`/api/v1/*` remains the browser's, keyed on the session cookie. Do not merge
them.

## Files

| Path | Change |
|---|---|
| `packages/shared/drizzle/policies/009_command_spine.sql` | new — `start_run`, `claim_runtime_commands`, `ack_runtime_command`, `cancel_run` |
| `packages/shared/src/cloud.ts` | edit — command kinds, payloads, claim/ack/status contracts, `COMMAND_POLL_INTERVAL_MS`, `COMMAND_LEASE_MS` |
| `apps/web/src/app/api/daemon/commands/route.ts` | new — claim |
| `apps/web/src/app/api/daemon/commands/[id]/ack/route.ts` | new — ack |
| `apps/web/src/app/api/daemon/runs/[id]/status/route.ts` | new — run row transitions |
| `apps/web/src/app/api/daemon/projects/bindings/route.ts` | new — binding report |
| `apps/web/src/lib/api/handlers/runs.ts` | edit — `POST /runs`, `POST /runs/:id/cancel` |
| `apps/web/src/lib/api/handlers/tasks.ts` | edit — `POST /tasks/:id/run` |
| `apps/web/src/lib/api/handlers/stubs.ts` | edit — remove the three now-served patterns, re-word the rest |
| `packages/core/src/cloud/commands.ts` | new — poll, claim, dispatch, ack |
| `packages/core/src/cloud/resolve.ts` | new — cloud id → local row, preflight |
| `packages/core/src/cloud/run-reporter.ts` | new — bus subscription → status posts |
| `packages/core/src/db/schema.ts` + `migrations.ts` | edit — `cloud_links`, migration `0014` |
| `packages/core/src/orchestrator/run-manager.ts` | edit — accept a caller-supplied run id; hold the busy key across the snapshot (`G-4`) |
| `packages/core/src/index.ts` | edit — start/stop the command loop beside the heartbeat |
| `packages/ui/src/routes/pages/settings.tsx` | edit — per-runtime snapshot toggle in the Machines card |
| `packages/ui/src/content/knowledge/*.md` | edit — remote dispatch is now real; see AGENTS.md §3.2 |

## Traps

**`runs.status` has no `blocked`.** The vocabulary is
`queued | running | succeeded | failed | cancelled | timeout`. `project_not_available`
is a **task** status and does not exist for runs — which is why decision 6 refuses
at enqueue rather than creating a run and parking it. Do not add a run status
without reopening the vocabulary decision M1 settled.

**The service role bypasses RLS, and M4 is where it starts writing.** M3's daemon
routes mostly wrote one column on one row. These write run rows and task
statuses. Every write must carry `.eq("workspace_id", scope.workspaceId)` even
when the id looks unambiguous — an id from a request path is caller-supplied.

**`uq_runtime_commands_idem` is globally unique**, not per-workspace. Idempotency
keys must embed the run id (`run.start:<runId>`), which is already unique, rather
than something like `task:<taskId>:run` that could recur.

**A claim must not be a `SELECT` followed by an `UPDATE`.** Two daemons — or one
daemon whose previous poll is still in flight — both see the same pending row.
The claim is a single `UPDATE … WHERE status = 'pending' … RETURNING`, which is
also what makes expired-lease reclaim safe.

**`createRun()` throws `HttpError` for the ordinary cases** — agent not found,
agent disabled, agent not `active`, project missing. Those are *acks*, not
crashes: the command loop must catch them and ack `failed` with the message, or
one disabled agent stops the loop for every other command.

**Do not let the poll loop hold the process open.** Same `unref()` requirement as
the heartbeat, for the same reason.

## Verification

Full procedure in [T-M4-08](T-M4-08-verification.md). The assertions that matter:

1. **A run queued in the browser executes here and reaches `succeeded`.**
2. **The WIP snapshot fired** — `git for-each-ref refs/sparstrow/wip/` names the
   run id. This is `G-3`, and it is the assertion the gap register asked for.
3. **A command executes exactly once** under a mid-claim restart, a duplicate
   enqueue, and an expired lease.
4. **An unbound project parks the task** in `project_not_available` and spawns
   nothing.
5. **Cross-workspace isolation holds** for claim, ack, and status — re-proved
   through HTTP, because these routes hold the service role.
