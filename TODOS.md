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
