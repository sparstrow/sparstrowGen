# DEFERRED_SCOPE — parked with context (the freezer)

The durable record of scope intentionally **not** built now. Governed by
[`docs/workflows/deferred-scope.md`](docs/workflows/deferred-scope.md). Two feeders: a human
dream/future plan (via the Listener), or an agent cutting scope mid-work — the **"no silent
scope-drop" rule**: whenever you defer, cut, or say "later / out of scope," log it here at that
moment. Nothing here is a promise to build; it's a waiting room. When an item's time comes it is
**revived** into `docs/intake/` as a fresh capture and runs the normal review → build flow.

**Entry format** (newer entries; the grouped lists below predate it and are kept as-is):

```
### <title>
- source: human-dream | agent-defer | review-outcome
- project: factory | <slug>
- what: <the deferred scope>
- why deferred: <rationale>
- revisit when: <the trigger>
- size: (S|M|L)   ·   date: YYYY-MM-DD   ·   links: <capture id / PR>
```

---

### Reviewer pitfall-attribution (run/task history read access)
- source: agent-defer
- project: factory
- what: the [Reviewer](docs/workflows/agents/reviewer.md) agent, for `pitfall`-mode captures,
  is meant to attempt attributing the pitfall to a causing agent/run — but this needs read
  access to `runs`/`tasks` history, which isn't wired into the Reviewer's spec yet.
- why deferred: cut during design of the Review & Routing workflow (2026-07-12) — the rest of
  the Reviewer/Pipeline Suggester/Memory Archivist design didn't depend on it, and it only
  works against a live core instance anyway.
- revisit when: the Chat/Sessions feature (or any live Sparstrowgen instance) makes run/task
  history queryable from a design/build session; fold the capability into the Reviewer's tool
  list at that point.
- size: S   ·   date: 2026-07-12   ·   links: docs/workflows/agents/reviewer.md

---

_The 4 entries below were folded in from a standalone `TODOS.md` (a parallel, rival version of_
_this file, produced by an `/autoplan` CEO review of `docs/project-delete-plan.md` on 2026-07-11)._
_`TODOS.md` itself was kept, not deleted — `docs/project-delete-plan.md` (in-progress in a_
_separate worktree) still references it by name (tasks T18-T20); deleting it would break those._
_This is a copy, not a move._

### Auto-purge of trash after N days
- source: review-outcome
- project: factory
- what: a scheduled job that permanently deletes projects sitting in trash longer than a
  configurable retention window (default 30 days).
- why deferred: explicitly marked "NOT in scope (yet)" by the plan owner; an independent
  outside-voice review flagged it as a high-severity 6-month regret if left unaddressed —
  surfaced as Taste Decision T-CEO-2 at the Final Approval Gate rather than silently added to
  the initial scope. Reuses the existing dream-cycle-style scheduler pattern, not new infra
  from scratch; needs a retention config knob and a pre-purge warning.
- revisit when: Project Delete v1 ships and `<dataDir>/deleted-projects/` starts growing
  unbounded in practice.
- size: S   ·   date: 2026-07-11   ·   links: docs/project-delete-plan.md, TODOS.md

### Bulk delete / multi-select for Deleted Projects
- source: review-outcome
- project: factory
- what: select multiple trashed projects and restore or permanently delete them together,
  instead of one at a time.
- why deferred: explicitly deferred by the plan owner; not reconsidered during CEO review — a
  clean, uncontested deferral, not blast-radius-adjacent to v1's file set.
- revisit when: Project Delete v1 ships and users regularly have more than a handful of
  trashed projects.
- size: M   ·   date: 2026-07-11   ·   links: docs/project-delete-plan.md, TODOS.md

### Formal DESIGN.md
- source: review-outcome
- project: factory
- what: document the design system that already exists in practice (Dialog primitives,
  `text-destructive` confirm-gate pattern, App UI classification, spacing/typography tokens)
  via `/design-consultation` (or our own equivalent once written).
- why deferred: pure documentation effort, no functional change; flagged as a non-blocking gap
  while reviewing `docs/project-delete-plan.md`. The only source of truth today is a
  point-in-time design audit and reading the code directly.
- revisit when: nothing blocks it — worth doing before the next design-heavy review needs a
  real spec to calibrate against instead of inferring conventions from recent commits.
- size: M   ·   date: 2026-07-11   ·   links: docs/reference/audits/2026-07-10-design-audit.md, TODOS.md

### General-purpose soft-delete/auto-purge primitive
- source: review-outcome
- project: factory
- what: generalize the soft-delete + trash + auto-purge pattern built for projects into a
  reusable primitive other entity types could adopt later.
- why deferred: named as a 12-month "platonic ideal" direction during CEO review, not an
  immediate need — no second consumer exists today; building it now would be speculative
  generalization ahead of actual demand.
- revisit when: a second concrete need for entity-level soft-delete emerges.
- size: XL   ·   date: 2026-07-11   ·   links: TODOS.md

---

Deferred by /autoplan master-plan review, 2026-07-02 (see
`fable-handoff/ENGINEERING_PLAN.md` appendix for rationale):

- **Global activity feed page** (every bus event, filterable). Deferred from CEO
  expansion scan E4 — Runs page + Dashboard attention queue cover the need for now.
  Revisit if debugging cross-agent behavior gets painful.
