# T-M2-05 — Handlers: work (tasks, goals, messages, attention queue)

| | |
|---|---|
| **Tag** | `[P]` parallel with T-M2-04, T-M2-06 |
| **Depends on** | T-M2-03 |
| **Blocks** | T-M2-08 |
| **Phase spec** | [M2/README.md](README.md) |
| **Status** | queued |

## Objective

The board itself: tasks, their questions, goals and plan graphs, the inbox, and
the composed attention queue.

## Endpoints

```
GET/POST        /tasks
GET/PATCH/DEL   /tasks/:id
POST            /tasks/:id/answer · /tasks/:id/approve · /tasks/:id/deny
GET             /tasks/attention/queue

GET/POST        /goals
GET/PATCH/DEL   /goals/:id
GET/PATCH       /goals/:id/nodes/:nodeId

GET             /messages
POST            /messages/:id/mark-read
```

`POST /tasks/:id/run` and `POST /goals` (which triggers a planner run) are **not**
here — they need a paired runtime and land in M4. T-M2-07 stubs them 501.

## Decisions already made

- **Task status uses the local vocabulary**, which M1 adopted for the cloud:
  `inbox` · `todo` · `in_progress` · `review` · `done` · `failed` · `blocked` ·
  `blocked_answered` · `pending_approval` · `waiting_children`, plus the
  cloud-only `project_not_available`. The old `backlog`/`todo`/`review` trio is
  gone — it silently dropped `blocked` and `waiting_children`, which the P3
  delegation state machine depends on.
- **`/tasks/:id/answer` writes the answer only.** Applying an answer wakes a
  suspended run, which requires a daemon. Write `task_questions.answer` and
  `answered_at`, leave `applied_at` null, and return
  `{ applied: false, reason: "no runtime paired" }`. The UI already handles this
  shape — see the `deferred` branch in `attention-queue.tsx`.

## Checklist

- [x] `apps/web/src/lib/api/handlers/tasks.ts`
- [x] `apps/web/src/lib/api/handlers/goals.ts`
- [x] `apps/web/src/lib/api/handlers/messages.ts`
- [x] Register all three in `handlers/index.ts`
- [x] `GET /tasks` honours the `status`, `assignedAgentId`, `teamId`, `projectId`
      query filters the hooks already send
- [x] `/tasks/:id/approve` and `/deny` move `pending_approval` → `todo` /
      `failed` respectively
- [x] `GET /goals/:id` returns `GoalDetail`: the goal, its `plan_nodes` and
      `plan_edges` **at the current `plan_version` only**, and each node's linked
      task. Node status is derived from that task — `plan_nodes` has no status
      column by design (EM4).
- [x] `/messages/:id/mark-read` sets `status = 'read'`

## The attention queue

`GET /tasks/attention/queue` is a composed read, not a table. It must return the
`AttentionRow[]` shape `packages/ui/src/components/attention-queue.tsx` already
consumes — four row kinds:

- [x] **question** — tasks with unanswered `task_questions`, each row carrying
      the task, its open questions, and `ageMs`
- [x] **approval** — tasks in `pending_approval`
- [x] **review** — tasks in `review`
- [x] **contradiction** — unresolved `memory_contradictions` (the `task: null`
      variant; the component already branches on this)
- [x] Sorted oldest-first; `ageMs` computed server-side so the client does no
      clock maths

## Verification

- [ ] `pnpm --filter web typecheck` passes
- [ ] `/tasks` renders the board with real or empty columns
- [ ] `/messages` renders the inbox; mark-read persists across reload
- [ ] The dashboard attention queue renders all four row kinds without a client
      exception — seed one of each in staging to prove it
- [ ] Answering a blocked task's question stores the answer and surfaces the
      "answer saved, run still active" state rather than appearing to fail
- [ ] `GET /goals/:id` returns only current-version nodes and edges
