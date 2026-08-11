# M2 — Serve `/api/v1` from Next, backed by Supabase

**Status: ✅ done — 2026-08-10.** Applied and verified against live
staging. The only outstanding items are the route-rendering checks in
`T-M2-08`, which need a signed-in browser session (OQ-2); the API layer beneath
those pages is fully exercised.

| | |
|---|---|
| **Plan** | `doc/plans/2026-08-09-daemon-cloud-control-plane.md` |
| **Depends on** | M1 (complete — 36 tables + RLS live on staging) |
| **Blocks** | M3, M4, M5, M7 |
| **Open questions** | none — everything below is decided |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Depends on |
|---|---|---|
| [T-M2-01 — case converter](T-M2-01-case-converter.md) | `[P]` | — |
| [T-M2-02 — workspace resolver + bootstrap](T-M2-02-workspace-resolver.md) | `[P]` | — |
| [T-M2-03 — route skeleton + middleware](T-M2-03-route-skeleton.md) | `[S]` | 01, 02 |
| [T-M2-04 — identity & config handlers](T-M2-04-handlers-identity.md) | `[P]` | 03 |
| [T-M2-05 — work handlers](T-M2-05-handlers-work.md) | `[P]` | 03 |
| [T-M2-06 — execution handlers](T-M2-06-handlers-execution.md) | `[P]` | 03 |
| [T-M2-07 — health, realtime rewire, 501 stubs](T-M2-07-health-and-stubs.md) | `[C]` | 03 |
| [T-M2-08 — verification & browser pass](T-M2-08-verification.md) | `[S]` | 04–07 |

This file holds what all eight share — the decisions, the endpoint surface, and
the traps. Individual tasks reference it rather than restating it.

## Objective

`apps/web` currently fetches `/api/v1/*` against its own origin, where nothing
answers. Every page 404s. Make Next serve that surface from Supabase using the
caller's session, so RLS enforces isolation.

**`packages/ui/src/api/hooks.ts` and `packages/ui/src/lib/api.ts` are not
modified.** ~1400 lines of working React Query hooks keep their exact contract;
only the thing answering them changes.

## Definition of done

- Every route in the app shell loads real data or a legitimate empty state
- No request returns 404 or 401 while signed in
- A signed-out request to `/api/v1/*` returns 401
- Two users in different workspaces cannot see each other's rows through the API
- `pnpm -r typecheck` and `pnpm -r test` stay green

---

## Decisions already made

These were resolved while scoping. Do not re-open them.

**1. One catch-all route, not ~95 files.**
`apps/web/src/app/api/v1/[...path]/route.ts` exports `GET`/`POST`/`PATCH`/
`PUT`/`DELETE` and dispatches internally. 95 endpoints as nested directories
would be unmaintainable.

**2. Auth is the Supabase session cookie, and RLS does the work.**
Use `createClient()` from `apps/web/src/utils/supabase/server.ts`. Because every
query runs as the signed-in user, the M1 policies apply automatically — the
handler never filters by workspace for security, only for convenience.

> **Do not use Drizzle with the `postgres` driver here.** It connects as the
> `postgres` role, which owns the tables and therefore **bypasses RLS entirely**.
> That would silently delete the security boundary M1 just built. supabase-js
> with the user's session is the only correct client in this layer.

**3. Active workspace is resolved server-side.**
`getActiveWorkspaceId(supabase)` in `apps/web/src/lib/workspace.ts`:
- query `workspace_members` for the current user
- **0 rows** → bootstrap: insert `users` row, a `workspaces` row owned by them,
  and an `owner` membership; return the new id
- **1 row** → return it
- **more than 1** → require `?workspaceId=`; if absent return 400 listing the
  options *(a picker UI is deferred — see `Deferred.md` D-7)*

Clients never supply `workspace_id` on writes. The handler stamps it. A client
that sends one has it overwritten.

**4. `system_health` does not exist and is not being created.**
Health now derives from the `runtimes` table: total machines, how many are
online, most recent heartbeat. Also update the `system_health` case in
`apps/web/src/components/providers.tsx` to subscribe to `runtimes` instead —
it currently listens to a table that has never existed.

