# Workflows

How the Sparstrowgen factory operates — the repeatable loops for working between the human,
Claude, agy, and (eventually) Sparstrowgen's own in-app agents. We build our **own** agents
(capturer, reviewers, investigator); where existing tools are good, we *extract the method*
and re-author on our own infrastructure — we don't run them (they carry their own
memory/preamble/telemetry).

## The dual-track model

Every workflow is documented in three parts:
- **The Process** — how the human + Claude/agy run it *today*, in this repo (the runbook).
- **The Product** — the Sparstrowgen features to run the same workflow *in-app* (feeds the
  build board in [`../../.design-src/APP.md`](../../.design-src/APP.md)).
- **The Agents** — portable `SKILL.md` definitions + prompts, each with its trigger (cron /
  task / pipeline). Designed here → imported into Sparstrowgen later.

The Process is the prototype; the Product is the proven process, productized. The Agents
section is the bridge — the same prompt is *how Claude behaves now* and *the agent deployed
later*.

## Unified front, one gate, divergent back

Everything you bring is captured the same way, reviewed by the same gate, then routed
differently:

```
                                                         ┌─ routed ─▶ Investigate ─▶ fix           (feedback)
                                                         ├─ routed ─▶ plan ─▶ build                (new-feature/concept/design/feature-change)
 you ─▶ Listener (capture) ─▶ intake ─▶ Reviewer (lock) ─┤
        one agent, mode-driven   (one pool)  (analysis,  └─ gap ─▶ Pipeline Suggester ─▶ you build it
                                              proportional
                                              to the request)
                                                         └─ (memory-track modes) ─▶ Memory Archivist ─▶ vault
```

- **Shared front** — one [Listener](./agents/listener.md) (mode-driven), one capture format +
  pool ([`../intake/`](../intake/)). Capture is *never* analysis: no code, no judgment, no fix;
  blind-spot suggestions only when you ask.
- **One gate** — every capture, every mode, passes through the [Reviewer](./agents/reviewer.md)
  before it's "in progress." No standing CEO/eng/design/dx panel — effort is proportional to
  the request. See [Review & Routing](./review-and-routing.md) for the full state machine.
- **Divergent back** — each mode-family then routes into its own workflow (a doc below). In
  Sparstrowgen this is one `captures` table + per-family triggers.

## Shared components

| Component | Where |
|---|---|
| Listener (capture agent, all modes) | [`agents/listener.md`](./agents/listener.md) |
| Capture format + lifecycle + pool | [`../intake/`](../intake/) |
| Reviewer (analysis + routing gate, all modes) | [`agents/reviewer.md`](./agents/reviewer.md) |
| Pipeline Suggester (intake-track gap specialist) | [`agents/pipeline-suggester.md`](./agents/pipeline-suggester.md) |
| Memory Archivist (memory-track scope specialist) | [`agents/memory-archivist.md`](./agents/memory-archivist.md) |
| Investigator agent | `agents/` — _to author_ |

## Catalog

| Workflow | Category | Status | Downstream |
|---|---|---|---|
| [Feedback](./feedback.md) | `feedback` | 🔒 locked 2026-07-11 | Reviewer → Investigate → fix |
| _New feature_ | `new-feature` | ⬜ to design | Reviewer → routed/gap → plan → build |
| _New concept_ | `new-concept` | ⬜ to design | Reviewer → routed/gap → north-star/plan |
| _New design (HTML)_ | `design` | ⬜ to design | Reviewer → decode → SPEC → build |
| _Feature change_ | `feature-change` | ⬜ to design | Reviewer → routed/gap → build |
| _Decision / pitfall / lesson / meeting / architecture_ | memory-track | ⬜ to design | Reviewer → Memory Archivist → vault |
| [Review & Routing](./review-and-routing.md) | _cross-cutting_ | 🔒 locked 2026-07-12 | the gate every capture passes through |
| [Deferred scope](./deferred-scope.md) | _disposition_ | 🔒 locked 2026-07-11 | freezer → revive → intake |

_Review & Routing and Deferred Scope are cross-cutting, not capture ramps of their own — the
former sits between the Listener and every other workflow; the latter is fed by human
dream-plans, agent scope-cuts, **and** Reviewer gap outcomes you decide to park. Record:
[`../../DEFERRED_SCOPE.md`](../../DEFERRED_SCOPE.md)._

> Doc organization is provisional and will be revisited as more workflows land.
> Final step (after all workflows are locked): wire enforcement — `CLAUDE.md` routing +
> a slash-command skill per workflow (e.g. `/capture`).
