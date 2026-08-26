# BUG-2026-08-25-creating-a-pipeline-always-400s

**Status:** 🔴 open
**Reported by:** agent — verifying `T-WA-06`'s Server Action conversion of `/pipelines`
**Reported:** 2026-08-25

## Symptom

Submitting the "New pipeline" dialog on `/pipelines` (or `/teams/<id>?tab=pipelines`,
same component) always fails with:

> Could not find the 'steps' column of 'pipelines' in the schema cache

The dialog stays open, no pipeline is created, and no steps are ever
persisted, regardless of what the form contains.

## Reproduction

1. Sign in, open `/pipelines`.
2. Click "New pipeline", fill in a name and at least one step (agent + prompt
   template).
3. Click "Create pipeline".
4. Expected: the pipeline is created and appears in the list. Actual: the
   error above renders in the dialog and it stays open.

Reproduced live 2026-08-25 against a fresh disposable workspace with one
agent, converting `T-WA-06`'s `createPipelineAction`.

## Investigation

`packages/shared/src/db/schema.ts`'s `pipelines` table
(`export const pipelines = pgTable("pipelines", {...})`) has no `steps`
column — steps live in a separate `pipeline_steps` table
(`export const pipelineSteps = pgTable("pipeline_steps", {...})`, with a
`pipelineId` foreign key back to `pipelines.id`). Nothing in the write path —
neither the original `POST /pipelines` handler
(`apps/web/src/lib/api/handlers/pipelines.ts`, pre-`T-WA-06`) nor its
replacement, `createPipelineAction`
(`apps/web/src/app/pipelines/actions.ts`) — ever inserts into
`pipeline_steps`. Both pass the client's `steps` array straight into the
`pipelines` insert payload, which PostgREST rejects as an unknown column
(`PGRST204`).

This is pre-existing, not introduced by `T-WA-06`: the handler this task
replaced had the exact same bug, byte for byte. `T-WA-06` moved the broken
logic verbatim per plan Scope boundaries (no behavior changes) rather than
fixing it in a mechanical write-transport conversion task. `updatePipelineAction`
has the identical shape — an edit that changes `steps` would fail the same
way (a quick `enabled` toggle, which sends no `steps` key, works fine, and
was proven live during `T-WA-06`'s verification).

The `GET /pipelines` and `GET /pipelines/:id` read handlers only ever
`select("*")` from `pipelines` with no join to `pipeline_steps` either, so
even if a pipeline row existed, its `steps` would always read back empty —
a second, related read-path bug, out of scope for this write-only phase
(plan DD-5) and not filed separately since no pipeline can currently be
created to observe it on.

## Impact

**No pipeline can ever be created or have its steps edited.** The entire
Pipelines feature — chaining agents, the "Draft with Manager" flow in
`manager-chat-panel.tsx` (`draftToCreatePayload` → `createPipeline`/now
`createPipelineAction`) — is non-functional. Anyone who reaches this dialog
sees a confusing internal-sounding Postgres error instead of their pipeline
being created.

## Resolution

*Open. Needs the `pipeline_steps` table wired into both the write path
(insert/replace the step rows in the same transaction as the `pipelines`
row/update) and the read path (join or a second query in `GET /pipelines`
and `GET /pipelines/:id`). Both handlers currently assume a `steps` JSON
column that doesn't exist in the schema.*
