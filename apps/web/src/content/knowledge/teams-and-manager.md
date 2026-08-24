---
title: Teams & the Manager Agent
section: Surfaces
description: Group agents into teams, work in a team workspace, and let the Manager Agent draft pipelines for you.
order: 3
updated: 2026-07-13
---

A **team** groups agents so you can organize work around a mission ("release crew",
"research pod") and assign the group to projects. Teams organize; they don't own — a
team's tasks, pipelines, and schedules are ordinary global items *filtered* to the team,
never a separate copy.

## The team workspace (`Teams → open a team`)

Four tabs, each a filtered view of the matching global surface:

- **Tasks** — the team's slice of the Task Board.
- **Pipelines** — pipelines scoped to this team.
- **Schedules** — cron jobs scoped to this team.
- **Members** — which agents belong, and which projects the team is assigned to.

Because these are the *same* components as the global pages, anything you learn there
applies here 1:1.

## The Manager Agent

Every team has a built-in **Manager** chat (toggleable in Settings). It has two modes:

1. **Advisor** — ask it anything about the team: who's on it, what's been running,
   what's blocked. It answers from the roster, team activity, and memory.
2. **Draft a workflow** — describe a multi-step job in plain words and the Manager
   drafts a pipeline using the team's own agents. The draft is *never saved directly*:

```
you describe → Manager drafts → "Edit in canvas" → you adjust steps → Publish
                                                    (only publishing creates the pipeline)
```

The canvas lets you re-order steps, swap agents, and edit per-step prompts — or switch
to the equivalent keyboard-friendly **list view**; both edit the same draft. If the
Manager names an agent that doesn't exist, the step is marked for fix-up rather than
failing.

## Notes & limitations

- Draft pipelines are linear in v1 — steps run one after another (branching lives in
  [Goals](/knowledge/tasks-and-goals)).
- **Ephemeral teams** (created automatically when a task is multi-assigned) appear in a
  slim read-only view — they're a run-grouping artifact, not something you manage.