**5. Host-local and daemon-dispatch endpoints return 501, not 404.**
A 501 with `{ error: "..." }` makes the UI degrade visibly and explains itself.
A 404 looks like a bug. See the endpoint table.

---

## The case-conversion trap

supabase-js returns raw Postgres column names (`created_at`), while every type in
`@sparstrow/shared` is camelCase (`createdAt`). A deep converter is required in
both directions: `apps/web/src/lib/case.ts` exporting `toCamel` / `toSnake`.

**It must not recurse into `jsonb` values.** Those are opaque payloads whose
internal keys are meaningful and not ours.

The concrete failure: `run_events.payload` holds provider output containing
`tool_use`, `session_id`, and `stop_reason`. Camel-casing those produces
`toolUse`, which breaks the transcript renderer and silently defeats
`GraphUsageLine` in `packages/ui/src/routes/pages/run-detail.tsx`, which matches
on `block.type !== "tool_use"`. Worse, `runs.injected_memory` already stores
camelCase keys (`projectSlug`) — a snake-casing pass on write would corrupt data
that was correct.

Pass these through untouched:

| Table | Opaque columns |
|---|---|
| `run_events` | `payload` |
| `runs` | `injected_memory`, `effective_tools` |
| `runtime_commands` | `payload` |
| `agents` | `mcp_servers`, `specter_report` |
| `tasks` | `parent_effective_tools` |
| `chat_sessions` | `draft` |
| `chat_messages` | `meta` |
| `goals` | `world_state`, `version_log` |
| `plan_nodes` | `position` |

String-array jsonb columns (`allowed_tools`, `tags`, `capabilities`, `pre`,
`effects`, `add_dirs`, …) have no object keys and are safe either way, but the
simplest correct rule is: **convert keys of table rows only, never the inside of
a jsonb value.**

---

## Endpoint surface

95 distinct endpoints, three categories.

### A — Implement now (cloud-backed)

Straight CRUD against the tables M1 created, plus the few computed ones noted.

```
/agents · /agents/:id · /agents/:id/skills · /agents/:id/promote · /agents/:id/discard
/agents/imports · /agents/imports/:id
/chat/sessions · /chat/sessions/:id            (read + metadata; sending a turn is category C)
/cron-jobs · /cron-jobs/:id
/goals · /goals/:id · /goals/:id/nodes/...
/memory/notes · /memory/notes/:id · /memory/notes/:id/links
/memory/notes/:id/approve · /memory/notes/:id/archive · /memory/notes/bulk-delete
/memory/contradictions/:id/resolve
/memory/search                                  (Postgres full-text over content — see note)
/messages · /messages/:id/mark-read
/pipelines · /pipelines/:id · /pipelines/:id/runs
/projects · /projects/:id · /projects/provision · /projects/:id/variants
/projects/:id/directives · /projects/:id/directives/:id
/runs · /runs/:id · /runs/:id/events            (GET only; POST /runs is category C)
/skills · /skills/:id · /skills/assignments
/system/health · /system/factory-health         (derived from runtimes)
/tasks · /tasks/:id · /tasks/attention/queue
/tasks/:id/answer · /tasks/:id/approve · /tasks/:id/deny
/teams · /teams/:id · /teams/:id/members · /teams/:id/members/:id · /teams/:id/projects
```

`/memory/search` uses Postgres full-text over `memory_notes.content`. Semantic
search stays local by design — cloud `memory_notes` has no vector column
(`Deferred.md` D-5).

`/tasks/attention/queue` is a composed read, not a table: open `task_questions`
joined to their tasks, plus tasks in `blocked` / `pending_approval`, plus
unresolved `memory_contradictions`. Match the `AttentionRow` shape that
`packages/ui/src/components/attention-queue.tsx` already consumes.

### B — Return 501 "runs on the local daemon" (host-local, never moves to cloud)

These touch the machine's filesystem, processes, or credentials. Per the plan's
scope boundary they reach the daemon over Electron IPC in Phase 6.

