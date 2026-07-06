# APP.md — Sparstrowgen master plan & build board

> **Status: DRAFT v0 (2026-06-28) — pending lock-in.**
> Single source of truth for *which page is at which stage*. The build routine reads this
> to find the next `autoplan ✅` page; you read it to see what's waiting on your time.
> Workflow it drives: [`FACTORY-LOOP.md`](./FACTORY-LOOP.md). Per-page detail lives in
> `.design-src/<page>/SPEC.md`.

## What Sparstrowgen is

The **factory**: a local-first, single-user agent harness that *builds* apps. CRUD UI over
agents that wrap CLI models (Claude Code, Gemini CLI), scoped markdown memory with hybrid
vector+FTS search, a task board, pipelines, cron, embedded terminals — Fastify core on
`127.0.0.1:48750`, React/Vite UI, better-sqlite3, Electron shell. It stays a single-user
local tool; the cloud/multi-tenant story belongs to the *products* it builds, not here.

## Stage legend (mirrors FACTORY-LOOP)

The pipeline starts when **you deliver a designed file from Claude Design**, which I convert into a SPEC. Pages still awaiting your design sit in the pre-pipeline backlog.

`⬜ backlog` (awaiting your design) → `🎨 designed` (export in `.design-src/<page>/`) → `✏️ spec'd` → `🔒 office-hours` → `✅ autoplan` (ready to build) → `🔁 in-review` → `✔️ merged`

The routine only ever touches pages at **`✅ autoplan`**. Everything left of that is your interactive zone.

---

## Build board

Recommended build order top-to-bottom; reorder during lock-in. `Prio` = product value, not effort.

| # | Page | Route | Stage | Prio | Next action | Scope sketch |
|---|------|-------|-------|------|-------------|--------------|
| 1 | **Dashboard** | `/` | ⬜ backlog | P1 | design in Claude Design | Live workforce view: what's running now, queue depth, recent runs, cost/health. CEO review (Teams autoplan) flagged run-observability as higher value than agent-config polish. |
| 2 | **Runs** | `/runs` | ⬜ backlog | P1 | design | Run history list: filter by agent/project/status, cost, duration, outcome. |
| 3 | **Run detail** | `/runs/:id` | ⬜ backlog | P1 | design | Single run: streamed transcript, tool calls, memory injected, artifacts, re-run. |
| 4 | **Projects** | `/projects` | ⬜ backlog | P2 | design | Project registry: rootDir, assigned agents, memory scope, recent activity. |
| 5 | **Memory** | `/memory` | ⬜ backlog | P2 | design | Vault browser + hybrid search, scope tree (global/projects/agents/inbox), embedder status. |
| 6 | **Tasks** | `/tasks` | ⬜ backlog | P2 | design | Task board: assign → agent spawn → status; kanban columns. |
| 7 | **Pipelines** | `/pipelines` | ⬜ backlog | P2 | design | Multi-step pipeline builder; `{{input}}` piping between steps. |
| 8 | **Schedule** | `/schedule` | ⬜ backlog | P3 | design | Cron jobs: create/edit/run-now, next-fire, scheduler pause toggle. |
| 9 | **Messages** | `/messages` | ⬜ backlog | P3 | design | Inbox: agent→agent + agent→you messages, reply/route. |
| 10 | **Terminals** | `/terminals` | ⬜ backlog | P3 | design | Embedded xterm sessions over `/ws/terminal/:id`. |
| 11 | **Settings** | `/settings` | ⬜ backlog | P3 | design | Config: concurrency, paths, theme, token, providers, backup. |

`placeholder.tsx` is scaffold, not a real page — excluded. Agents (Pass 1 + Teams Pass 2) is fully shipped, see Done table.

