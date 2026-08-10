# T-M2-07 — Health, realtime rewire, and 501 stubs

| | |
|---|---|
| **Tag** | `[C]` concurrent — edits shared files |
| **Depends on** | T-M2-03 |
| **Blocks** | T-M2-08 |
| **Phase spec** | [M2/README.md](README.md) |
| **Status** | queued |

## Why `[C]` and not `[P]`

This touches `providers.tsx` and registers a large block into the shared
`handlers/index.ts` that T-M2-04/05/06 also write to. It can be interleaved with
them in any order, but not blindly in parallel — it will collide on the registry.
One worker at a time on that file.

## Objective

Make system health real, fix a Realtime subscription that has never worked, and
give every out-of-scope endpoint an honest 501 so the UI degrades visibly instead
of looking broken.

## Decisions already made

- **`system_health` is not a table and is not being created.** Health derives
  from `runtimes`. This was verified directly against staging: the old schema
  never had such a table, which is also why the hand-written
  `0001_realtime_and_pgvector.sql` failed — its `ALTER PUBLICATION` listed
  `system_health` and aborted the whole statement.
- **501, not 404.** A 404 reads as a bug. A 501 with a reason tells the user the
  feature needs a paired machine.

## Checklist — health

- [ ] `apps/web/src/lib/api/handlers/system.ts`
- [ ] `GET /system/health` derived from `runtimes`: total count, online count,
      most recent `last_heartbeat`, and per-runtime `{ id, name, os, status,
      capabilities }`
- [ ] Shape it to satisfy the existing `SystemHealth` consumers; report
      `providers` from the union of online runtimes' `capabilities` rather than
      probing anything, and mark db/vault/embedder sections as runtime-reported
      or unknown — the browser cannot inspect a machine it isn't running on
- [ ] `GET /system/factory-health` — same source, aggregate shape

## Checklist — realtime rewire

- [ ] In `apps/web/src/components/providers.tsx`, replace the `system_health`
      table case with `runtimes`, invalidating the `["health"]` query key
- [ ] Confirm every other table name in that switch exists in the new schema:
      `runs`, `tasks`, `goals`, `messages` all do; add `chat_messages`,
      `task_questions` and `runtime_projects`, which are now published
- [ ] Cross-check against the 11 tables in
      `packages/shared/drizzle/policies/002_realtime.sql` — a subscription to an
      unpublished table silently never fires

## Checklist — 501 stubs

- [ ] `apps/web/src/lib/api/handlers/stubs.ts`
- [ ] **Host-local** → `501 { error: "<X> runs on the local daemon and is not
      available from the web app." }`
      `/host-fs/*`, `/terminal/*`, `/git/*`, `/projects/:id/git*`,
      `/projects/:id/pull-requests`, `/projects/:id/files`, `/providers*`,
      `/graph/*`, `/projects/:id/graph*`, `/projects/:id/reindex`,
      `/projects/:id/briefing`, `/system/secrets/github-pat`, `/memory/rescan`,
      `/memory/notes/:id/raw`, `/skills/local`, `/skills/import-local`,
      `/skills/import-url`
- [ ] **Needs a runtime** → `501 { error: "<X> requires a paired machine.
      Pair one from Settings." }`
      `POST /runs`, `/runs/:id/cancel`, `/tasks/:id/run`, `/pipelines/:id/run`,
      `/cron-jobs/:id/run-now`, `/agents/:id/test-spawn`, `/agents/draft`,
      `POST /chat/sessions/:id/messages`, `/chat/sessions/:id/retry`,
      `/teams/:id/manager/chat`, `/projects/:id/dream*`,
      `/projects/:id/sync-from-base`, `POST /goals`
- [ ] Each stub names the M-number that will implement it, so the message is
      actionable rather than a dead end

## Verification

- [ ] `pnpm --filter web typecheck` passes
- [ ] `/settings` renders health showing 0 machines (none paired yet) without error
- [ ] `/terminals` shows a readable "runs on the local daemon" message, not a
      spinner or a crash
- [ ] Clicking "Run" on a task surfaces "requires a paired machine"
- [ ] Updating a `runs` row directly in staging causes the open `/runs` page to
      refetch — proves the Realtime path works end to end for the first time
