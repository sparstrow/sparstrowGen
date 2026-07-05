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
- **EH7 untrusted-content-run clamp** — P4 shipped the sandbox-PROJECT write clamp
  (a run in an `is_sandbox` project can only write `project:<sandbox>`). The plan's
  EH7 also names "untrusted-content runs", but main has no `runs.untrusted` signal
  (only the P3 `<delegated-request>` prompt-wrap + trust-boundary prose). Adding a
  `runs.untrusted` flag + plumbing belongs with **P5**, where injected-content
  quarantine actually lands (EH6). Until then, only sandbox-project runs are clamped.
- **Files tree "open in editor"** — P4 ships a read-only file tree (P4-Q4). Opening a
  file's contents / launching an editor is a trivial later add.
- **Lane-aware scheduler is coarse** — P4 reserves ≥1 foreground slot so background
  system runs (auto-index, briefings) can't starve the founder's work. A richer
  fair-share / priority scheme can come if background volume grows.
