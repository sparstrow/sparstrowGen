# T-WA-06 — runs, schedule, pipelines

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; `useCreateRun` is also called from `work-launcher.tsx` in T-WA-04 |
| **Serves** | **foundational** — three execution surfaces |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Convert run creation and cancellation, the cron job CRUD, and the pipeline
CRUD. Grouped because all three are execution-shaped surfaces whose handlers
sit together, and because two of the ten sites are stub-backed for the same
reason.

## Files and call sites

| File | Mutation hooks it calls |
|---|---|
| [`app/runs/runs.tsx`](../../../apps/web/src/app/runs/runs.tsx) | `useCreateRun` |
| [`app/runs/[runId]/run-detail.tsx`](../../../apps/web/src/app/runs/[runId]/run-detail.tsx) | `useCancelRun` |
| [`app/schedule/schedule.tsx`](../../../apps/web/src/app/schedule/schedule.tsx) | `useCreateCronJob`, `useUpdateCronJob`, `useDeleteCronJob`, `useRunCronJobNow` |
| [`app/pipelines/pipelines.tsx`](../../../apps/web/src/app/pipelines/pipelines.tsx) | `useCreatePipeline`, `useUpdatePipeline`, `useDeletePipeline`, `useRunPipeline` |

## Decisions already made

### `useRunPipeline` and `useRunCronJobNow` are stub-backed and do not convert

`POST /pipelines/:id/run` and `POST /cron-jobs/:id/run-now` are 501 stubs, each
described in [`stubs.ts`](../../../apps/web/src/lib/api/handlers/stubs.ts) as
"a multi-step orchestration with its own progress model". Plan DD-6 excludes
them. **Eight sites convert, not ten.**

### `useCreateRun` and `useCancelRun` are real, despite sitting next to stubs

`stubs.ts` is explicit: *"`POST /runs`, `POST /runs/:id/cancel` and
`POST /tasks/:id/run` are NOT here any more — M4 serves them from
handlers/runs.ts and handlers/tasks.ts."* Convert both.

## Checklist

- [ ] `app/runs/actions.ts` — `createRunAction`, `cancelRunAction`
- [ ] `app/schedule/actions.ts` — create, update, delete
- [ ] `app/pipelines/actions.ts` — create, update, delete
- [ ] `useRunPipeline` and `useRunCronJobNow` untouched
- [ ] `useCreateRun` **not** deleted from `hooks.ts` until `work-launcher.tsx` (T-WA-04) is also converted
- [ ] Delete the other converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, queries stay
- [ ] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [ ] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [ ] `apps/web` typecheck and tests green

## Traps

**`useCreateRun` has two consumers in two different tasks.** `runs.tsx` here,
`work-launcher.tsx` in T-WA-04. Whichever lands second deletes the hook. This
is the pair the phase README's shared trap was written for.

**A run's interesting content arrives over a broadcast channel, not over this
action.** `run-detail.tsx` subscribes to run events. `revalidatePath` does very
little for it — the cancel action must still return its result so the button's
own state updates, and the transcript keeps arriving the way it already does.
**Do not attempt to route the transcript through the action**; that is
`apps/web/CLAUDE.md`'s streaming exception, and Server Actions do not stream.

**`T-M11-02` and `T-M11-03` verified this surface live** — a real dispatched
run, cloud/local `run_events` counts matching 3/3 and 13/13, and four specific
failure messages. Changing any of those messages changes a verified result;
read those tasks' Result sections before touching the text.

**The shared traps in [README.md](README.md) apply** and are not repeated here.

## Verification

- [ ] `grep -rn "useCreateCronJob\|useUpdateCronJob\|useDeleteCronJob\|useCreatePipeline\|useUpdatePipeline\|useDeletePipeline\|useCancelRun" apps/web/src` returns nothing
- [ ] Start a run and cancel it: the run reaches `cancelled` and the transcript still streams up to that point
- [ ] Create and delete a cron job; the schedule list is correct without a manual refresh
- [ ] Create a pipeline, edit it, delete it
- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1` for the eight converted sites
- [ ] Every converted button disables itself while its action is in flight

## On completion

- [ ] Tick 22.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands.*
