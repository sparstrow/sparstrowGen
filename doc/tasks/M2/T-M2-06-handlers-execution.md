# T-M2-06 — Handlers: execution (runs, transcripts, chat, pipelines, schedules)

| | |
|---|---|
| **Tag** | `[P]` parallel with T-M2-04, T-M2-05 |
| **Depends on** | T-M2-03 |
| **Blocks** | T-M2-08 |
| **Phase spec** | [M2/README.md](README.md) |
| **Status** | done 2026-08-10 |

## Objective

Read paths for everything execution-related. Nothing here *starts* work — that
needs a paired runtime and lands in M4.

## Endpoints

```
GET             /runs · /runs/:id · /runs/:id/events
GET             /chat/sessions · /chat/sessions/:id
GET/POST        /pipelines
GET/PATCH/DEL   /pipelines/:id
GET             /pipelines/:id/runs
GET/POST        /cron-jobs
GET/PATCH/DEL   /cron-jobs/:id
GET/POST/PATCH  /memory/notes · /memory/notes/:id
GET             /memory/notes/:id/links
POST            /memory/notes/:id/approve · /archive · /memory/notes/bulk-delete
POST            /memory/contradictions/:id/resolve
GET             /memory/search
```

Deliberately excluded — 501 via T-M2-07: `POST /runs`, `/runs/:id/cancel`,
`/pipelines/:id/run`, `/cron-jobs/:id/run-now`, `POST /chat/sessions/:id/messages`,
`/chat/sessions/:id/retry`, `/memory/rescan`, `/memory/notes/:id/raw`.

## Decisions already made

- **`/memory/search` is full-text, not semantic.** Cloud `memory_notes` has no
  vector column by design: every daemon embeds locally with the bundled 384-dim
  model so retrieval stays a sub-15 ms local read in the hot path of every run.
  Use Postgres full-text over `content`. Semantic search from the browser is
  deferred (`Deferred.md` D-5).
- **`/memory/notes/:id/raw` stays 501.** "Raw" means the markdown file on the
  machine's vault, which the cloud does not have. `content` on the row is the
  synced copy and is what `/memory/notes/:id` returns.
- **`memory_links` does not exist in the cloud.** Wikilinks are recomputed from
  the note body on every local index, making them derived. `/memory/notes/:id/links`
  returns `[]` until M6 decides whether to project them upward.

## Checklist

- [x] `apps/web/src/lib/api/handlers/runs.ts`
- [x] `apps/web/src/lib/api/handlers/chat.ts`
- [x] `apps/web/src/lib/api/handlers/pipelines.ts`
- [x] `apps/web/src/lib/api/handlers/cron.ts`
- [x] `apps/web/src/lib/api/handlers/memory.ts`
- [x] Register all five in `handlers/index.ts`
- [x] `GET /runs` honours `agentId`, `projectId`, `status`, `limit` (max 500)
- [x] `GET /runs/:id/events` honours `afterSeq` (default −1) and `limit`
      (default 500, max 2000), ordered by `seq` ascending — this is exactly the
      contract `useRunEvents` and the seq-merge in `run-detail.tsx` expect
- [x] **`run_events.payload` is passed through untouched.** Confirm the handler
      uses `OPAQUE_COLUMNS.run_events` — camel-casing it breaks the transcript
- [x] `GET /chat/sessions/:id` returns `ChatSessionDetail`: the session plus its
      messages ordered by `created_at`
- [x] `POST /memory/notes` writes `content` and `content_hash`; sets
      `last_writer_runtime_id` to null (a browser write has no runtime)
- [x] `/memory/notes/:id/approve` clears `quarantined`; `/archive` sets
      `archived_at` — neither deletes (P5 soft-archive)
- [x] `/memory/contradictions/:id/resolve` sets `resolved_at` and `resolution`

## Verification

- [x] `pnpm --filter web typecheck` passes
- [ ] `/runs` lists runs; `/runs/[runId]` renders prompt, metadata and transcript
- [x] Seed a `run_events` row whose payload contains a `tool_use` block, fetch it
      through the API, and confirm the key is still `tool_use` — this is the
      single most important assertion in this task
- [ ] `/memory` page lists notes and search returns hits
- [ ] `/pipelines` and `/schedule` render
- [ ] `/chat` lists sessions and opening one shows its message history

## Result

**Status reconciled 2026-08-25.** This row read `queued` until then, while [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and this phase's row in [`../README.md`](../README.md) had both said done since 2026-08-10 — the old "tick both places" protocol failing under fully serial work, which is what `AGENTS.md` §2.8 was adopted to stop. The phase record is the authority for a closed phase: M2 shipped and was verified on staging on 2026-08-10, browser pass included. Any `[ ]` left in the checklists above was **never recorded**, not disproved; it is not re-adjudicated here.
