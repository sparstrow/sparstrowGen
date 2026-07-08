# TODOS — deferred with context

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
