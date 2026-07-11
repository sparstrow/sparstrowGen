# Workflows

How the Sparstrowgen factory operates — the repeatable loops for working between the human,
Claude, agy, and (eventually) Sparstrowgen's own in-app agents.

Each workflow is documented in **three parts**, the dual-track model:

- **The Process** — how the human + Claude/agy run it *today*, in this repo (the runbook).
- **The Product** — the Sparstrowgen features needed to run the same workflow *in-app*
  (feeds the build board in [`../../.design-src/APP.md`](../../.design-src/APP.md)).
- **The Agents** — portable `SKILL.md` definitions + prompts for the agents that execute the
  workflow, each with its trigger (cron / task / pipeline). Designed here → imported into
  Sparstrowgen later.

The Process is the prototype; the Product is the proven process, productized. The Agents
section is the bridge — the same prompt is how Claude behaves now *and* the agent deployed later.

> Doc organization is provisional and will be revisited as more workflows are added.

## Catalog

| Workflow | Status | Covers |
|---|---|---|
| [Refinement & Feedback](./refinement-and-feedback.md) | 🔒 locked 2026-07-10 | Capturing issues/refinements/ideas found while using the app — faithfully, capture-only. Feedback log: [`../feedback/`](../feedback/). |

_(More workflows — phase build, agent delegation, doc/board sync, branch hygiene, investigate,
ship — to be logged as we walk the remaining scenarios.)_
