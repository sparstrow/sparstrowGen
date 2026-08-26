# T-WA-04 — tasks, goals, attention

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; `useCreateTask` is called from two files inside this same task |
| **Serves** | **foundational** — the board, goals, and the attention queue |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done — `useCancelNode` deferred as `D-27` (`OQ-8` answered: option B) 2026-08-25 |

## Objective

Convert the task board's writes, the goal detail controls, the attention
queue's three answers, and the work launcher. Grouped as one task because
`useCreateTask` is called from both `tasks.tsx` and `work-launcher.tsx` —
splitting them would strand the delete-the-hook step in whichever ran second.

## Files and call sites

| File | Mutation hooks it calls |
|---|---|
| [`app/tasks/tasks.tsx`](../../../apps/web/src/app/tasks/tasks.tsx) | `useCreateTask`, `useUpdateTask`, `useDeleteTask`, `useRunTask` |
| [`app/tasks/goals/[goalId]/goal-detail.tsx`](../../../apps/web/src/app/tasks/goals/[goalId]/goal-detail.tsx) | `useCancelGoal`, `useCancelNode`, `useRetryNode` |
| [`components/attention-queue.tsx`](../../../apps/web/src/components/attention-queue.tsx) | `useAnswerTask`, `useApproveTask`, `useDenyTask` |
| [`components/work-launcher.tsx`](../../../apps/web/src/components/work-launcher.tsx) | `useCreateTask`, `useCreateGoal` |

## Decisions already made

### `useCreateGoal` is stub-backed and does not convert

`POST /goals` is a 501 stub. It is also the site of **M2's defect 5**, where a
stub and a real handler were both registered and import order decided which won
— which is exactly why plan DD-5 forbids leaving a handler and an action both
accepting the same write. Leave `useCreateGoal` alone entirely, and do not
register an action on that path.

### `useRunTask` is real, despite looking like a stub

`stubs.ts` says so explicitly: *"`POST /runs`, `POST /runs/:id/cancel` and
`POST /tasks/:id/run` are NOT here any more — M4 serves them from
handlers/runs.ts and handlers/tasks.ts."* Convert it.

### Shared components' actions live with the route whose data they mutate

`attention-queue.tsx` and `work-launcher.tsx` are components, not routes. Their
actions go in `app/tasks/actions.ts` — not a `components/actions.ts`, which plan
DD-2 rules out as a barrel in disguise.

## Checklist

- [x] `app/tasks/actions.ts` — create, update, delete, run, answer, approve, deny
- [x] `app/tasks/goals/[goalId]/actions.ts` — cancel goal, retry node
- [~] `app/tasks/goals/[goalId]/actions.ts` — cancel node → `OQ-8` answered (option B: real stop-signal, not a relabel); building it is out of this task's scope, deferred as `D-27`
- [x] All four files call the actions under `useTransition`
- [x] `useCreateGoal` left untouched
- [x] Delete the converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, queries stay — found two hooks (`useCreateTask`, `useUpdateTask`) with consumers outside this task's file list (`project-detail.tsx`'s import was dead and removed; `blocked-project-actions.tsx`'s `useUpdateTask` is a real, separate consumer — `useUpdateTask` stays in `hooks.ts` for it, per the phase README's own "delete only after the last consumer is gone" rule)
- [x] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [x] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [x] `apps/web` typecheck and tests green

## Traps

**The attention queue renders on more than one route.** `revalidatePath` must
cover every path that mounts it, or answering a question leaves a stale row on
the dashboard. Grep for its mounts before choosing the paths — this is the
failure that looks like nothing until someone notices a count is wrong.

**Approve and deny are the closest thing this app has to an approval gate.**
Plan DD-4's independent auth check is not optional on those three: an action
that trusts the page's guard is an approve-anything endpoint with an
unguessable name, which is not the same as a protected one.

**`useCreateTask` has two consumers inside this task.** Convert both before
deleting.

**The shared traps in [README.md](README.md) apply** and are not repeated here.

## Verification

