# BUG-2026-08-25-attention-queue-rows-always-render-as-ready-for-review

**Status:** 🟢 resolved
**Reported by:** agent — found while verifying `T-WA-04`'s Server Action conversion live
**Reported:** 2026-08-25

## Symptom

The Dashboard's "Human Attention Required" queue renders every row as a plain
"ready for review" link (`ReviewRow`), never as the question-answering card
(`QuestionCard`) or the approve/deny card (`ApprovalCard`) — regardless of
what actually caused the row. A blocked task with an open question and a
task pending cross-team approval both showed up identically, both labeled
"ready for review", both linking to `/tasks` with no way to answer or
approve/deny from the dashboard at all.

## Reproduction

1. Insert (or otherwise produce) a task with `status: "blocked"` plus an
   unanswered `task_questions` row, and a separate task with
   `status: "pending_approval"`.
2. Open `/` (Dashboard) signed in to the same workspace.
3. Both rows render as `ReviewRow` ("ready for review"), not as
   `QuestionCard`/`ApprovalCard`.

Reproduced live 2026-08-25 against two fixture tasks inserted directly (one
`blocked` + question, one `pending_approval`) in a fresh disposable workspace.

## Investigation

`GET /tasks/attention/queue`'s handler (`apps/web/src/lib/api/handlers/tasks.ts`)
builds every queue item with a `kind` field: `{kind: "question", ...}`,
`{kind: "approval", ...}`, `{kind: "review", ...}`, `{kind: "contradiction",
...}`. The client's `AttentionRow` type (`apps/web/src/api/hooks.ts`) declares
`type: AttentionRowType` instead — a **different field name**, never aliased
anywhere. `toCamel()` (which the route's `ok()` response runs) only
snake↔camel-cases existing keys; it does not rename `kind` to `type`. So
`row.type` is `undefined` for every row the API ever returns, and
`AttentionQueue`'s render switch
(`row.type === "contradiction" ? ... : row.type === "question" ? ... :
row.type === "approval" ? ... : <ReviewRow row={row} />`) falls through to the
unconditional final branch every time, for every row, regardless of `kind`.

This predates `T-WA-04` — neither the handler, the `AttentionRow` type, nor
the switch in `attention-queue.tsx` were touched by this task's conversion
(plan DD-5: writes only). `T-WA-04` converted `useAnswerTask`/
`useApproveTask`/`useDenyTask` to `answerTaskAction`/`approveTaskAction`/
`denyTaskAction`, all called from `QuestionCard`/`ApprovalCard` — components
that, because of this bug, have apparently never actually mounted in the
running app. Verified those three actions instead via unit tests
(`apps/web/src/app/tasks/actions.test.ts`) that call them directly, since the
live UI path to reach them is blocked by this bug.

## Impact

**High** — the entire point of the attention queue is answering blocked
questions and approving/denying cross-team spawns from one place; neither
has ever actually been reachable through it. Every row degrades to a bare
link back to `/tasks`, silently dropping the question text, the answer
composer, and the approve/deny controls. This has likely been broken since
the attention queue was first built (no code touched by any later task would
have caused it).

## Resolution

*Open. Fix: rename the handler's `kind` field to `type` (or add `type` as an
alias alongside `kind`) so the values `AttentionQueue`'s switch already checks
for actually arrive. Whichever task next touches `GET /tasks/attention/queue`
or `attention-queue.tsx` should close this before building anything else on
top of the queue — right now `QuestionCard` and `ApprovalCard` are unreachable
dead code in every real deployment.*
