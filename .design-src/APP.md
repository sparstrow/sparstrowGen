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
| 1 | **Agents — Teams** | `/agents` | ✏️ spec'd | P1 | `/office-hours` on the Teams slice | F4 Agent Teams + F5 nav (already specced in `agents/SPEC.md`, Pass 2). "Run team" execution = separate design, stub the button. |
| 2 | **Dashboard** | `/` | ⬜ backlog | P1 | design in Claude Design | Live workforce view: what's running now, queue depth, recent runs, cost/health. CEO review flagged run-observability as higher value than agent-config polish. |
| 3 | **Runs** | `/runs` | ⬜ backlog | P1 | design | Run history list: filter by agent/project/status, cost, duration, outcome. |
| 4 | **Run detail** | `/runs/:id` | ⬜ backlog | P1 | design | Single run: streamed transcript, tool calls, memory injected, artifacts, re-run. |
| 5 | **Projects** | `/projects` | ⬜ backlog | P2 | design | Project registry: rootDir, assigned agents, memory scope, recent activity. |
| 6 | **Memory** | `/memory` | ⬜ backlog | P2 | design | Vault browser + hybrid search, scope tree (global/projects/agents/inbox), embedder status. |
| 7 | **Tasks** | `/tasks` | ⬜ backlog | P2 | design | Task board: assign → agent spawn → status; kanban columns. |
| 8 | **Pipelines** | `/pipelines` | ⬜ backlog | P2 | design | Multi-step pipeline builder; `{{input}}` piping between steps. |
| 9 | **Schedule** | `/schedule` | ⬜ backlog | P3 | design | Cron jobs: create/edit/run-now, next-fire, scheduler pause toggle. |
| 10 | **Messages** | `/messages` | ⬜ backlog | P3 | design | Inbox: agent→agent + agent→you messages, reply/route. |
| 11 | **Terminals** | `/terminals` | ⬜ backlog | P3 | design | Embedded xterm sessions over `/ws/terminal/:id`. |
| 12 | **Settings** | `/settings` | ⬜ backlog | P3 | design | Config: concurrency, paths, theme, token, providers, backup. |

`placeholder.tsx` is scaffold, not a real page — excluded.

### Done
| Page | What shipped | Landed |
|------|--------------|--------|
| **Agents — Pass 1** | F1 SkillViewer slide-over · F2 split New-agent + Duplicate · F3 deterministic-first Agent Creator (+ `POST /api/v1/agents/draft`, shared `AgentFields`, `renderSkillMd()`) | PR #4 → `main` (`925f9a7`), 2026-06-28 |
| **Agent draft fix** | F3 draft repair-retry on JSON slip + smarter fallback naming (`fix/agent-draft-retry`) | merged to `main`, 2026-06-28 |

Board is clean — `fix/agent-draft-retry` merged and core restarted (2026-06-28).

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