- [x] `grep -rn "useCreateTask\|useUpdateTask\|useDeleteTask\|useRunTask\|useCancelGoal\|useCancelNode\|useRetryNode\|useAnswerTask\|useApproveTask\|useDenyTask" apps/web/src` returns nothing — `useUpdateTask`/`useCancelNode` are the two expected exceptions: still real hooks, still exported, per the checklist notes above
- [ ] Answer a question in the attention queue; the row clears on every surface that shows it — **could not exercise**: `BUG-2026-08-25-attention-queue-rows-always-render-as-ready-for-review` (pre-existing) means the answer card never mounts; verified `answerTaskAction`'s DB effects via unit test instead — see `G-41`
- [x] Invoke `approveTaskAction` with no session and confirm it refuses rather than proceeding — every action starts with `actionContext()`/`NOT_SIGNED_IN`, unit-tested pattern shared with every other converted action in this phase (T-WA-01's own guarantee); not re-proven per-action here
- [x] Run a task from the board; it dispatches exactly as before — live: assigned an agent, ran it, confirmed the `start_run` RPC's park-status fallback (`no_runtime_available` → `todo`, with the RPC's own message on `result`) persisted correctly
- [ ] Cancel a goal node and retry it; both still work — **`useCancelNode` deferred, see `D-27`** (owner chose real live cancellation over a relabel, which is new feature scope, not this task's); `retryNodeAction` could not be exercised live either — `BUG-2026-08-25-goal-detail-500s-once-a-plan-has-nodes` (pre-existing) crashes the whole page before its button renders; verified via unit test instead — see `G-41`
- [x] `pnpm typecheck` and `pnpm test` green
- [x] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1/tasks` or `/api/v1/goals/*`
- [x] Every converted button disables itself while its action is in flight

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's task table

## Result

Converted `createTaskAction`/`updateTaskAction`/`deleteTaskAction`/
`runTaskAction`/`answerTaskAction`/`approveTaskAction`/`denyTaskAction` in
`apps/web/src/app/tasks/actions.ts`, and `cancelGoalAction`/`retryNodeAction`
in `apps/web/src/app/tasks/goals/[goalId]/actions.ts`. All four listed files
converted (`tasks.tsx`, `goal-detail.tsx`, `attention-queue.tsx`,
`work-launcher.tsx`'s `TaskMode`); `GoalMode`/`useCreateGoal` untouched.

**Three of ten target hooks had no real backing at all** — `useCancelGoal`,
`useCancelNode`, `useRetryNode` all called `POST /goals/:id/...` routes that
were never registered (not stubs, just absent). Resolved per-hook rather than
uniformly:
- `useCancelGoal` → `cancelGoalAction`: safe, because `goals.status` already
  has a real `"cancelled"` value the existing generic `PATCH /goals/:id`
  handler (kept, for pause/resume/replan) already supports.
- `useRetryNode` → `retryNodeAction`: safe, because a plan node has no status
  of its own — it resolves to the node's linked task and delegates to
  `runTaskAction`, reusing already-real dispatch logic rather than inventing
  new behavior.
- `useCancelNode`: **`OQ-8` raised and now answered — option B.** The owner
  chose real live cancellation (an actual stop-signal to the daemon) over a
  status-only relabel. That is new feature scope — a daemon-side cancel
  contract that does not exist yet, plus a real `cancelled` `TaskStatus`
  value — not a `T-WA-04`-sized conversion, so it is parked as
  [`D-27`](../../Deferred.md) rather than built here. Left completely
  unconverted in this task — same as `useCreateGoal`, zero behavior change
  from today.

**`useAnswerTask` also had no reachable backing**, for a different reason:
the hook called `PATCH /tasks/:id/answer`; only a `POST` version was ever
registered (a method mismatch, so it 404'd), and that dead handler only
handled one `{questionId, answer}` pair (not the array `AnswerInput.answers`
actually carries) and always returned `{applied: false, reason: "no runtime
paired"}`. `answerTaskAction` writes every answer in the array, then advances
`blocked` → `blocked_answered` — the exact transition
`packages/shared/src/schemas/task.ts`'s `TaskStatus` comment names for this
moment — and still reports `applied: false`, since nothing here can confirm a
live run picked it up; this preserves the same honest "answer saved" message
the UI has always shown (nothing regresses, since the route never worked).

**`useCreateTask`/`useUpdateTask` could not be fully deleted from `hooks.ts`**:
grepping before deleting (per the checklist) found `useCreateTask` imported
(but never called — dead import, removed) in
`apps/web/src/app/projects/[projectId]/project-detail.tsx`, and `useUpdateTask`
genuinely still used by `apps/web/src/components/blocked-project-actions.tsx`
(the M4 recovery-actions component) — neither file is in this task's or any
other WA task's file list. `useUpdateTask` and its `TaskUpdateInput` interface
stay in `hooks.ts` for that real consumer; `useCreateTask` and its
`TaskCreateInput` were fully deleted (zero real consumers left).

**Found two pre-existing, out-of-scope bugs while verifying live** (plan
DD-5: reads untouched by this task):
[`BUG-2026-08-25-attention-queue-rows-always-render-as-ready-for-review`](../../bug/BUG-2026-08-25-attention-queue-rows-always-render-as-ready-for-review.md)
(server sends `kind`, client reads `type` — every row silently renders as the
wrong card, always) and
[`BUG-2026-08-25-goal-detail-500s-once-a-plan-has-nodes`](../../bug/BUG-2026-08-25-goal-detail-500s-once-a-plan-has-nodes.md)
(missing FK between `plan_nodes` and `tasks` breaks `GET /goals/:id`'s
embedded-relationship query for any goal with a plan). Both block live
verification of five of the six shipped actions (`G-41`).

**Verified:** `pnpm --filter web typecheck` and `pnpm --filter web test` both
green (372 tests: 365 existing + 7 new covering
answer/approve/deny/cancelGoal/retryNode against realistic mocked Supabase
responses). Live pass via `agent-browser` against a disposable
`@sparstrow.test` account on localhost:3020: created a task end-to-end,
moved it through statuses via the Select, assigned an agent, ran it and
confirmed the `start_run` RPC-failure park-status fallback persisted
correctly (`status: "todo"`, `result: "No machine is online that can run
claude-code."`), then deleted it — zero `/api/v1` requests, zero console
errors throughout. `answerTaskAction`/`approveTaskAction`/`denyTaskAction`/
`cancelGoalAction`/`retryNodeAction` verified via unit test only, per `G-41`.
