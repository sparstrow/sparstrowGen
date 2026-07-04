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
| **P2-lite — Tool permissions** | 🔁 in-review | branch `feat/p2-permissions` (4 commits). `resolveEffectiveTools` (Global→Agent→Project→Task, deny-wins, empty=inherit) + `isToolPolicySubset` for P3; migration `0005` (project/task tool columns); `runs.effective_tools` reshaped to `{allowed,disallowed}`; run-manager resolves + snapshots at spawn; claude-code reads the immutable snapshot not the live agent row (EH5 TOCTOU fix); Run-detail effective-tools line. typecheck 6/6, 68 tests, UI build green; verified against the real DB. **Deferred (locked):** provenance matrix UI, cross-provider tool-name normalization (→ TODOS). |
| P3 … P10 | ⬜ locked | Build in dependency order. P3 consumes P2's snapshot + `isToolPolicySubset` for the delegation clamp. |

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
