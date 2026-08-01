# P6-Q0 — Engine head-to-head: A*/GOAP vs LLM-planned-DAG

**Status: DECIDED — LLM-planned-DAG. 2026-07-07, build gate.**
Per the P6 lock (ENGINEERING_PLAN.md): *"Keep the schema + React Flow node graph +
replanning regardless; decide A*/GOAP vs LLM-planned-DAG by a written comparison on
real goals before committing the engine. GOAP wins only if the comparison shows
concrete replanning/explainability gains."*

This document is that comparison. Every claim marked `[harness]` is asserted
executably in `packages/core/src/goap/engine-comparison.test.ts`, which encodes BOTH
engines (a real A* GOAP solver and the DAG validator/ready-set that shipped) and runs
the three goals below through each.

## The two candidates

**A*/GOAP** — the Planner LLM authors a *domain*: boolean world-state flags plus
actions `{pre[], effects[], cost}`. A* searches from the current state to the goal
condition; the resulting path is the plan. Replanning = re-run A* from the failed
world state.

**LLM-planned-DAG** — the Planner LLM authors the *plan directly*: nodes (one unit of
agent work each) plus dependency edges. Deterministic validation (cycles, dangling
refs, unreachable terminals, node cap, agentHint resolution) replaces the solver.
Ready set = nodes whose dependencies are all done. Replanning = bounce the current
DAG + failure diagnostic back to the Planner for a new plan version.

Both engines share: the 0009 schema family, React Flow rendering, versioned
replanning with a barrier, the Planner bounce-back loop, and the replan cap.

## The three real goals

Walked through both engines, LLM-shaped (i.e. the domain/plan is what a Planner
prompt realistically produces — the fixtures in the harness are taken from recorded
planner-style outputs, not idealized hand-crafted domains).

### G1 — "Build the memory settings page" (feature build)
Natural decomposition: schema/API work and UI scaffold can proceed in parallel once a
contract note exists; tests join both; push last.
- **DAG**: 6 nodes, 7 edges, two parallel tracks joining at "integration tests".
  Fan-out to the swarm falls directly out of the ready set: after node 1, nodes 2 and
  3 are ready *simultaneously*. `[harness: dag ready-set contains both]`
- **GOAP**: A* returns a *totally ordered path* — it is a sequential planner. The two
  parallel tracks serialize; swarm fan-out requires deriving a partial order from
  pre/effect commutativity analysis, machinery neither ruflo's planner nor the P6
  spec contains. `[harness: astar path is a strict sequence over the same domain]`
- Explainability: identical rendering — "blocked: waiting on *API contract*" (edge) vs
  "blocked: precondition `api_contract_written` unsatisfied" (flag). The flag adds a
  vocabulary the owner never authored; the edge points at a node they can click.

### G2 — "Investigate and fix the failing auth test" (replanning-heavy)
The plan discovers reality mid-flight: the fix node fails because the root cause is in
a dependency, not the test.
- **The decisive question: what does replanning actually buy?** A* can only re-order
  actions that *already exist in the domain*. The recovery here needs a **new action**
  ("patch the session-store dependency") that the domain does not contain — no search
  algorithm can invent it. GOAP must bounce to the Planner for a new domain… which is
  *exactly* what the DAG engine does, minus the solver in the middle.
  `[harness: astar over the post-failure state returns no-plan; recovery requires a
  domain edit in both engines]`
- A* autonomous replanning helps only when the LLM pre-authors *alternate routes* to
  the same effect. In LLM-shaped domains this does not happen: planners emit linear
  chains where action N's precondition is action N-1's effect (the natural
  translation of "steps" into GOAP form), so the A* search space contains exactly one
  path. `[harness: G1/G2/G3 fixture domains — every action has exactly one satisfying
  predecessor; solver returns the chain]`

### G3 — "Refactor the pipeline executor + tests + PR" (swarm + consensus gate)
Two coder tracks, a reviewer, a push node at the end (P6-Q3 consensus gate).
- **DAG**: the push node is a first-class node (`kind: "push"`); gate detection is a
  field check plus a deterministic label fallback. Holding it back until a Reviewer
  run approves = not materializing one ready node. Trivial.
- **GOAP**: the push action is only distinguishable by inspecting effect names
  (`pr_opened`?) — push-node detection, which P6-Q3 flags as *"reliable detection
  required"*, becomes string-divination over LLM-invented flag vocabulary.
- **World-state drift** (P6's own risk register): GOAP tracks reality as boolean flags
  the LLM claimed; an effect asserted but not delivered corrupts every downstream
  readiness decision. In the DAG engine, *completion of the node's task IS the state*
  — there is no second bookkeeping layer to drift. The risk-register mitigation
  ("verifier hook per node type") shrinks from load-bearing to optional.

## Failure-mode comparison (LLM authors either artifact)

| Failure | GOAP | DAG |
|---|---|---|
| Inconsistent output | Unsolvable/trivially-satisfied domains; needs solver diagnostics interpreted back into LLM terms | Cycles, dangling deps, unreachable nodes — deterministic, total, and the diagnostic names the exact node/edge `[harness: validator diagnostics]` |
| Mid-plan failure | Bounce to Planner (solver can't invent actions) | Bounce to Planner — same loop, one fewer translation layer |
| Parallel fan-out | Not expressible in a path; needs commutativity analysis | Native |
| Consensus-gate detection | Effect-name heuristics | `kind` field + label fallback |
| State corruption on replan | Flag vocabulary may shift between domain versions — old effects poison the new state | Node completions carry by stable `action_id`; version-stamped application discards superseded effects |

## Decision

**LLM-planned-DAG.** The comparison shows no concrete replanning gain for GOAP (both
engines recover through the same Planner bounce-back; A* adds autonomy only over
alternate routes that LLM-shaped domains do not contain) and no explainability gain
(edges name clickable nodes; flags name LLM-invented vocabulary). GOAP costs a
sequential-plan limitation that directly blocks P6's own swarm fan-out requirement,
plus a world-state layer with a documented drift risk. Per the lock's criterion, GOAP
loses.

**Consequences (0009 DDL unfrozen as the DAG variant):**
- `plan_edges` is **authoritative** (not a render cache). Recomputed only by plan
  writes (planner insert / replan), never hand-mutated.
- `pre`/`effects` on `plan_nodes` stay as **optional annotation JSON** — the Planner
  may emit them for drill-in explainability; the executor never evaluates them for
  readiness. Effect application (world-state audit trail on `goals.world_state`) is
  version-stamped per the EM4 barrier rule and is *observability, not control flow*.
- Node `action_id` is the stable cross-version identity used for replan diffing and
  completion carry-forward.
- The A* solver ships only inside the comparison harness (test code), keeping the
  head-to-head reproducible without dead production code.

**Kept regardless (per the lock):** 0009 schema family, React Flow node graph, live
WS updates, versioned adaptive replanning with join barrier + cap, Planner
bounce-back with diagnostics, consensus gate on push-terminating goals (P6-Q3),
derived node status (EM4), row-recoverable executor (EH2).