### Done
| Page | What shipped | Landed |
|------|--------------|--------|
| **Agents — Pass 1** | F1 SkillViewer slide-over · F2 split New-agent + Duplicate · F3 deterministic-first Agent Creator (+ `POST /api/v1/agents/draft`, shared `AgentFields`, `renderSkillMd()`) | PR #4 → `main` (`925f9a7`), 2026-06-28 |
| **Agent draft fix** | F3 draft repair-retry on JSON slip + smarter fallback naming (`fix/agent-draft-retry`) | merged to `main`, 2026-06-28 |
| **Agents — Teams Pass 2** | F4 Teams (organization only — group agents + assign to projects, flat membership, List view; no Run button, no hierarchy/Tree — cut at `/autoplan` UC-A) + F5 nav. `teams`/`team_projects`/`team_members` schema + CRUD API + UI. Built by Antigravity 2.0 per `AGENTS.md`. | PR #7 → `main` (`5269e32`), 2026-06-29 |

Board is clean — Teams Pass 2 shipped end-to-end (office-hours → autoplan → external-agent build → merge).

### Engine phases (whole-factory master plan — `fable-handoff/ENGINEERING_PLAN.md`, all 10 locked, `Final gate: APPROVED` 2026-07-03)

| Phase | Status | Notes |
|-------|--------|-------|
| **P1 — Task lifecycle & human escalation** | ✔️ merged | PR #10 → `main` (`138cedf`). Migration `0004`; capability registry (rule 20) + `task_block`; durable wake state machine (EC1) + `PATCH /tasks/:id/answer` (S4-a); orphan/queued-cancel reconcile; task-aware `RunContext` + `buildWakePrompt` + preamble contract (DX-C1/C2/H2/H3); Dashboard attention queue + composer + nav badge + task-board band. **Remaining P1 UI polish (follow-up):** task-detail route promotion (C3), wake/attention metrics (E3). |
| **P2-lite — Tool permissions** | ✔️ merged | PR #11 → `main` (`827c6d5`). `resolveEffectiveTools` (Global→Agent→Project→Task, deny-wins, empty=inherit) + `isToolPolicySubset` for P3; migration `0005` (project/task tool columns); `runs.effective_tools` reshaped to `{allowed,disallowed}`; run-manager resolves + snapshots at spawn; claude-code reads the immutable snapshot not the live agent row (EH5 TOCTOU fix); Run-detail effective-tools line. **Deferred (locked):** provenance matrix UI, cross-provider tool-name normalization (→ TODOS). |
| **P3 — Delegation, swarms & agent instances** | ✔️ merged | PR #12 → `main` (`2bd08a1`). Migration `0006` (parent_task_id + parent_effective_tools, ephemeral teams, agent_instances, runs.agent_instance_id) + EH4 seam table (`fable-handoff/P3-SEAM-TABLE.md`); instance runtime (P3-Q1/Q5, instance-scoped `agent:self`); `spawn_subtask` (S1-a LEAST clamp, EC3 wrap, EH1 suspend); completion-watcher (derived query); approve/deny + EM3 approval cards; C10 circuit breaker; multi-assign → ephemeral team (C6/P3-Q3); depth cap (P3-Q4); DX1 brief; board delegation UI. **Rode along:** vault frontmatter fix (gray-matter dead under js-yaml≥4 override). |
| **P4 — Projects workspace** | ✔️ merged | PR #13 → `main` (`7e3d0cb`). Built on branch `feat/p4-projects`. Migration `0007` (parent_project_id, is_sandbox, git_remote, project_directives, agents.is_system). **EH7 sandbox isolation** (memory write-clamp `clampSandboxWriteScopes` at both enforcement points + non-global-searchable read exclusion across searchMemory/recencyFallback/LIKE-fallback); read-only git awareness (execFile, shell-safe); guaranteed-injected directives (§2, un-trimmed, outside `<memory>`); 3-path creation (scratch/bind/clone, SSRF-guarded) + auto-index via seeded system agents (Project Indexer/Reporter, is_system-hidden); lane-aware tick() (busyAgents.size cap + ≥1 foreground slot); client variants (git fork + project-note copy P4-Q3, sandbox-fork refused) + task-based sync; opt-in morning briefing (§5); read-only file tree (P4-Q4); Cowork workspace UI (`/projects/:id`). **Adversarial review** (6 dims, verify-by-refutation) → 3 confirmed → all fixed. typecheck 6/6, 153 tests, UI build green. **Deferred (→ TODOS):** EH7 untrusted-content clamp (P5/EH6), files open-in-editor, richer lane scheduler. |
| **P5 — Smart memory (part 1: code graph)** | 🔁 in-review | branch `feat/p5-memory` (8 commits). **AMENDED via /autoplan 2026-07-05: graphify is OUT** → `codebase-memory-mcp` v0.8.1 (26.7k★ MIT C static binary, stdio-only MCP) as core-spawned per-project children. Binary manager (pinned per-platform SHA-256 IN SOURCE, atomic install, System32-bsdtar extract, Defender-tolerant health spawn, T-a explicit Settings install); GraphClientPool (per-project stores `CBM_CACHE_DIR` = isolation by construction + REAL-ENGINE leakage proof e2e; promise-gated spawn; 3-class timeouts — request timeout never kills a child; crash-loop breaker→Settings Retry; LRU cap 3 + idle-stop; PID-file orphan sweep + exit-hook); curated 7 read-only tools (UC1) via registry with **spawn-pinned availability** (#49: gate folds into the run's effective-tools snapshot; advertised ≡ available parity-tested incl. the preamble heuristics ladder ≤250 tok); index lifecycle (global depth-1 semaphore — scheduler lanes never see direct stdio calls; sandboxes never auto-index #41; naive-pass fallback REMAINS — regression guard; nightly sweep; version-bump store wipe; interrupted-index reconcile); Settings engine row + Code-graph sidebar panel + provenance line ('Graph tools: … / not used') + used-in-N-of-M aggregate + index-all backfill; 3D viz (UC2): new-tab, on-demand, randomized 127.0.0.1 port, stdin-held lifecycle, 15-min idle-stop, sticky --ui reset. typecheck 6/6, 199 tests + 4 opt-in real-engine e2e (PASS locally), UI build green. **Still to build in P5 part 2:** typed notes `0008`, wikilinks, EH6 signal quarantine (+deferred EH7 untrusted-run clamp), dream cycle, synthesis-over-search, LESSONS via portable (filePath,symbolName) refs. |
| P6 … P10 | ⬜ locked | Build in dependency order after P5. |

### North-stars (captured, not scheduled)
Big visions parked with a written doc; each needs its own `/office-hours` + `/plan-ceo-review` before it enters the board.

| North-star | Doc | Spawned from |
|---|---|---|
| **Team Workspace / Automation Builder** — in-team tasks (multi-agent, cron, event triggers, templates, deploy-to-project), a conversational Team Manager Agent advisor, and an n8n-style visual workflow designer. Convergence of Tasks + Pipelines + Schedule + Agent Creator. | [`docs/team-workspace-northstar.md`](../docs/team-workspace-northstar.md) | Agents Teams Pass-2 office-hours, 2026-06-28 |

---

## Known constraints the routine inherits

- **PR creation is manual** — `gh` is authed as the wrong account; the routine pushes the
  branch and prints the compare URL. You open + merge.
- **`main` is branch-protected** — PR + 1 approval + `typecheck` + `author-check` required;
  squash-only; no force-push. The routine cannot merge even if it tried.
- **Commit author must be `@sparstrow.com`** — handled: per-agent git identity is injected
  as `agent@sparstrow.com`. Drop the `Co-Authored-By: Claude` trailer on this repo (it
  fails `author-check`).
- **Build the SPEC, not the decoded design module** — modules carry pre-lock field
  names/providers/silent fallbacks; the locked SPEC + autoplan appendix is the contract.
