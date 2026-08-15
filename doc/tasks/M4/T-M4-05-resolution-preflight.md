# T-M4-05 — Resolution and project preflight

| | |
|---|---|
| **Tag** | `[P]` parallel — new module, new local table, plus the binding reporter |
| **Depends on** | T-M4-02 |
| **Blocks** | T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified 2026-08-10 |

## Objective

Turn a cloud `run.start` payload into local rows the runner can use — or into a
legible refusal. This is the task that answers "the cloud says agent
`agt_x9…`; which of my agents is that?"

## The problem, stated plainly

The board is in Postgres and the runner reads SQLite. Both sides have agents and
projects, with **independent ids and no sync between them**. Nothing in M1–M3
built a bridge, because nothing before M4 needed to cross.

## Decisions already made

**Link, do not rename** — phase decision 4. `cloud_links(kind, cloud_id,
local_id)` in local SQLite, core migration `0014`, unique on `(kind, cloud_id)`
and on `(kind, local_id)`. Rewriting a local agent's primary key to match the
cloud's would break `runs.agent_id` and `tasks.assigned_agent_id`; inserting a
second agent row with the same slug violates a `UNIQUE` constraint. The link
table has neither problem.

**Link, do not sync** — phase decision 5. Resolution is by **slug**, and a miss
is `agent_not_available`, not an agent invented from the cloud definition. The
consequence is real and is written down where users will meet it:
[D-9](../../Deferred.md).

**Slug, not name.** Both are `UNIQUE` locally, but slugs are the stable
machine-readable identifier on both sides and names are edited casually.

**Preflight is filesystem truth, not row truth** — phase decision 6. A binding
row says a path existed once. Check `fs.existsSync` on the resolved `rootDir`
before dispatching; a run started in a directory that no longer exists fails
inside the runner with a worse error and a dead run row.

**The binding report runs at boot and after any project change.** It is what
populates `runtime_projects`, and until it does, every project looks unavailable
to the enqueue-time check. Send the local project **slug** and `rootDir`; the
cloud matches by slug within the workspace and skips unknown ones (a daemon must
not be able to create board objects).

## Resolution order, for one `run.start`

1. **Agent.** `cloud_links` hit → that local agent. Miss → local agent by slug;
   on success record the link. Still a miss → ack `agent_not_available`.
2. **Agent state.** Not `enabled`, or `status !== "active"` → ack
   `agent_disabled`. Do not let `createRun` throw this — the message is better
   from here, and P9's quarantine states deserve a specific one.
3. **Project** (when the payload has one). `cloud_links` → local project; else by
   slug, recording the link. Miss → ack `project_not_available`.
4. **Path.** Local project `rootDir` is non-null and exists on disk. Miss → ack
   `project_not_available`, and include the path in `detail` so the UI's relink
   action can pre-fill it.
5. Hand off to `createRun` with the local agent id, local project id, and the
   cloud's run id.

## Checklist

- [x] `cloud_links` in `packages/core/src/db/schema.ts` + migration **`0016_cloud_links`** + `migration-0016.test.ts` — the spec guessed `0014`; core was already at `0015`
- [x] `packages/core/src/cloud/resolve.ts` — `resolveAgent`, `resolveProject`, `preflight`
- [x] Links recorded on first successful resolution, then read from the table
- [x] Ack reasons: `agent_not_available`, `agent_disabled`, `project_not_available`, `clone_failed`, each with a human-readable `error` beside the token
- [x] `packages/core/src/cloud/bindings.ts` — report local projects at boot
- [x] Binding report is best-effort: a failure logs and retries later, never blocks boot
- [x] `project.clone` handling: mark the binding `cloning`, `git clone <gitRemote>` into the requested directory, create the local project row, report the binding as `bound` — or `error` with the git message in `detail`
- [x] 14 resolution tests: link hit, slug fallback, slug miss, disabled agent, quarantined agent, missing directory, stale link, re-pairing clears links
- [x] 11 binding/clone tests, including every clone guard (non-empty directory, relative path, no remote, no shell)

## Traps

**A stale link is not a hard error.** A user can delete a local agent that a link
points at. Treat a link whose local row is gone as a miss: delete the link and
fall back to slug resolution.

**Two cloud agents can share a slug across workspaces**, and a daemon is scoped
to one workspace — but the link table has no workspace column because it does not
need one. Do not add it "for safety": a second pairing to a different workspace
should clear the links, and that is what `clearPairing()` is for. Wire it.

**`rootDir` lives on the *local* project row.** The cloud `projects` table
deliberately has no `rootDir` (it is per-machine, in `runtime_projects`). Do not
read a path out of the payload.

**A clone is not a run and must not become one.** It executes no agent, spawns no
provider, and touches no `runs` row — it acks the command and reports a binding.
Give it its own timeout and its own failure state; a clone that hangs on
credentials must not look like a stuck run.

**Clone targets a directory the user named.** Refuse a non-empty directory rather
than cloning into it, and refuse a path outside the user's chosen projects root
if one is configured. A remote-triggered write to an arbitrary local path is the
security consequence the plan accepted knowingly — bound it where you can.

**Do not report bindings for projects with a null `rootDir`.** They are board
entries with no bytes on this machine, and reporting them as `bound` would make
the enqueue check pick this runtime and then fail preflight — the exact
round-trip decision 6 exists to avoid.

## Verification

- [x] 25 unit tests green across resolution, bindings and the migration
- [ ] Live: `runtime_projects` populated from a booted paired daemon → **deferred to T-M4-08**
- [ ] Live: a renamed directory acks `missing` → **deferred to T-M4-08**
- [ ] The `project_not_available` path with the UI actions → **deferred to T-M4-08**

## On completion

- [x] Tick 6.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-10

25 tests across resolution, bindings and the migration.

### The migration is `0016`, not `0014`

The spec named `0014` from reading the task list; core was already at
`0015_skill_files_and_origin`. Numbering it as written would have collided with
an applied migration. The lesson is small and repeatable: read
`migrations.ts` rather than counting the test files, which is what the spec did.

### Clone is bounded where bounding is cheap

`project.clone` is a remote-triggered write to a local path — the security
consequence the plan accepted knowingly when dispatch became cloud-canonical.
Four guards, each with a test: an absolute path is required, a non-empty
directory is refused before any network call, a project with no `gitRemote` is
refused, and the remote is passed through `execFile` as an argument so a shell
can never see it. The last one is tested with a remote containing `; rm -rf /`.

A failed clone reports the binding as `error` with git's own message and leaves
**no** local project row — a row claiming bytes that are not there would be
resolved successfully by the next `run.start` and then fail at spawn.

### Resolution refuses rather than inventing

The decision that shapes this module is that a slug miss is
`agent_not_available`, not an agent conjured from the cloud definition. The web
UI can therefore name an agent no machine has, and the answer is a legible
blocked state. That consequence is parked as [D-9](../../Deferred.md) rather
than left implicit.