- **Orchestrator-mediated no-network push** (execution spec §3 phase 2) — agent
  terminals lose network; core pushes. P7's git-ops service is shaped for the swap.
- **OpenAI provider adapter** — excluded from P8 until a concrete need exists.
- **DESIGN.md / design-system doc** — recommend `/design-consultation` before the
  visual-redesign track re-skins the v0 engine UI.
- **Cross-provider tool-name normalization** — P2 treats tool ids as provider-native
  strings; revisit when the same agent config must target both providers.
- **APP.md amendment** — "stays a single-user local tool" line superseded by premise
  gate D6 (factory goes multi-tenant eventually); amend when the plan lands.
P2 matrix UI deferral →
- **P2 full permission matrix UI** (Global→Agent→Project→Task provenance) — deferred at the P2 gate (P2-lite shipped the resolver + clamp). Build when a second human or an untrusted-agent class exists. Also: **cross-provider tool-name normalization** belongs here.
- **P3 standing-trust delegation grants** — deferred at the P3 gate (per-spawn approval chosen); add "A may delegate to B for this task/always" once real delegation patterns are observed.

P4 deferrals →
- **EH7 untrusted-content-run WRITE clamp — still open, narrowed by P5 part 2**
  (2026-07-06, `feat/p5-memory-p2`): the *signal* shipped — `runs.untrusted` stamped at
  finalize (sandbox project ∨ delegated task ∨ external-content tool use — WebFetch/
  WebSearch/foreign `mcp__*`, core's own server exempt) — plus EH6 quarantine of
  dream-extracted signals from untrusted runs and UNTRUSTED DATA labeling of the
  injected block. NOT shipped: clamping an untrusted run's own `memory_save` writes
  (plan EH7) — sandbox runs remain the only write-clamped class; a delegated or
  WebFetch-consuming run can still write immediately-injectable notes to any allowed
  scope. Design note for pickup: the tool-use signal is only knowable at finalize, so
  an in-run write gate needs a live signal (e.g. stamp on first external-content tool
  result), not the post-hoc flag.
- **Files tree "open in editor"** — P4 ships a read-only file tree (P4-Q4). Opening a
  file's contents / launching an editor is a trivial later add.
- **Lane-aware scheduler is coarse** — P4 reserves ≥1 foreground slot so background
  system runs (auto-index, briefings) can't starve the founder's work. A richer
  fair-share / priority scheme can come if background volume grows.

P5 deferrals (graph-engine swap, /autoplan 2026-07-05) →
- **`detect_changes` in review flows / P6 GOAP inputs** — the engine maps a git diff to
  affected symbols with risk classification; surface it in a run-detail "diff impact"
  panel and feed it to the P6 planner as a precondition signal. Agent tool ships in P5;
  this is the human/planner surface. (S, P6 adjacency)
- **Nightly risk-ranked diff digest** — "what changed today, riskiest first" into the
  morning briefing via the existing Reporter cron. Reuses detect_changes. (S, delight)
- **`search_code` re-export for P8 direct-API agents** — excluded from the curated 7
  because Claude-CLI agents have native Grep; P8 tool-loop agents won't. One registry
  entry + docs line when P8 lands. (S, blocked by P8)
- **Auth-proxied viz route** — the 3D view is an unauthenticated 127.0.0.1 origin opened
  in a new tab (UC2). If embedding inside the factory UI is ever wanted, proxy it through
  core's authenticated server instead of an iframe to the raw port. (M, only on demand)
- **Lesson-decoration of graph results** — P5 part 2 shipped LESSONS notes (portable
  `(filePath, symbolName)` refs) + `toEngineQualifiedName` (the one vendor-grammar
  translation site), so the graph-tool proxy can now annotate matching results with
  preferred/dead-end lessons at the join layer. (M, unblocked 2026-07-06 — decoration
  itself is what remains)
- **Error-call counting in graph usage aggregate** — "used in N of M runs" ships; counting
  isError tool_results needs pairing tool_use ids across events. Add if the zero-usage
  diagnostic proves insufficient. (S)

Portability deferrals (/autoplan 2026-07-08, `docs/portability-plan.md`, branch
`fix/portable-vault-path`) →
- **Full migration of DB-stored absolute paths to relative storage** — `agents.cwd` and
  `projects.root_dir` hold absolute paths written at create time, read back across
  run-manager / provision / git-ops / variants / terminal-manager + 3 API routes. A drive
  move leaves existing rows stale. The portability plan shipped a *warning-only*
  factory-health `stale-paths` check (loud, not silent) but NOT a migration — relativizing
  at write time + resolving at read time touches 6+ call sites and doesn't help rows that
  are already stale before the migration ships. Do it if a real second-machine / drive-move
  workflow becomes routine. (M)
- **`??` → empty-string gap on `SPARSTROW_DATA_DIR` (config.ts) and `SPARSTROW_SECRETS_DIR`
  (config.ts)** — same latent bug the vault-path fix closed: `??` only substitutes on
  null/undefined, so a set-but-empty env var resolves to an empty/partial path. Left out of
  the portability PR to keep it scoped to the vault path. One-line each
  (`?.trim() || <fallback>`) when touched next. (S)
