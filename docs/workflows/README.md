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

## Unified front, divergent back

Everything you bring is captured the same way, then routed differently:

```
                             ┌─ feedback ──────▶ Investigate ─▶ fix
 you ─▶ Listener (capture) ─▶ intake ─┼─ new-feature/concept ─▶ Reviewers (CEO·eng·design·dx) ─▶ plan ─▶ build
        one agent, mode-driven  (one pool) ├─ design (HTML) ────▶ decode ─▶ SPEC ─▶ review ─▶ build
                             └─ feature-change ─▶ review ─▶ build
```

- **Shared front** — one [Listener](./agents/listener.md) (mode-driven), one capture format +
  pool ([`../intake/`](../intake/)). Capture is *never* analysis: no code, no judgment, no fix;
  blind-spot suggestions only when you ask.
- **Divergent back** — each category routes into its own workflow (a doc below). In
  Sparstrowgen this is one `captures` table + per-category triggers (a task for feedback, a
  reviewer **pipeline+team** for features — the P10 primitives).

## Shared components

| Component | Where |
|---|---|
| Listener (capture agent, all modes) | [`agents/listener.md`](./agents/listener.md) |
| Capture format + lifecycle + pool | [`../intake/`](../intake/) |
| Reviewer agents (our CEO/eng/design/dx) | `agents/` — _to author_ (extract from gstack copies in `data/skill-imports/`) |
| Investigator agent | `agents/` — _to author_ |

## Catalog

| Workflow | Category | Status | Downstream |
|---|---|---|---|
| [Feedback](./feedback.md) | `feedback` | 🔒 locked 2026-07-11 | → Investigate → fix |
| _New feature_ | `new-feature` | ⬜ to design | → Reviewers → plan → build |
| _New concept_ | `new-concept` | ⬜ to design | → Reviewers → north-star/plan |
| _New design (HTML)_ | `design` | ⬜ to design | → decode → SPEC → review → build |
| _Feature change_ | `feature-change` | ⬜ to design | → review → build |

> Doc organization is provisional and will be revisited as more workflows land.
> Final step (after all workflows are locked): wire enforcement — `CLAUDE.md` routing +
> a slash-command skill per workflow (e.g. `/capture`).
