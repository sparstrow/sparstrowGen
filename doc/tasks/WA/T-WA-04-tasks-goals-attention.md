# T-WA-04 — tasks, goals, attention

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; `useCreateTask` is called from two files inside this same task |
| **Serves** | **foundational** — the board, goals, and the attention queue |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `app/tasks/actions.ts` — create, update, delete, run, answer, approve, deny
- [ ] `app/tasks/goals/[goalId]/actions.ts` — cancel goal, cancel node, retry node
- [ ] All four files call the actions under `useTransition`
- [ ] `useCreateGoal` left untouched
- [ ] Delete the converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, queries stay
- [ ] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [ ] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [ ] `apps/web` typecheck and tests green

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

- [ ] `grep -rn "useCreateTask\|useUpdateTask\|useDeleteTask\|useRunTask\|useCancelGoal\|useCancelNode\|useRetryNode\|useAnswerTask\|useApproveTask\|useDenyTask" apps/web/src` returns nothing
- [ ] Answer a question in the attention queue; the row clears on every surface that shows it
- [ ] Invoke `approveTaskAction` with no session and confirm it refuses rather than proceeding
- [ ] Run a task from the board; it dispatches exactly as before
- [ ] Cancel a goal node and retry it; both still work
- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1/tasks` or `/api/v1/goals/*`
- [ ] Every converted button disables itself while its action is in flight

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands.*
