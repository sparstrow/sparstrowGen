---
title: Tasks & Goals
section: Surfaces
description: The task board lifecycle, answering blocked agents, and LLM-planned goal graphs.
order: 5
updated: 2026-07-13
---

## Tasks — the unit of work

The **Task Board** is a kanban of everything the factory is doing. Create a task,
describe the work, assign an agent — assignment spawns a run.

```
created ──▶ assigned ──▶ running ──▶ done
                            │
                            ▼ (agent has a question)
                         blocked ──▶ you answer ──▶ running again
```

The key state is **blocked**: instead of guessing, an agent pauses and escalates its
question to the Dashboard attention queue. Your answer is delivered into the run and it
continues — the agent never loses its place.

Multi-assigning a task to several agents automatically groups them as an ephemeral team
so their runs are traceable as one effort.

## Goals — planned task graphs

For work too big for one task, create a **Goal**. A planner agent decomposes it into a
**graph of tasks with dependencies** (not just a list — parallel branches where possible,
join points where necessary):

```
            ┌─▶ task B ─┐
goal ─▶ A ──┤           ├─▶ D (waits for B and C)
            └─▶ task C ─┘
```

- A reviewer agent (and you, at the consensus gate) checks the plan before it executes.
- The goal page shows the **live node graph** — each node colored by status, so you can
  watch the wave of work move left to right.
- If reality diverges, the goal can **replan**: finished work is carried forward,
  only the remaining graph is redrawn.
- Failed branches retry within caps; a goal never loops forever.

Goal detail lives under the Task Board (`Tasks → open a goal`).

## Notes & limitations

- Plans come from a model — treat the consensus gate as a real review, not a
  rubber stamp. Bad plans are cheapest to fix before the first node runs.
- Replans and retries are capped; a goal that keeps failing stops and waits for you
  rather than burning tokens.
