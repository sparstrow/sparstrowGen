# doc/

Working memory for the project. Everything that isn't code but needs to survive
a session lives here.

```
doc/
├── plans/                    approved plans — the "what and why"
├── tasks/                    executable specs — the "how"
│   ├── MasterTaskQueue.md    global run order + concurrency tags
│   └── <phase>/              phase spec + individual tasks
├── OpenQuestions.md          decisions waiting on the owner
├── Deferred.md               agreed to build, explicitly parked
└── Ideas.md                  unscoped — might never be built
```

## Lifecycle

```
idea ──────────────► Ideas.md
  │
  │ (owner picks it up)
  ▼
plan ──────────────► doc/plans/<date>-<slug>.md
  │                  open decisions go to OpenQuestions.md until answered
  │ (owner approves)
  ▼
task ──────────────► doc/tasks/<milestone>-<slug>.md
  │                  MUST contain zero open questions
  ▼
code ──────────────► anything parked mid-flight goes to Deferred.md
```

## The rule that matters

**A task document must be executable without asking the owner anything.** Every
decision it needs is either already made in its plan, or made and recorded inside
the task itself.

This is the whole point of splitting plans from tasks: plans are where
uncertainty is allowed, tasks are where it isn't.

### One blocked piece doesn't stop the task

If converting a plan into tasks surfaces a genuine question, it goes to
`OpenQuestions.md` — and **only the checklist item that depends on it waits**:

```markdown
- [x] Batch writes to Postgres
- [~] Auto-commit dirty tree before yielding   ← blocked → OQ-1
- [x] Replay buffer oldest-seq first
```

Everything else in that task still gets built and ticked off. The task is
reported as **done except OQ-1** — a real, closeable state, not a stalled one.
One missing piece must not stop the plate being served.

When the question is answered: unblock the item, finish it, and delete the entry
from `OpenQuestions.md`.

## Which file does this go in?

| Situation | File |
|---|---|
| "Let's do that later" | `Deferred.md` |
| "I'm not answering that right now" | `OpenQuestions.md` |
| "Might be nice one day" | `Ideas.md` |
| "Here's what we're building and why" | `plans/` |
| "Here's exactly how, step by step" | `tasks/` |

## Open questions must carry options

Per `AGENTS.md` §8, every entry in `OpenQuestions.md` needs full context, a
plain user-side scenario, and concrete options. Each option carries:

- Pros and cons
- Score out of 10
- Blast radius if chosen wrong
- Caveats
- The agent's recommendation

A question with no options is not ready to be asked.

## Answered questions

When an open question gets resolved — including implicitly, because a later
decision settles it — the answer is recorded in the plan or task that consumed
it and **the entry is deleted from `OpenQuestions.md`**. That file only ever
holds what is still open, so its length is a real signal.
