# APP.md — Sparstrowgen master plan & build board

> **Status: DRAFT v0 (2026-06-28) — pending lock-in.**
> Single source of truth for *which page is at which stage*. The build routine reads this
> to find the next `autoplan ✅` page; you read it to see what's waiting on your time.
> Workflow it drives: [`FACTORY-LOOP.md`](./FACTORY-LOOP.md). Per-page detail lives in
> `.design-src/<page>/SPEC.md`.

## What Sparstrowgen is

The **factory**: a local-first, single-user agent harness that *builds* apps. CRUD UI over
agents that wrap CLI models (Claude Code, Antigravity CLI), scoped markdown memory with hybrid
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
| **P5 — Smart memory (part 1: code graph)** | ✔️ merged | PR #15 → `main` (`39505de`), 2026-07-06. Built on `feat/p5-memory`. **AMENDED via /autoplan 2026-07-05: graphify is OUT** → `codebase-memory-mcp` v0.8.1 (26.7k★ MIT C static binary, stdio-only MCP) as core-spawned per-project children. Binary manager (pinned per-platform SHA-256 IN SOURCE, atomic install, System32-bsdtar extract, Defender-tolerant health spawn, T-a explicit Settings install); GraphClientPool (per-project stores `CBM_CACHE_DIR` = isolation by construction + REAL-ENGINE leakage proof e2e; promise-gated spawn; 3-class timeouts — request timeout never kills a child; crash-loop breaker→Settings Retry; LRU cap 3 + idle-stop; PID-file orphan sweep + exit-hook); curated 7 read-only tools (UC1) via registry with **spawn-pinned availability** (#49: gate folds into the run's effective-tools snapshot; advertised ≡ available parity-tested incl. the preamble heuristics ladder ≤250 tok); index lifecycle (global depth-1 semaphore; sandboxes never auto-index #41; naive-pass fallback REMAINS — regression guard; nightly sweep; version-bump store wipe; interrupted-index reconcile); Settings engine row + Code-graph sidebar panel + provenance line + used-in-N-of-M aggregate + index-all backfill; 3D viz (UC2). Also: turbo+tsx-watch Windows wedge fix + startup watchdog. |
| **P5 — Smart memory (part 2: typed memory + dream cycle)** | ✔️ merged | PR #16 → `main` (`d118079`), 2026-07-06. Branch `feat/p5-memory-p2`. Migration `0008` (memory_notes.type/quarantined/archived_at/superseded_by; memory_links; memory_contradictions; runs.untrusted + runs.injected_memory; agents.signal_extraction). **Typed memory**: enum note\|decision\|architecture\|pitfall\|meeting\|lesson, frontmatter round-trip, memory_save type+refs params, one shared `noteRowExcluded` gate enforcing quarantine+archive exclusion identically on ALL THREE read paths (type filter in search + route paths; the injector deliberately takes all types). **Wikilinks**: `[[Title\|alias]]` parsed at index time → hard edges; dangling links re-resolve; deleted targets degrade to dangling; backlinks API + UI strip. **E1 provenance**: injector returns post-budget manifest → `runs.injected_memory` (NOT injected_context — L158 naming landmine); Run-detail panel. **EH6/EH7**: runs.untrusted stamped at finalize (sandbox ∨ delegated ∨ WebFetch/WebSearch/foreign-MCP use); quarantined notes non-injectable + invisible to agents on every path; injected block labeled UNTRUSTED DATA with per-note written-by; approve/reject + bulk-delete (machine sources only). **Dream cycle** (P5-Q1 opt-in per project, briefing idiom w/ cron targetType 'dream'; P5-Q2 nightly batch; P5-Q3 flag-only; P5-Q5 gbrain algorithms): ONE queue-routed consolidator run/project/night (Memory Consolidator system agent, haiku, no tools — EH3: lane background, trigger 'dream' = the recursion guard, never completeOnce) judging signals + merges (greedy cosine ≥0.85 candidates; soft-archive originals w/ superseded_by + citations) + contradictions ([0.60,0.85) band pairs, 0.7 confidence floor double-enforced → Attention queue 'contradiction' row type + ws); global nightly $-budget gate + watermark checkpoint/resume + daily inbox digest. **Synthesis-over-search**: memory_search synthesize:true → cited answer + "gaps" via haiku one-shot (degrades to hits, never errors); UI toggle. **LESSONS**: portable (filePath,symbolName) refs; `toEngineQualifiedName` = the ONE vendor-grammar site. UI: type facets, quarantine review, synthesis card, backlinks, DreamCyclePanel, provenance panel, untrusted badge, signal-extraction agent toggle. typecheck 6/6, 199→227 tests (28 new; 4 opt-in real-engine e2e skipped by default), UI build green. **Deferred (→ TODOS):** EH7 untrusted-run WRITE clamp (the signal shipped; write-clamping stays sandbox-only). |
| **P6 — Goal engine (LLM-planned DAG) + node graph** | 🔁 pushed | branch `feat/p6-goap` (259 tests). **P6-Q0 head-to-head → LLM-planned-DAG wins** (`fable-handoff/P6-ENGINE-DECISION.md`). Migration `0009` (goals/plan_nodes/plan_edges, consensus cols, user_id markers); shared `goal.ts` zod domain (plan trust boundary); `goap/dag.ts` pure core (validation + bounce diagnostics, Kahn cycles, ready-set, derived node status EM4, replan diff w/ done-task carry-forward, layered layout); `goap/planner.ts` + `goap/service.ts` row-recoverable executor (EH2 idempotent advance, join-barrier, version-stamped effects, consensus gate P6-Q3, replan/retry caps, startup `reconcileGoals` + sweep); system agents goal-planner + goal-reviewer; `/goals` routes; `@xyflow/react` StatusNode graph + goal detail + Goals tab + shared `WorkLauncher`; pipeline_runs orphan-sweep gap fixed; EC3 widened to all agent-created tasks. Awaiting owner PR+merge. |
| **P7 — Git automation & execution profiles** | 🔁 pushed | branch `feat/p7-git-automation`. **EC2 (both mandatory root-cause fixes):** explicit-allowlist child env at all 3 spawn sites (run-manager/one-shot/terminal, `child-env.ts` + test — no more `{...process.env}` spread); PAT out of the DB → AES-256-GCM encrypted `secret-store.ts` under `secretsDir` OUTSIDE dataDir (machine-local 0600 key, presence+masked-hint only, never in agent env). Migration `0010` (`projects.execution_profile` factory\|production_app + `staging_branch`). **git-ops.ts** = core-enforced guard rails (pure-tested spine): `assertPushAllowed` refuses main/master + a production_app's staging ref; `branchNameForTask` can't be coerced to trunk / inject ref-shell metachars; PAT via GIT_ASKPASS child-env (never argv) w/ ssh fallback; PR creation via GitHub REST (graduates the manual compare-URL step, P7-Q2); shaped for the Phase-2 orchestrator-mediated-push config flip. **pr-queue.ts** = aggregate PR queue (per-remote 60s cache, degrades to empty). **factory-health.ts** = rule-23 "is my factory armed?" self-check (DB/vault/providers required; graph/embedder/PAT degrade). Routes: `/git/pull-requests`, `/projects/:id/pull-requests`, `/projects/:id/git/{push,pr}`, `/system/factory-health`, `/system/secrets/github-pat` (get/put/delete). UI: Dashboard aggregate PR queue card, Settings Factory-health + Git-PAT cards, project-detail profile badge + Git panel (profile flip + per-project PRs). typecheck 6/6, 298 core tests (18 new: git-ops 12 + pr-queue 6), UI build green, browser-verified (PAT round-trip flips factory-health armed). Awaiting owner PR+merge. |
| **P8 — Multi-provider direct API + unified tool-calling** ★ FOUNDATIONAL | 🔁 pushed | branch `feat/p8-direct-api`. **Execution mode DERIVED from the provider** (`PROVIDER_KINDS` + `executionModeForProvider`) — no `agents.execution_mode` column, so no migration and no drift. `providerIdSchema` gains `anthropic-api` + `ollama` (Gemini-API fast-follow). **Rule-20 registry now drives BOTH surfaces**: `zodToJsonSchema` (dependency-free, parity-tested) + `nativeToolSchemas` (effective-tools-clamped, P2 deny-wins) + `dispatchCapability` (in-process, degrades like MCP — never a hard throw). **Provider union** `CliProvider | DirectApiProvider`; direct providers implement a thin one-turn `chat()`. **`orchestrator/tool-loop.ts`** = the provider-agnostic loop (EM2 counterpart): call → in-process tool dispatch → result → continue, emitting CLI-shaped `assistant`/`user` events so the Runs UI is provider-agnostic; owns history but keeps the fresh-run contract (P1-Q1); cost from usage×price, max-turns cap, refusal + abort handling. **Adapters over raw `fetch` (zero new deps)**: `anthropic.ts` (P8-Q1 primary; key from secret store EC2, Messages API, `/v1/models` discovery, price table) + `ollama.ts` (P8-Q2, local/key-less, `role:"tool"` + id-less calls — proves the abstraction). **run-manager** branches on `provider.kind`: direct runs share ALL setup (memory/preamble/effective-tools/instance/provenance) then run the loop with an AbortController (cancel + timeout) instead of a child — `finalize` is reused unchanged. Key vault: `SECRET_ANTHROPIC_API_KEY`/`SECRET_GEMINI_API_KEY` (out of DB/agent-env like the PAT). Routes: `GET /providers`, `POST /providers/discover-models`, `GET/PUT/DELETE /providers/:id/key`. UI: Settings Providers card (mode badges, health, key inputs, discover-models w/ static-fallback note), agent-form provider dropdown + mode badge + model-reset. typecheck 6/6, **314 core tests** (16 new: registry schema/dispatch + tool-loop mechanics + adapter parse), UI build green, **browser-verified**: direct-API run flows through the loop → `finalize` (pid null, clean no-key failure); provider-key round-trip flips health; discover-models degrades gracefully. Awaiting owner PR+merge. |
| **P9** | ⬜ locked | Build in dependency order. |
| **P10 Part 1 — Team Workspace schema** | 🔁 in-review | branch `feat/p10-part1-schema`. PR compare URL: https://github.com/sparstrow/sparstrowGen/pull/new/feat/p10-part1-schema |

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
