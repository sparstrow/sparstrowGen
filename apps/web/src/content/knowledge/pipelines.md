---
title: Pipelines
section: Surfaces
description: Chain agents into multi-step workflows with output piped between steps.
order: 9
updated: 2026-07-13
---

A **pipeline** is a saved, repeatable chain of agent steps. Each step names an agent and
a prompt; a step's prompt can reference the previous step's output with `{{input}}`:

```
Step 1: Researcher  → "Summarize today's changes in project X"
Step 2: Writer      → "Turn this into a changelog entry: {{input}}"
Step 3: Reviewer    → "Check this changelog for accuracy: {{input}}"
```

Run it manually from the Pipelines page, or attach it to a cron job in
[Schedule](/knowledge/schedule) to make it fully automatic.

## Building pipelines

Two ways:

1. **By hand** — create a pipeline, add steps, pick an agent and write a prompt per step.
2. **Draft with the Manager** — inside a team, describe the workflow in plain words and
   the team's Manager Agent drafts the steps for you; you review on the **canvas** (or
   the equivalent list view) and hit **Publish**. Nothing exists until you publish.
   See [Teams & the Manager Agent](/knowledge/teams-and-manager).

The canvas and list views edit the same draft — use whichever fits, including fully via
keyboard.

## Notes & limitations

- Pipelines are **linear** in v1 — steps run strictly in order. For branching/parallel
  work, use [Goals](/knowledge/tasks-and-goals).
- `{{input}}` carries the previous step's final text output — not files or structured
  data. Steps that need files should read them from the project.
- Every step is a normal run: it appears in [Runs](/knowledge/runs-and-transcripts)
  with cost and provenance, and each step's agent runs under its own tool policy.
- A pipeline saved to a team stays scoped to that team's workspace; pipelines created
  from the global page are global.
