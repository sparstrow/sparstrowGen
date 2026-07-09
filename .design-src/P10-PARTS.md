# P10 — Team Workspace: Build Split

Tracking doc for building **Phase 10 (Team Workspace)** part-by-part. Source of truth for
the phase contract is [`fable-handoff/ENGINEERING_PLAN.md`](../fable-handoff/ENGINEERING_PLAN.md)
§ "P10 — Team Workspace" and [`docs/team-workspace-northstar.md`](../docs/team-workspace-northstar.md).

**Phase status:** 🔒 LOCKED 2026-07-03. Last remaining phase (P1–P9 + P8.1 merged).

**Thesis:** `/teams/:id` becomes a workspace — filtered viewports over the *global*
tasks/pipelines/schedule (never forked state) + a dual-mode Team Manager Agent
(advisor chat + draft-a-workflow) + an n8n-style canvas where drafts are reviewed,
edited, and published to the global registry. Mostly **filter + reuse + one new agent**,
not net-new infrastructure (heavy reuse of P6 React Flow + JSON-draft plumbing).

**Resolved gate questions:**
- **P10-Q1:** SLIM read-only view for ephemeral (task-spawned) teams (they're transient).
- **P10-Q2:** LINEAR PIPELINES ONLY in canvas v1. GOAP goal-template authoring deferred → TODOS.
  Manager drafts are review-then-Publish (never direct DB writes); publish gated on a valid
  graph (single start, no cycles, agents exist).

Every part must land with `pnpm typecheck && pnpm test` green + vitest coverage for new
logic. Each part is one PR (squash-only into branch-protected `main`).

---

## Parts

### Part 1 — Schema & ownership foundation (migration `0011`)
The unlock for everything else. Small, mergeable alone.
- Migration `0011`: nullable `team_id` on `tasks`, `pipelines`, `cron_jobs` + indexes; backfill `null` (= global).
- Carry forward-marker `user_id` convention (cross-cutting rule 3) if these tables lack it.
- Ownership rule: global pages stay source of truth; team pages filter by `?teamId=`.
- WAL-safe pre-migration snapshot (rule 19); cascade behavior documented + tested.
- **Ships:** migration + `?teamId=` filter params on existing tasks/pipelines/cron list endpoints + route tests (happy + filtered + null/global).

### Part 2 — Team workspace tabs (read-only reuse)
Prove "filter, don't fork" with zero new components.
- Team detail gains workspace layout: **Tasks / Pipelines / Schedules / Members** tabs.
- Mount the *same* global-page components with `?teamId=` applied — no forked UIs.
- SLIM read-only view for ephemeral (task-spawned) teams (P10-Q1).
- **Ships:** workspace tabs + UI states registry (loading/empty/error/success per surface).

### Part 3 — Team Manager Agent: Advisor mode
Conversational half, no DB-write risk.
- Per-team chat panel; answers from roster + team-scoped activity + memory.
- Off-or-capped by default (cost rule 5); attributed in runs; on Dashboard cost view.
- **Ships:** advisor chat panel + golden-transcript fixture test (rule 9).

### Part 4 — Team Manager Agent: Draft mode
Risky half, bounded to emit-only.
- Emits **Draft Pipeline JSON** (zod-validated, same repair-retry pattern as P6).
- **Never writes to DB** (P10-Q2); draft held in memory/UI state only.
- Security clamp: no `bypassPermissions` from model-authored config (rule 6).
- Unknown agent → inline fix-up chip (not a hard fail).
- **Ships:** draft emitter + zod schema + repair-retry + clamp tests.

### Part 5 — Canvas editor + Publish
P6's React Flow gets its editable sibling.
- React Flow editor renders the draft: nodes = steps (agent + prompt template), edges = order / `{{input}}` piping.
- New `EditableStepNode` (same shell as P6 `StatusNode` + form affordances — rule 15, one node family).
- Manual node/edge editing; **linear pipelines only** v1 (P10-Q2).
- **Publish** → creates a real pipeline (+ optional `team_id`) via *existing* API; gated on a zod-clean graph (single start, no cycles, all agents exist).
- **Ships:** canvas editor + publish flow + graph-validation tests (reject cycles / missing start / unknown agent).

### Part 6 — Nav/UI wiring & polish
The convergence seam.
- "Draft with Manager" entry point on Pipelines tab (team-scoped, creates *definitions* not work — rule 16).
- Full workspace nav layout, empty-state copy, list-view parity for the canvas.
- **Ships:** end-to-end flow (chat → draft → canvas → publish → appears in global registry) + integration test.

---

## Dependency graph

```
Part 1 (schema) ──┬──▶ Part 2 (tabs)
                  │
                  └──▶ Part 3 (advisor) ──▶ Part 4 (draft) ──▶ Part 5 (canvas+publish) ──▶ Part 6 (wiring)
```

## Parallelization

| Wave | Parts | Notes |
|------|-------|-------|
| 1 | **Part 1** | Blocks everything. Land first, solo. |
| 2 | **Part 2 ∥ Part 3** | Both depend only on Part 1; fully independent (Part 2 = UI tabs, Part 3 = agent chat). Run in parallel. |
| 3 | **Part 4** | Depends on Part 3 (Manager Agent exists). |
| 4 | **Part 5** | Depends on Part 4 (draft JSON exists). |
| 5 | **Part 6** | Depends on Part 5; final integration. |

Critical path: **1 → 3 → 4 → 5 → 6**. Part 2 rides alongside 3–5 and merges whenever ready.

## Antigravity (agy provider) delegation

Delegate parts that are **well-specified, self-contained, and mechanically verifiable**
(zod schemas, migrations, pure logic, route tests). Keep parts requiring **taste, novel
UI/UX judgment, or cross-surface integration** on the primary loop.

| Part | Delegate to Antigravity? | Why |
|------|--------------------------|-----|
| **Part 1 — Schema** | ✅ **Good fit** | Mechanical: migration + filter params + route tests. Tight spec, verifiable by `pnpm test`. |
| **Part 2 — Tabs** | ⚠️ Partial | Component reuse is mechanical, but layout/UI-states need design taste. Delegate the wiring; you review the states registry. |
| **Part 3 — Advisor** | ⚠️ Partial | Prompt design + golden-transcript authoring wants judgment. Delegate the panel plumbing + tests scaffolding. |
| **Part 4 — Draft mode** | ✅ **Good fit** | zod schema + repair-retry + clamp are pattern-copies of P6; strongly test-gated (rule 6/9). Ideal for agy. |
| **Part 5 — Canvas** | ❌ **Keep primary** | Highest-taste surface (React Flow editor, node family, publish UX). Novel interaction — primary loop. |
| **Part 6 — Wiring** | ❌ **Keep primary** | Cross-surface integration + end-to-end judgment. Primary loop. |

**Suggested delegation plan:** hand **Part 1** and **Part 4** to Antigravity (clean, test-gated,
pattern-following). Keep **Part 5** and **Part 6** on the primary loop. **Parts 2 and 3** are
your call — delegate the plumbing, review the taste layer.
