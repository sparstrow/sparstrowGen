# T-WA-06 — runs, schedule, pipelines

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; `useCreateRun` is also called from `work-launcher.tsx` in T-WA-04 |
| **Serves** | **foundational** — three execution surfaces |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except G-42 2026-08-25 |

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

- [x] `app/runs/actions.ts` — `createRunAction`, `cancelRunAction`
- [x] `app/schedule/actions.ts` — create, update, delete
- [x] `app/pipelines/actions.ts` — create, update, delete
- [x] `useRunPipeline` and `useRunCronJobNow` untouched
- [x] `useCreateRun` deleted from `hooks.ts` — the "two consumers in two tasks" trap below turned out to be stale (see Result): `work-launcher.tsx` never called `useCreateRun`, only `runs.tsx` did, so nothing blocked its removal
- [x] `useCreatePipeline` kept in `hooks.ts` — real, unconverted consumer in `components/team/manager-chat-panel.tsx` (not in any WA task's file list); removed a dead import of it from `team-detail.tsx` (grep-before-delete precedent from `T-WA-04`)
- [x] Delete the other converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, queries stay
- [x] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [x] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [x] `apps/web` typecheck and tests green

## Traps

**`useCreateRun` has two consumers in two different tasks — stale.** This
task file said `runs.tsx` here and `work-launcher.tsx` in T-WA-04, but by the
time this task ran, `work-launcher.tsx` had no reference to `useCreateRun` at
all (its `TaskMode` dispatches through `runTaskAction`, a different code
path). A grep across `apps/web/src` before deleting confirmed `runs.tsx` was
the only consumer, so the hook was deleted outright — no coordination with
another task was actually needed.

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

- [x] `grep -rn "useCreateCronJob\|useUpdateCronJob\|useDeleteCronJob\|useUpdatePipeline\|useDeletePipeline\|useCreateRun\b\|useCancelRun" apps/web/src` returns nothing (`useCreatePipeline` deliberately excluded — real consumer in `manager-chat-panel.tsx`, see Checklist)
- [~] Start a run and cancel it: the run reaches `cancelled` and the transcript still streams up to that point — **partially verified, see `G-42`**: `createRunAction` proven live end-to-end (agent picked, prompt submitted, reached `start_run`, got back the exact "No machine is online that can run claude-code." message); `cancelRunAction` could not be reached live because no daemon is paired in this environment, so no run ever gets far enough to exist. Verified via unit test instead (success path + RPC-failure mapping)
- [x] Create and delete a cron job; the schedule list is correct without a manual refresh — live: created "WA06 Test Job", toggled its enabled switch off (confirmed via reload), deleted it (confirmed gone via reload)
- [~] Create a pipeline, edit it, delete it — **blocked, see `G-42`**: creating any pipeline 400s — `BUG-2026-08-25-creating-a-pipeline-always-400s` (pre-existing, found during this verification) — so no pipeline row ever exists to edit or delete through the UI either. All three (create, edit, delete) verified via unit test instead; the cron-job equivalents of edit and delete (structurally identical CRUD) were proven live via `schedule.tsx`
- [x] `pnpm typecheck` and `pnpm test` green — 387 tests (372 existing + 15 new: `app/runs/actions.test.ts`, `app/schedule/actions.test.ts`, `app/pipelines/actions.test.ts`)
- [x] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1` for the eight converted sites — confirmed for the two exercised live (run creation, cron job create/update/delete); the rest follow from the grep above finding no hook call sites left
- [x] Every converted button disables itself while its action is in flight — `useTransition`-backed `pending`/`disabled` wiring matches the phase's established pattern throughout

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table

## Result

Converted `createRunAction`/`cancelRunAction` in `apps/web/src/app/runs/actions.ts`,
`createCronJobAction`/`updateCronJobAction`/`deleteCronJobAction` in
`apps/web/src/app/schedule/actions.ts`, and `createPipelineAction`/
`updatePipelineAction`/`deletePipelineAction` in
`apps/web/src/app/pipelines/actions.ts`. All four listed files converted
(`runs.tsx`, `run-detail.tsx`, `schedule.tsx`, `pipelines.tsx`);
`useRunPipeline`/`useRunCronJobNow` left untouched (stub-backed, plan DD-6).

**The task file's own "two consumers" trap for `useCreateRun` was stale.** A
grep across `apps/web/src` found only `runs.tsx` calling it —
`work-launcher.tsx` (T-WA-04) dispatches runs through `runTaskAction`, a
different path entirely, and never called `useCreateRun`. Deleted the hook
outright rather than waiting on a coordination that wasn't actually needed.

**`useCreatePipeline` could not be fully deleted**, unlike its sibling
`useUpdatePipeline`/`useDeletePipeline`. `manager-chat-panel.tsx` (the "Draft
with Manager" flow) is a real, still-unconverted consumer, and it isn't
listed in any WA task's file scope — same shape as `T-WA-04` leaving
`useUpdateTask` in place for `blocked-project-actions.tsx`. Only `pipelines.tsx`'s
own call site converted; the hook stays in `hooks.ts` for the other. Also
removed one dead `useCreatePipeline` import from `team-detail.tsx` (imported,
never called), per the grep-before-delete precedent.

**One new pre-existing bug found while verifying live:**
[`BUG-2026-08-25-creating-a-pipeline-always-400s`](../../bug/BUG-2026-08-25-creating-a-pipeline-always-400s.md)
— `pipelines` has no `steps` column (they live in an unwired `pipeline_steps`
table), so every pipeline create/full-edit 400s with a PostgREST
unknown-column error. This is not a T-WA-06 regression: the original
`POST /pipelines` handler had the exact same bug, and this task moved it
verbatim per plan Scope boundaries. It blocked live verification of pipeline
create/edit/delete; the `enabled`-only update path isn't affected by it in
principle, but no pipeline row could be created to actually toggle either.

Live-verified end to end against a fresh disposable workspace
(`wa06-*@sparstrow.test`, needs the same manual SQL cleanup as the three
prior WA tasks' disposable accounts — blocked by the sandbox's
destructive-action classifier, flagged to the owner, not re-attempted):
- Created an agent, then a run against it — reached `createRunAction` →
  `start_run`, got back the exact expected "No machine is online that can
  run claude-code." message (no daemon paired here).
- Created, toggled (disabled), and deleted a cron job — each step confirmed
  via a full page reload, not just optimistic UI state.
- Attempted to create a pipeline — reproduced
  `BUG-2026-08-25-creating-a-pipeline-always-400s` live, confirming the bug
  report's diagnosis rather than just theorizing it from reading the schema.

`cancelRunAction` (needs a real in-flight run; none exists without a paired
daemon) and pipeline create/edit/delete (blocked by the bug above) could not
be exercised live — see `G-42` for what backs them instead (15 new unit
tests across three new `actions.test.ts` files, including a regression test
reproducing the pipeline bug's exact failure shape).