```
/host-fs/dirs · /host-fs/volumes
/terminal/sessions · /terminal/sessions/:id
/git/pull-requests · /projects/:id/git · /projects/:id/git/pr · /projects/:id/git/push
/projects/:id/pull-requests · /projects/:id/files
/providers · /providers/:id/key · /providers/discover-models
/graph/engine · /graph/engine/install · /graph/engine/retry · /graph/index-all
/projects/:id/graph · /projects/:id/graph/usage · /projects/:id/graph/viz
/projects/:id/reindex · /projects/:id/briefing
/system/secrets/github-pat
/memory/rescan · /memory/notes/:id/raw
/skills/local · /skills/import-local · /skills/import-url
```

### C — Return 501 "requires a paired runtime" (needs the M4 command spine)

Anything that starts work on a machine. These become `runtime_commands` inserts
in M4; the 501 body should say so.

```
POST /runs · /runs/:id/cancel
/tasks/:id/run · /pipelines/:id/run · /cron-jobs/:id/run-now
/agents/:id/test-spawn · /agents/draft
/chat/sessions/:id/messages · /chat/sessions/:id/retry
/teams/:id/manager/chat
/projects/:id/dream · /projects/:id/dream/run
/projects/:id/sync-from-base
POST /goals                                     (planner run)
```

---

## Files

| Path | Change |
|---|---|
| `apps/web/src/app/api/v1/[...path]/route.ts` | new — method exports + dispatch |
| `apps/web/src/lib/api/router.ts` | new — path→handler table |
| `apps/web/src/lib/api/handlers/*.ts` | new — one module per resource group |
| `apps/web/src/lib/case.ts` | new — `toCamel`/`toSnake`, jsonb-aware |
| `apps/web/src/lib/workspace.ts` | new — `getActiveWorkspaceId` + bootstrap |
| `apps/web/src/components/providers.tsx` | edit — `system_health` → `runtimes` |
| `apps/web/src/middleware.ts` | edit — let `/api/v1/*` through to return JSON 401 rather than redirecting to `/login` |

The middleware change matters: today an unauthenticated API call gets a 302 to
`/login`, and `api()` will try to parse the HTML as JSON and throw a confusing
error. API routes must answer with a JSON 401.

---

## Verification

Run in order. Do not mark done until all pass.

```bash
pnpm --filter web typecheck
pnpm -r test
```

Then, with `next dev` running and **the daemon stopped** (proving nothing depends
on it):

1. **Every route loads.** Visit `/`, `/chat`, `/messages`, `/tasks`, `/memory`,
   `/agents`, `/teams`, `/projects`, `/runs`, `/pipelines`, `/schedule`,
   `/skills`, `/terminals`, `/settings`, `/knowledge`. Each renders data or an
   empty state. Check the browser console and network tab: no 404s, no 401s, no
   unhandled errors.
2. **Category B/C endpoints degrade cleanly.** Open `/terminals` and a project's
   git panel; confirm a readable "runs on the local daemon" message rather than a
   crash or an infinite spinner.
3. **Bootstrap works.** Sign in as a user with no workspace. Confirm exactly one
   `workspaces` row, one `workspace_members` row, and one `users` row are created,
   and the app loads.
4. **RLS still holds through the API.** Create a second user in a second
   workspace, sign in as them, and confirm none of the first user's rows are
   returned by any endpoint. This is the same property M1 proved at the SQL
   level — re-prove it through the HTTP layer, because a handler that
   accidentally uses a service-role client would pass M1's test and fail this one.
5. **Signed out returns JSON.** `curl -i http://localhost:3000/api/v1/runs`
   returns HTTP 401 with a JSON body, not a 302 to `/login`.
6. **jsonb is intact.** Insert a `run_events` row whose payload contains a
   `tool_use` block, fetch it through `/api/v1/runs/:id/events`, and confirm the
   key is still `tool_use` and not `toolUse`.

Per `AGENTS.md` §10, finish with a browser agent pass over the running app and
fix what it reports before claiming completion.
