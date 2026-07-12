# Workflow: Review & Routing

> **Status: 🔒 LOCKED 2026-07-12.** Cross-cutting — not its own capture ramp. Sits between the
> Listener and every mode-specific workflow: every capture, regardless of mode, passes through
> this before it's considered "in progress."

Shared foundation:
- Capture agent → [Listener](./agents/listener.md).
- Analysis + routing gate → [Curator](./agents/curator.md).
- Gap specialist (intake-track) → [Pipeline Suggester](./agents/pipeline-suggester.md).
- Gap specialist (memory-track) → [Memory Archivist](./agents/memory-archivist.md).
- Capture format + pool → [`../intake/`](../intake/).

---

## The Process

**Trigger:** immediately after any Listener capture — this is not something you invoke
separately.

1. The **Curator** runs an office-hours-style session, **proportional to the request** — a
   trivial capture gets a fast pass, a request that might overlap existing work gets real
   dialogue. It checks existing memory/docs via `memory_search` (Track A: reads the files
   directly — see the Curator doc's noted limitation), and for `pitfall` captures attempts
   attribution to a causing agent/run (deferred capability, see `DEFERRED_SCOPE.md`).
2. **Before locking**, the Curator produces a before/after summary — what the capture was
   filed as, and what it's determined to be now. Mode can change through the dialogue (e.g. a
   `new-concept` turns out to be additive to something that already exists → `feature-change`).
   **You confirm this summary before it locks.** Reclassification is never silent.
3. **Lock the plan.** `status: locked`.
4. **Pipeline-fit check** — does a workflow exist to carry this to completion?
   - **Intake-track modes** (feedback/new-feature/new-concept/design/feature-change):
     - exists → **routed**, proceeds into that real workflow.
     - doesn't → **gap** → **Pipeline Suggester** proposes extend-existing vs. build-new, with
       agents + workflow shape. You act on the proposal in the normal build loop.
   - **Memory-track modes** (decision/pitfall/lesson/meeting/architecture):
     - always → **Memory Archivist** (memory_save already exists; the question is scope, not
       existence) → proposes agent/project/global scope → you confirm → persisted.

No standing CEO/eng/design/dx panel runs by default (locked decision — token-expensive and
redundant for the common case, e.g. a button color change). Multi-perspective critique only
happens if Pipeline Suggester proposes it as a step for one specific pipeline.

### State diagram

```
 SHARED (all modes)              INTAKE-TRACK                        MEMORY-TRACK
                                  feedback · new-feature ·            decision · pitfall ·
                                  new-concept · design ·              lesson · meeting ·
                                  feature-change                      architecture

 captured                        routed ─────────────▶ done          scoped ────▶ done
    │                              ▲                                    ▲
    ▼                              │ pipeline                           │ Memory Archivist:
 locked ───────────────────────────┤ exists                             │ scope proposed +
 (Curator: office-hours           │                                    │ you confirm
  dialogue proportional to         │ no pipeline
  the request, mode confirmed/     ▼
  changed, before/after           gap ──▶ Pipeline Suggester ──▶ you decide:
  summary you confirm)                                            · build it → routed
                                                                    · park it → done
                                                                      (DEFERRED_SCOPE.md,
                                                                       source: review-outcome)
```

Five states: `captured → locked → {routed | gap} → done` (intake-track) or
`captured → locked → scoped → done` (memory-track). `gap` is the only state that can loop back
into `routed`, once the missing pipeline actually gets built.

## The Product

- Curator/Pipeline Suggester/Memory Archivist run as system agents, auto-triggered on the
  relevant `status` transition (`captured` → Curator; intake `gap` → Pipeline Suggester;
  memory-track `locked` → Memory Archivist) — no manual invocation.
- `captures.status` gains the five values above (extends the `captures` table from
  [`feedback.md`](./feedback.md)'s Product section).
- Curator's research tools are `memory_search` + codebase-memory-mcp graph tools (P5
  infrastructure), not raw filesystem access — see the Curator doc for the Track A gap this
  closes.
- A `gap` proposal that's accepted becomes a real build-board row — closing the loop from
  "a request came in with no home" to "here's exactly what to build," driven by demand.

→ Build-board rows when scheduled: `captures.status` migration (5-state) · Curator/Pipeline
Suggester/Memory Archivist system agents · auto-trigger wiring · gap-proposal →
build-board-row promotion.

## The Agents

Linked above — [Curator](./agents/curator.md), [Pipeline Suggester](./agents/pipeline-suggester.md),
[Memory Archivist](./agents/memory-archivist.md). All three follow the same discipline as the
Listener: least-privilege tools, emit-then-persist, nothing written without your confirm.
