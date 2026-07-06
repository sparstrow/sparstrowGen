<!-- /autoplan restore point: ~/.gstack/projects/sparstrow-sparstrowGen/claude-dreamy-engelbart-874599-autoplan-restore-20260702-204613.md -->
# Sparstrowgen Master Engineering Plan

> **Status: 🔒 ALL 10 PHASES LOCKED — `Final gate: APPROVED` 2026-07-03.**
> All four /autoplan review phases (CEO, Design, Eng, DX) ran with independent code-grounded
> subagent voices; the owner answered every phase's questions and locked P1→P10 sequentially
> (audit trail below, decisions #1-104). Per the §0 process contract, **implementation may
> now begin**, executing phases in dependency order (P1 foundation first).
> Source inputs: `fable-handoff/FABLE_START_HERE.md` + the six antigravity architecture
> specs (`.design-src/{agents,teams,projects,execution,memory,access}/architecture.md`)
> + the existing codebase at commit `9a561d3`. Stack revised in §0.1 (owner, 2026-07-03).
> Author: Claude Fable 5. Owner: solo founder.

---

## 0. Process contract (owner decision D4, 2026-07-02)

Fable 5 is the primary implementation engine, replacing the external-agent routine in
FACTORY-LOOP §⑤ for engine work. But **no code is written until every phase below is
individually planned, questioned, and locked**:

1. For each phase: Fable presents the detailed plan + assumptions + risks + dependencies
   + **open questions**. Owner answers. The phase section gets a `LOCKED` marker with the
   answers folded in.
2. Only after **all** phases carry `LOCKED` does implementation begin, executing phases
   sequentially in the order below. *(CEO PR-6 mitigation)* At each phase's build start,
   Fable re-validates the locked section against current `main`; material drift
   re-escalates to the owner instead of building blind.
3. Implementation follows FACTORY-LOOP mechanics that still apply: branch off fresh
   `origin/main`, one atomic commit per task, `pnpm typecheck && pnpm test` green before
   push, push to `github-agent` remote, print compare URL, owner merges. `main` stays
   sacred. Commit author `@sparstrow.com`, no `Co-Authored-By` trailers.
4. Page *visual* redesigns (Claude Design exports) continue through the classic factory
   loop separately; this plan builds **functional** surfaces that later redesigns re-skin.

## 0.1 Stack revision (owner, 2026-07-03) — provider model changed

The Gemini CLI was retired for individual users (migrated to Antigravity 2.0), so it is
**out**. New provider model:

- **Claude Code CLI = primary** execution runtime (MCP tools, session resume, unchanged).
- **Direct-API providers** for Gemini and other LLMs (native function/tool calling).
- **Local models via Ollama** possible (also tool-calling capable).
- **Drop the legacy `sparstrow` fenced text-directive grammar entirely** (`handoff.ts`
  `applyDirectives`) — its only consumer was the Gemini CLI. `reconcileTask` (which runs
  for every task-triggered run) stays.
- **Build one unified tool-calling interface / MCP bridge:** a single capability registry
  (cross-cutting rule 20) exposes the same toolset two ways — the existing HTTP MCP
  server for Claude Code CLI, and **native tool schemas** (Gemini/OpenAI/Anthropic/Ollama
  function-calling) for the direct-API tool-loop. One source; no text-grammar to keep
  in sync.

**Consequences threaded through this plan:** **P8 (direct API) is no longer optional or
scope-challenged — it is foundational** (it is how every non-Claude model runs); C9's
scope challenge is withdrawn. Every DX/Eng finding about "gemini fenced grammar parity"
(EM6, DX-C3, old P1-Q4) is superseded by the unified tool-calling registry. `gemini-cli.ts`
becomes legacy/removed. The Windows stdio-MCP constraint (C5) still governs Claude Code
CLI; direct-API tools are in-process native calls (no transport issue).

## 1. Current state — what the factory already is (verified against code)

The handoff's wording ("Build the Fastify APIs, SQLite/Drizzle schemas, and Vite React
frontend") reads greenfield. It is not. Shipped and working at `9a561d3`:

| Subsystem | Code | State |
|---|---|---|
| Agents CRUD + Creator + `/draft` | `core/src/api`, `agents/draft-service.ts`, `skill-writer.ts` | shipped (Pass 1 + fix) |
| Teams (org-only, flat members) | `teams`/`team_projects`/`team_members` + API + UI | shipped (Pass 2) |
| Run engine (CLI spawn) | `orchestrator/run-manager.ts` — queue, global concurrency cap, per-agent busy set, timeout, orphan sweep, tree-kill, event bus, run_events | shipped |
| Providers | `providers/claude-code.ts` (primary, keep); `gemini-cli.ts` (**legacy — Gemini CLI retired, to be removed; direct-API replaces it, see §0.1**) | mixed |
| Memory | `memory_notes`+`memory_chunks`, hybrid vector+FTS (`embedder`, `search-store`), scope grammar `global`/`project:*`/`project:x`/`agent:self`/`agent:x`, injection (`injector.ts`), vault watcher, memory-cli, memory-mcp | shipped |
| Task board | `tasks` (inbox/todo/in_progress/review/done/failed), agent MCP tools `task_create` (with assignToAgent → orchestrator runs assignee) + `task_update` | shipped |
| Messages | `messages` (agent↔agent, agent→user via `toAgentId=null`, `spawnedRunId`) | shipped |
| Pipelines | `pipelines`/`pipeline_steps`/`pipeline_runs`, `{{input}}` piping, `pipeline-executor.ts` | shipped |
| Cron | `cron_jobs` + `scheduler/service.ts` | shipped |
| Terminals | xterm over `/ws/terminal/:id` | shipped |
| Security | bearer token on `/api` + `/ws`; per-agent git identity `agent@sparstrow.com`; runs execute in project `rootDir` when set | shipped |
| MCP | **HTTP** MCP (`mcp/http-mcp.ts`) — because headless Claude cannot connect stdio MCP on Windows (known constraint) | shipped |
| UI | All 14 route pages exist functionally (v0, pre-redesign) | shipped |
| Tests/CI | vitest wired; CI: `typecheck` + `author-check`; branch-protected `main` | shipped |

**Consequence:** this plan is a **delta plan**. Every phase below maps antigravity vision
→ existing leverage → net-new work.

## 2. Reference repos — what actually gets extracted

| Repo | What it is | What we take | What we do NOT take |
|---|---|---|---|
| `C:\Sparstrow\temp-ruflo` (Ruflo/claude-flow) | Massive agent meta-harness | **`v3/goal_ui/src/lib/goapPlanner.ts`** — pure-TS A* GOAP planner (portable), plus goal-planner agent prompt patterns | The harness itself (Sparstrowgen IS the harness), MCP tool zoo, swarm runtime |
| `C:\Sparstrow\temp-graphify` | Python lib + skill: `detect→extract→build_graph→cluster→analyze→report→export`, MCP stdio server, watch mode, Obsidian export | Installed as **pinned external tool** (`uv tool install graphify==X.Y.Z`); we consume `graphify-out/graph.json` + CLI/`serve` | Forking the code; auto-updates |
| `C:\Sparstrow\temp-gbrain` | Full memory product (TS) | **Methods reimplemented natively**: dream-cycle dedup/synthesis, contradiction detection, typed schemas, wikilink auto-linking, synthesis-over-search | The repo/product itself |

## 3. Conflicts registry — where the antigravity specs disagree with locked reality

Resolved conflicts become locked decisions at the phase gates. **[C#] tags are referenced
throughout the phase sections.**

| # | Conflict | Resolution path |
|---|---|---|
| C1 | Handoff reads greenfield; app exists | Delta plan (this document). Premise gate. |
| C2 | `spawn_subtask` + ephemeral teams vs **locked D5** (agents are templates; project-scoped *instances* with isolated `agent:self` memory are created at deploy/run time — deferred to "the run/deploy design") | **P3 IS that design.** D5 must be honored or explicitly amended at the P3 gate. |
| C3 | agents-arch §5 "remove the 40-line SKILL.md limit" vs Pass-1 lock P3.4 ("<40 lines = Creator guidance only; generator never truncates") | Generator already never truncates. P9 relaxes the *Creator prompt guidance* — amend P3.4 at P9 gate. |
| C4 | execution-arch swarm "Queen enforces consensus before final commit" vs FACTORY-LOOP "routine never merges; owner merges" | Consensus gate is *pre-push*, human merge stays. No real conflict — codified in P6. |
| C5 | memory-arch "ephemeral graphify MCP stdio server per task" vs **Windows constraint: headless Claude cannot connect stdio MCP** (why core serves HTTP MCP today) | Graph access must be proxied through core's HTTP MCP as core-side tools. P5 gate. |
| C6 | teams-arch ephemeral teams "deleted when task hits done" vs run/task history integrity (FKs cascade; deleting team erases the grouping history) | Propose soft-dissolve (archived flag) — P3 gate question. |
| C7 | Phase-6 foresight "include a user_id column structure" vs YAGNI on a single-user local DB | Options at premise gate: physical nullable `user_id` columns on new tables vs a written portability contract only. |
| C8 | APP.md board (11 pages `⬜ backlog` awaiting Claude-Design) vs engine phases building functional UI on those same pages | Functional-first: engine phases build working UI; visual redesign re-skins later. APP.md gains an "Engine phases" track. Premise gate. |
| C9 | ~~agents-arch §7 multi-provider direct API vs CLI-harness~~ | **WITHDRAWN (§0.1)** — direct API is now the required path for every non-Claude model, not an optional add. P8 is foundational; core owning a tool-loop is the plan, not a risk. |
| C10 | teams-arch circuit breaker "3 messages per task" — arbitrary constant | Make it a setting; default 3. P3 gate. |

## 4. Reorganized build order (the handoff asks for this explicitly)

Antigravity's numbering (1 Agents → 2 Teams → 3 Projects → 4 Execution → 5 Memory) is
vision-order, not dependency-order. Rebuilt as ten phases, foundation-first:

```
P1 Task Lifecycle ──┬─▶ P3 Delegation & Swarms ──▶ P6 GOAP Engine + Node Graph ──▶ P10 Team Workspace
   & Escalation     │        ▲                          ▲
P2 Permission ──────┘        │                          │
   Hierarchy                 │                          │
P4 Projects Workspace ───────┴──▶ P5 Smart Memory ──────┘
   (sandbox, variants)             (graphify+gbrain)
P7 Git Automation ──────────── independent, parallelizable after P4
P8 Direct-API Providers ────── independent (scope-challenged)
P9 Creator + Skill Specter ─── after P4 (sandbox) + P5 (memory scans)
```

| Phase | Title | Source specs | Size (CC) | Depends on |
|---|---|---|---|---|
| P1 | Task lifecycle & human escalation | agents §1 | S-M | — |
| P2 | Hierarchical tool permissions | agents §2, projects §3 | S | — |
| P3 | Delegation, team-bounded swarms & agent instances | agents §4, teams §3-4, locked D5 | L | P1, P2 |
| P4 | Projects workspace (git, directives, sandbox, variants) | projects §1-2, §4-7 | M-L | P1 |
| P5 | Smart memory (code graph [amended: codebase-memory-mcp] + gbrain methods) | memory §1-6 | L | P4 |
| P6 | GOAP engine + visual node graph | execution §5-7 | L-XL | P1, P3 |
| P7 | Git automation & execution profiles | execution §1-4 | M | P4 |
| P8 | Multi-provider direct API | agents §7 | M-L | — (scope gate) |
| P9 | Exceptional creation + Skill Specter ingestion | agents §5-6 | M | P4, P5 |
| P10 | Team Workspace (scoped views, manager agent, canvas) | teams §1-2, north-star doc | L | P3, P6 |

Sizes: S ≈ a day of CC work, M ≈ 2-4 days, L ≈ 1-2 weeks, XL > 2 weeks (calendar time
with review; raw CC time is much smaller).

---

## P1 — Task lifecycle & human escalation  `[agents §1]`

**Objective:** agents run headless, escalate uncertainty upward (sub-agent → lead →
human), and blocked work *waits* instead of failing. The "Human Attention Required"
queue becomes the founder's daily control surface.

**Exists:** `tasks` statuses `inbox|todo|in_progress|review|done|failed`; `messages`
with `spawnedRunId` (agent→agent and agent→user); `injectedContext` on runs; run
resume via `sessionId` (Pass-1 `--resume` pattern in draft-service).

**Net-new:**
1. Schema (migration `0004`): `tasks.status` += `blocked`, `blocked_answered`,
   `pending_approval`, `waiting_children` *(EH1)*; `tasks.wake_payload` *(DX-C1 — NOT
   `injected_context`: `runs.injected_context` already means the memory-audit block in
   live code; reusing the name across tables is a latent-plumbing bug)*.
   **`task_questions` table** *(EM5 + DX-H4, replaces the JSON column)*:
   `id, task_id FK ON DELETE CASCADE, question, why_blocked, options JSON NULL,
   recommendation NULL, default_if_no_answer NULL, answer NULL, asked_by_run_id,
   asked_at, answered_at, applied_at`, index `(answered_at, asked_at)` — so the queue,
   badge, per-question composer (options render as buttons), "Answered today", and
   median-time-to-answer are single indexed queries and concurrent writes are row-level.
   `runs.lane` *(EH3)* + `RunCreate.resumeSessionId`/`lane`/`effectiveTools` *(EM2, one
   schema pass)*. `user_id` per rule 3.
2. `task_block(taskId, questions[])` — agent declares a dead end; run ends cleanly
   (result = partial progress note), task → `blocked`. Registered ONCE in the capability
   registry (rule 20) → MCP tool for Claude Code CLI + native tool schema for direct-API
   providers; no text-directive grammar (§0.1). *(DX-H4)* Each question is structured
   `{question, why_blocked, options?, recommendation?, default_if_no_answer?}` and the
   tool description instructs the agent to ask **specific, one-line-answerable** questions
   with options where possible — so the founder's composer stays decision-complete and
   median-time-to-answer is meaningful.
3. **Wake = persisted DB state machine, NOT bus subscriptions** *(EC1 — the central
   correctness fix)*: a wake is a single conditional transition
   `UPDATE tasks SET status='in_progress' WHERE id=? AND status IN ('blocked_answered','waiting_children')`
   — the sole gate against double-wake from the P1-answer and P3-watcher paths.
   `PATCH /api/v1/tasks/:id/answer` writes the answer row + flips `blocked→blocked_answered`;
   a requeue (fresh run PRIMARY per §assumptions, resume when claude-code-resumable)
   applies the wake transition. `sweepOrphans` and the queued-`cancel()` path are
   extended to reconcile tasks + emit events (today they don't — the orphan bug); wakes
   bypass or durably retry past `autoSpawnAllowed` (they are not throttleable background
   spawns). Reconciliation failures get a Master Registry row ("reconcile failed → lead
   orphaned → attention queue"), never a swallowed warn.
4. Sub-agent → lead escalation: `message_send` to lead with `taskId` linkage; lead's
   reply (or lead's own `task_block`) resolves it. **No process ever sleeps** — runs end;
   the completion-watcher is a *derived query* ("parent in `waiting_children` AND no
   non-terminal children") evaluated on `task.updated` **and** in a startup/periodic
   reconciliation sweep (survives restart).
5. UI (design-review binding contract): Dashboard "Human Attention Required" queue with
   **typed rows** — `question | approval | contradiction | git-failure | ready-for-review`
   — one taxonomy, one component; later phases add row TYPES, never new sections.
   The kanban does **NOT** grow a `blocked` column: blocked + pending_approval render as
   a full-width amber attention band above the 6-column board. Nav badge lives on the
   **Dashboard** nav item + a count chip in the shell header (visible everywhere).
   Task detail is promoted from Dialog to a route (`/tasks/:id`) or full-height sheet —
   P1/P2/P3/P6 all add content to it. Answer composer spec: card = task title + agent +
   project + age + agent's partial-progress note (collapsible, open by default) + one
   labeled textarea **per open question** + single "Answer & wake" action; post-submit
   the card mutates in place to "Waking… → view run", then moves to a collapsed
   "Answered today" group; the S4-a 409 renders as an amber "run still active — answer
   saved" pill.
6. *(CEO E3)* Dashboard wake/attention metrics: blocked-count trend, median
   time-to-answer, wake-guard trips.
7. *(CEO S4-a)* Answer submitted while the task's prior run is still `running` → 409
   "run in flight — answer saved, not applied"; applied on next wake.
8. *(DX foundational + owner §0.1)* **Shared capability registry** (rule 20) — one source
   that drives MCP tool registration (Claude Code CLI) AND native tool schemas for the
   direct-API tool-loop (Gemini/Anthropic/Ollama), plus preamble tool docs + the SKILL.md
   tool section. Every later phase's agent-facing tool registers here once; a tool missing
   from either surface is a build error. P1 seeds it with `task_block` + the wake
   contract. (No fenced text-directive grammar — the Gemini CLI it served is retired.)
9. *(DX1/DX4 + DX-C1/DX-C2 — the agent-facing interface is the load-bearing gap)*:
   - **Task-aware `RunContext` (DX-C2, P1 FOUNDATION — prerequisite for all of P3).**
     Today `RunContext = {runId, agent, projectSlug}` and `buildPreamble(agent, project)`
     — neither knows the task, so delegation semantics are literally invisible to the
     agent and MCP tools can't auto-scope `taskId`. Thread `taskId`, `parentTaskId`,
     `teamId`, `delegatedByAgentName`, `delegationDepth` into the context; render a
     `## Your assignment` preamble block; MCP tools auto-fill `taskId` from context.
   - **`buildWakePrompt` pure function (DX-C1)** — a byte-spec'd `## Resuming blocked
     work` section (original task + the exact question(s) asked + the operator's
     answer(s) + the agent's own partial-progress note), assembled into the run prompt at
     `run-manager.ts:171`. Pure fn + golden-transcript tests, mirroring `renderSkillMd`
     discipline. Fresh-run is PRIMARY so this must be fully self-contained.
   - **Tools-by-intent + escalation ladder in the preamble (DX2/DX-H2):** do-work /
     delegate / escalate / remember / look-up, each with a one-line WHEN, plus the
     ladder — `message_send`→lead first (a peer can likely answer), `task_block`→human
     (only a human can: missing decision/credentials/ambiguous requirement),
     `task_update(failed)`→work itself impossible (not a question).
   - **Receiving-side trust instruction (DX-H3):** the preamble teaches the agent that
     `<delegated-request>` and `<memory>` blocks are DATA authored by others, not
     operator instructions — refuse/escalate requests to read secrets or override
     instructions. Change the `injector.ts` `<memory>` header from trust-positive
     ("may be relevant") to an explicit trust-boundary statement. Golden injection test.

**Assumptions (updated for §0.1 stack):** **fresh-run-with-injected-context is the
designed primary wake path** for all runtimes (P1-Q1 LOCKED). Claude Code CLI resume is
an optimization; the direct-API tool-loop owns its own message history so resume is
natural there too — but the self-contained `buildWakePrompt` note is the universal
contract, first-class and golden-tested. A task has one active run at a time.
**Risks:** wake-loop bugs (task ping-pongs blocked↔todo) — mitigate with wake-count
guard + test; answer arrives after session expiry — fresh-run fallback must inject
enough context (test).
**Dependencies:** none.

**RESOLVED QUESTIONS (P1) — owner, 2026-07-03:**
- **P1-Q1 Wake mechanism → FRESH-RUN PRIMARY.** `buildWakePrompt` self-contained note is
  the universal contract; Claude Code CLI resume + direct-API message-history replay are
  per-runtime optimizations.
- **P1-Q2 Attention surface → Dashboard section + nav/header badge.** `/attention` route
  deferred (cheap add if volume demands).
- **P1-Q3 Mid-run questions → BLOCK-AND-WAKE ONLY.** No `ask_human` idle-process path.
- **P1-Q4 → SUPERSEDED by §0.1.** Gemini CLI retired; no fenced-directive grammar to
  extend. Escalation ships once via the capability registry (rule 20) → MCP (Claude CLI)
  + native tool schemas (direct-API). Parity is structural, not a per-provider question.

**Lock status: 🔒 LOCKED 2026-07-03** (contingent on the two-provider stack in §0.1; P1
is the foundation — capability registry, task-aware RunContext, wake state machine,
`task_questions` table — that P2/P3/P5/P6/P8 build on).

---

## P2 — Hierarchical tool permissions  `[agents §2, projects §3]`

**Objective:** one place to answer "what may this run touch?" — resolved
Global → Project → Task, deny-wins downward, with a UI audit matrix showing provenance.

**Exists:** `agents.allowedTools/disallowedTools/permissionMode` (per-agent, applied at
spawn); `/draft` clamp (no `bypassPermissions`, no wildcard) — the trust-boundary
pattern to reuse.

**Net-new (P2-LITE per gate — full resolver+matrix deferred):**
1. Schema (`0005`): `allowed_tools`/`disallowed_tools` JSON columns on `projects` and
   `tasks`; global defaults in `settings` (`tools.global.allowed/disallowed`). `user_id`
   n/a (join tables/existing tables) per rule 3.
2. `resolveEffectiveTools(agent, project, task, settings)` pure function in
   `packages/shared` (single source; unit-tested against a written truth table).
   **Order = Global → Agent → Project → Task** (P2-Q1 LOCKED — a project contains the
   agents in it, essential for sandbox/client isolation); **any level's disallow strictly
   beats any higher grant**; **empty allow-list = inherit/default at every level**
   (P2-Q2 LOCKED — restriction is always an explicit disallow, no silent strip).
3. `run-manager.ts` consumes the resolver when building provider args; the resolved set is
   the **immutable per-run snapshot** (`effective_tools` JSON) — providers (CLI + direct-
   API loop) read ONLY the snapshot, never the live agent row (EH5 TOCTOU fix). This is
   the security-critical piece and it SHIPS in lite.
4. **UI (lite):** effective-tools summary line on Run detail (the snapshot is the audit
   artifact). *(DEFERRED — full build)* the Global→Agent→Project→Task provenance matrix
   UI, added when a second human or untrusted-agent class exists → TODOS.

**Assumptions:** tool names are provider-native strings (per-runtime) — no cross-provider
normalization yet (TODOS). **Dependencies:** none; unblocks P3's subset-clamp.

**RESOLVED QUESTIONS (P2) — owner, 2026-07-03:**
- **P2-Q0 → P2-LITE.** Task-level columns + resolver + immutable snapshot + clamp ship;
  provenance matrix UI deferred.
- **P2-Q1 → Global → Agent → Project → Task.** Projects contain their agents.
- **P2-Q2 → Empty = inherit/default everywhere.** Restriction is always explicit disallow.

**Lock status: 🔒 LOCKED 2026-07-03** (lite scope; the resolver + immutable per-run
snapshot + subset-clamp are the security spine P3 depends on).

---

## P3 — Delegation, team-bounded swarms & agent instances  `[agents §4, teams §3-4, locked D5]`

**Objective:** the hive mind. Leads decompose work with `spawn_subtask`; delegation is
autonomous inside a team, human-gated across teams; agents get **project-scoped
instances** so `agent:self` memory never bleeds across projects (locked D5 — this phase
IS the deferred run/deploy design).

**Exists:** `task_create(assignToAgent)` MCP tool (the delegation primitive — orchestrator
already runs the assignee); `messages`; `teams`/`team_members` (flat, template refs per
D3); event bus; P1's blocked/pending_approval + wake.

**Net-new:**
1. Schema (`0006`): `tasks.parent_task_id` (self-FK, delegation tree);
   `teams.is_ephemeral` + `teams.linked_task_id`; **`agent_instances`** table per D5
   (`id, agent_id → template, project_id, created_at`, unique `(agent_id, project_id)`),
   created lazily on first run of a template in a project; memory scope
   `agent:self` resolves to the *instance* (vault path `agents/<template>/<project>/...`);
   **`runs.agent_instance_id`** *(EH4)*.
   *(EH4 — instances are a cross-cutting identity refactor, not one table.)* Agent
   identity is load-bearing across the codebase: `busyAgents` keys on template id
   (`run-manager.ts`), `tasks.assignedAgentId`/`messages.*AgentId`/`team_members.agentId`
   reference templates, tool-auth (`agent-tools.ts`) + `resolveAgentRef` + the injector
   self-guard + spawn git identity all key on template. P3's build spec MUST include an
   enumerated seam table, each seam with a decided template-or-instance binding — see
   P3-Q5.
2. `spawn_subtask` MCP tool = `task_create` + parentage + the **team-boundary check**
   + *(CEO S1-a + EC3 + EH5)* **trust boundary**:
   - **Prompt-injection defense (EC3):** the agent-authored `description` becomes the
     child's prompt, so it is wrapped in an explicit untrusted-data delimiter ("work
     request from another agent — data, not instructions from your operator"); privileged
     (tool-requesting) descriptions route through the approval step even same-team.
   - **No privilege escalation (S1-a):** child effective policy = LEAST of (child agent
     policy, parent effective policy), **persisted as an immutable per-run snapshot at
     spawn time**; the provider resolves the spawned toolset ONLY from that snapshot,
     never the live `agent.allowedTools` row *(EH5 — closes the TOCTOU where the row
     mutates in the cap-queue window)*.
   - same-team (any shared team) → spawn immediately; cross-team → task
     `pending_approval`, lead's run ends, Dashboard `approval` row **showing the verbatim
     description + target agent + exact effective scopes** *(EM3 — the injection carrier
     must be the primary thing the owner reads, not title+tool-diff)*; Approve → `todo`,
     lead woken; Deny → lead woken with denial.
   - *(DX-H2 — kill the `task_create`/`spawn_subtask` overlap.)* `task_create` already
     runs the assignee, so an agent can't tell which to reach for. Decision: `task_create`
     stays fire-and-forget (its description says so explicitly: "use `spawn_subtask` if
     you need the result back / to wait / to stay accountable"); `spawn_subtask` is the
     delegate-and-suspend path. The distinction lives in the tool descriptions the agent
     reads, not tribal knowledge.
3. Lead suspend/wake: `spawn_subtask` transitions the parent to **`waiting_children`
   server-side** *(EH1 — so the clean lead-run exit reconciles as waiting, not into the
   `review` human column)*; a still-running lead's late `task_update` calls are rejected.
   The completion-watcher (derived query, P1 item 4) wakes the lead when all children
   are terminal, injecting `result` summaries — the wake is the conditional transition
   OUT of `waiting_children`, idempotent by construction. *(DX1)* The child's preamble
   carries the delegation brief: parent intent, why-you, sibling context, escalation path.
   *(DX3)* Cross-team `pending_approval`, clamped tools, and circuit-breaker halts return
   **actionable agent-facing messages** (problem + cause + what-to-do), never bare codes.
4. Cross-team messaging circuit breaker: `message_send` counts messages per
   `(taskId, cross-team thread)`; hard limit from settings (default 3) → thread halted,
   task → `blocked`, escalation queue entry. [C10]
5. Ephemeral teams: multi-assign task creation auto-creates `is_ephemeral` team;
   dissolution on terminal status — **soft-archive** proposed over spec's hard delete
   [C6].
6. UI (design-review binding contract): delegation renders as **board affordances +
   detail tree** — child cards carry a parent chip, parent cards a children mini-meter
   ("3 · 1✓ 1▶ 1⚠"); the actual tree is an indented status-colored list inside task
   detail (explicitly NOT a canvas). Approvals appear as `approval`-type rows in the P1
   queue (tool-policy diff visible, Approve/Deny on the card); team detail shows
   ephemeral badge.

**Assumptions:** one level of delegation is the common case but the schema (self-FK)
supports N; concurrency cap already throttles fan-out (children queue).
**Risks:** wake-storms when many children finish simultaneously (debounce the watcher);
instance vault paths change memory layout — migration for existing `agent:self` notes
(they stay template-scoped; instances start clean — verify acceptable); approval queue
starvation if owner is away (tasks just wait — by design).
**Dependencies:** P1 (statuses/wake), P2 (children inherit task-level tool policy).

**RESOLVED QUESTIONS (P3) — owner, 2026-07-03:**
- **P3-Q1 → COPY template `agent:self` notes on first instantiate.** Preserves accumulated
  agent expertise; per-project divergence isolates from there.
- **P3-Q5 → KEY busy-tracking on the INSTANCE** (template+project). Different projects'
  instances run concurrently — the point of instances (global cap still bounds total).
- **P3-Q2 → PER-SPAWN cross-team approval.** Tightest control of the cross-domain boundary;
  standing-trust grants deferred until real patterns are observed (→ TODOS).
- **P3-Q3 → SOFT-ARCHIVE ephemeral teams** on terminal status (folded, C6 — keeps
  history + FK integrity; hard delete rejected).
- **P3-Q4 → DELEGATION DEPTH CAP = 3, configurable in settings** (folded — bounds runaway
  recursion + cost).

**Lock status: 🔒 LOCKED 2026-07-03** (largest phase; the instance-identity seam table
[EH4] is its biggest single item — every agentId seam gets a decided template-or-instance
binding, `busyAgents` keyed on instance, `runs.agent_instance_id` added).

---

## P4 — Projects workspace  `[projects §1-2, §4-7]`

**Objective:** Projects become the physical + contextual boundary: bound to a real
directory with visible git state, carrying directives and auto-indexed memory, with
sandboxed imports and client-variant forking (the VitalHIS → Clinic A/B model).

**Exists:** `projects.rootDir` + CWD enforcement at spawn; memory `project:` scope +
injection; cron; `messages`; UI projects page (v0 grid).

**Net-new:**
1. Schema (`0007`): `projects.parent_project_id` (variants), `projects.is_sandbox`,
   `projects.directives` (or directives as pinned `memory_notes` — see P4-Q2),
   `projects.git_remote` (nullable).
2. Git awareness: core service (`isomorphic-git` or shelling to `git` — shell, it's
   already a host dependency) exposing branch/dirty/recent-commits per rootDir;
   project card + detail header show it. Read-only in this phase (writes are P7).
3. Creation modal, three paths: scratch (mkdir + optional `git init`), existing folder
   (bind), GitHub import (public `git clone` now; authed clone lands with P7 PATs).
4. Auto-indexing: on create/refresh, background task summarizes key files (existing
   one-shot runner with a system indexer agent) → writes `project:`-scoped notes.
   (Upgraded by P5's graph pass [codebase-memory-mcp]; this phase ships the plumbing + naive summaries.)
5. Directives: guaranteed-injection project rules — injector prepends directives
   (never trimmed by token budget) for any run in that project.
6. Morning briefing: system "Project Reporter" agent + per-project cron (opt-in),
   scans recent runs/tasks/commits → writes a briefing artifact surfaced on the
   project dashboard + user inbox message.
7. Sandbox import: import flows offer sandbox toggle → `is_sandbox=true`; sandboxed
   projects get an isolated memory namespace (project scope flagged non-global-searchable,
   excluded from cross-project synthesis), promotion = explicit un-flag + note migration.
   *(EH7 — the isolation is not just "strip global".)* Sandbox and untrusted-content runs
   clamp effective **WRITE** scopes to `project:<sandbox>` only — stripping `global` AND
   `agent:self` AND any `project:x != sandbox`, because `agent:self` resolves to the
   template (cross-project) and would leak sandbox writes into the same template's trusted
   runs. **Dependency:** P3's instance-aware `agent:self` resolution must land before or
   with P4 sandbox (and P9 extractor) — added to the phase order.
8. Client variants: "Create client variant" on a base project → clone repo to sibling
   dir, copy base project's memory notes (physical copy), create project row with
   `parent_project_id`; "Sync from base" button spawns a review task (agent merges
   upstream changes deliberately — never auto-merge) per spec §7.
9. UI: project workspace detail per Cowork pattern — main stage (task launcher input +
   activity feed) + right sidebar (Directives, Memory, Scheduled, Files tree).

**Assumptions:** host `git` binary available (already required by the factory's own
workflow); variants clone from local base dir, not GitHub.
**Risks:** auto-index cost on big repos (cap file count/size, background priority);
sandbox leakage via `global` write scopes (sandbox runs get write scopes filtered to
the sandbox project — enforce in scope expansion, test it).
**Dependencies:** P1 (briefing/attention integration benefits).

**RESOLVED QUESTIONS (P4) — owner, 2026-07-03:**
- **P4-Q3 → COPY PROJECT-SCOPE NOTES ONLY** on variant fork. Shared architecture inherits
  cleanly; agent instances start fresh (and copy their template self-notes per P3-Q1).
- **P4-Q1 → OPT-IN per project** for morning briefings (background LLM cost discipline,
  rule 5).
- **P4-Q2 → DEDICATED `project_directives` table** (ordered, toggleable) — explicit
  always-inject contract, not a tag convention.
- **P4-Q4 → READ-ONLY file tree.** open-in-editor deferred (trivial later add → TODOS).

**Lock status: 🔒 LOCKED 2026-07-03** (git binding read-only here; writes are P7. Sandbox
WRITE-scope clamp [EH7] + P3-instance-resolution-before-sandbox ordering are mandatory).

---

## P5 — Smart memory: code graph + gbrain methods  `[memory §1-6]`

**Objective:** memory stops being flat notes: a per-project **code knowledge graph**
(codebase-memory-mcp — amended from graphify 2026-07-05), **typed** memory entries, nightly **dream-cycle** consolidation with
contradiction flags, **passive signal capture** from run transcripts, and
synthesis-over-search answers with citations + gap analysis.

**Exists:** hybrid vector+FTS search; scoped vault; chunker/embedder/indexer/watcher;
injector; cron scheduler; run transcripts (`run_events` + `resultText`).

**Net-new:**
1. **[AMENDED 2026-07-05 via /autoplan — graphify is OUT]** Code-graph engine =
   `codebase-memory-mcp` v0.8.1 (DeusData; MIT C static binary, stdio-only MCP,
   tree-sitter, per-store SQLite WAL). Full reviewed amendment (57-row audit
   trail, spike report, owner gates) in the 2026-07-05 /autoplan plan file.
   - Binary manager: per-platform SHA-256 **pinned in core source** (release
     checksums.txt never trusted), atomic install (temp→rename→health→marker),
     System32-bsdtar extraction (Windows assets are .zip), explicit Settings
     install (T-a — a predictable Defender moment, never a silent fetch);
     **feature-degrades** (factory fully functional without it).
   - Core = stdio MCP CLIENT to per-project child processes (C5: headless
     Claude→stdio is broken; core→child pipes are not — spike-verified 63 ms
     handshake). Per-project `CBM_CACHE_DIR` stores = **isolation by
     construction** + real-engine leakage proof e2e; pool caps 3 live children,
     LRU idle-stop, promise-gated spawn, 3-class timeouts (a request timeout
     never kills a child mid-index), crash-loop breaker → Settings Retry,
     PID-file orphan sweep (Windows delivers no SIGTERM).
   - **Curated 7 read-only agent tools** (UC1: search_graph, trace_path,
     query_graph, get_graph_schema, get_code_snippet, get_architecture,
     detect_changes) via the capability registry with **spawn-pinned
     availability** (#49/L929: the gate folds into the run's effective-tools
     snapshot, so surface ≡ preamble ≡ P3 clamps for the run's lifetime; mid-run
     degradation = DX3 isError naming the Grep/Read fallback, never
     method-not-found). Schemas are project-STRIPPED (core injects the project
     server-side). Lifecycle tools stay core-internal; manage_adr/ingest_traces/
     search_code excluded (→ TODOS).
   - Index lifecycle: create (auto) / Reindex (manual — the sandbox opt-in) /
     nightly sweep, ALL through a global depth-1 semaphore (scheduler lanes
     never see direct stdio calls); sandboxes never auto-index; **P4's naive
     notes pass REMAINS** (graph is additive — regression-guarded); engine
     version bump wipes stores (derived data); interrupted-index reconcile at
     startup. Status = `.index-status.json` per store (no migration) + ws.
   - Query-heuristics ladder (≤250 tok, spike-frozen Cypher examples) appended
     to the preamble ONLY when the full graph surface is available.
   - 3D viz (UC2): new-tab, launch-on-demand, default-off; randomized
     127.0.0.1 port; child lives while core holds stdin (spike ⑥); 15-min
     idle-stop with honest dead-tab copy; sticky `--ui` flag reset on stop.
2. Typed memory (`0008`): `memory_notes.type` enum
   `note|decision|architecture|pitfall|meeting|lesson` (default `note`, existing rows
   migrate to `note`); type filter in search API + Memory UI facets; agent `memory_write`
   tool gains `type` param.
3. Wikilink auto-linking: `[[Note Title]]` parsed at index time → `memory_links` table
   (from_note, to_note, unresolved_title) — hard edges, no LLM cost; Memory UI shows
   backlinks.
4. Passive signal detection: on `run.completed`, a signal-extractor pass (cheap model,
   capped tokens) scans the transcript for decisions/pitfalls/architecture claims →
   writes typed, `source='signal'` notes tagged with runId provenance. Budget-capped +
   per-agent toggle. **Queue-routed through `runs.lane`, never `completeOnce`, with a
   trigger-type recursion guard** so extractor runs don't extract themselves or bypass
   the concurrency cap *(EH3)*. **Signals from any run that consumed untrusted/external
   content are quarantined** — written at agent/sandbox scope, non-injectable until the
   owner approves them, because an injected "pitfall" note is a stored second-order
   prompt-injection channel *(EH6)*. Injected memory is labeled untrusted data in the
   prompt block so a note body cannot pose as operator instructions.
5. Dream cycle: nightly cron **per active project, strictly isolated** [spec]:
   dedup near-identical notes (embedding similarity + LLM confirm), merge/synthesize
   overlapping ones (originals soft-archived, synthesis cites sources), contradiction
   pass (sampled pairs → `contradiction` flags surfacing in Attention queue [P1]).
6. Synthesis-over-search: `memory_search` tool gains `synthesize: true` mode — top-k
   hits → synthesized answer with citations + "gaps: what memory doesn't know" line
   (gbrain-think pattern); UI search offers the same toggle.
7. LESSONS overlay **[re-specced by the 2026-07-05 amendment — no `reflect`
   equivalent exists]**: lessons are typed memory notes storing portable
   `(filePath, symbolName)` refs (NEVER the engine's qualified-name grammar —
   data-level vendor-coupling refused), resolved to engine names at query time
   by one core-owned translation fn; lessons render in Memory UI per project.
8. *(CEO E1)* Run-detail memory provenance panel: which notes/directives entered this
   run (persist the injector's manifest on the run row; render in Run detail).

**Assumptions:** embedding model already local; nightly LLM budget acceptable when
capped. *(Python/uv host dependency DELETED by the 2026-07-05 amendment — the
engine is a zero-dependency static binary.)*
**Risks:** dream-cycle rewriting memory wrongly (mitigate: soft-archive originals,
never hard-delete, daily digest to inbox); engine version drift (pinned SHA
constants in source, manual upgrade PRs only; version bump wipes derived stores);
upstream bus-factor ≈1 (mitigate: adapter seam behind the registry, mirror pinned
release artifacts); signal-detector noise (type it `source='signal'`, reviewable,
bulk-delete tool).
**Dependencies:** P4 (projects lifecycle hooks).

**RESOLVED QUESTIONS (P5) — owner, 2026-07-03:**
- **P5-Q5 → EXTRACT temp-gbrain's algorithms** (dedup/synthesis/contradiction) into
  Sparstrowgen's own memory schema; skip its storage layer. Not reimplement-from-scratch,
  not wholesale-embed.
- **P5-QS → KEEP P5 AS ONE PHASE.** Owner wants the complete memory build together
  (graphify + typed notes + wikilinks + dream cycle + signals + synthesis). Cost
  discipline still applies via the folds below.
- **P5-Q2 → NIGHTLY-BATCH signal extraction** inside the dream cycle (one cheap pass over
  the day's transcripts, cheap direct-API model), not per-run. Untrusted-content signals
  quarantined (EH6).
- **P5-Q1 → dream cycle OFF until enabled per project** (folded — rule 5 cost discipline).
- **P5-Q3 → contradictions FLAG-ONLY** to the Attention queue (folded — no auto-resolve).
- **P5-Q4 → graph refresh on "Reindex" + nightly** (folded — not file-watcher).

**Lock status: 🔒 LOCKED 2026-07-03** (monolithic; every feature degrades gracefully +
cost-capped per premises PR-5; graph engine via core stdio-client proxy re-exported over HTTP MCP, never agent-direct stdio [C5, amended 2026-07-05]; per-project
dream-cycle isolation mandatory).

---

## P6 — GOAP engine + visual node graph  `[execution §5-7]`

**Objective:** the factory gets its engineering manager. A plain-English goal becomes an
explicit precondition/effect plan (A*), rendered as a live node graph; failures trigger
replanning instead of task death; plan nodes fan out to the swarm (P3).

**Exists:** ruflo's `goapPlanner.ts` (pure-TS A*, portable); tasks + delegation tree
(P3); pipelines (linear); event bus + WS (live updates already stream to UI).

**Net-new:**
1. GOAP core (`packages/core/src/goap/`): port/adapt the A* planner; domain model
   `{state: Record<string,bool>, actions: {id,label,pre[],effects[],cost,agentHint}}`.
   **The LLM writes the domain, the algorithm orders it:** a Planner (manager) agent
   turns goal + project context (graph/memory) into candidate actions with
   preconditions/effects (strict JSON, zod-validated, repair-retry — reuse Pass-1
   draft patterns); A* finds the path; invalid/unsolvable domains bounce back to the
   Planner with the solver's diagnostic.
2. Schema (`0009` — **DDL shape decided behind P6-Q0**, EM4): `goals` (id, projectId,
   teamId?, prompt, status, worldState JSON); `plan_nodes` (goalId, actionId, label,
   pre/effects JSON, `plan_version`, taskId → materialized task, position — status is
   DERIVED, not stored). Under GOAP `plan_edges` is a render cache recomputed on every
   plan write (never hand-mutated); under the P6-Q0 DAG alternative edges become
   authoritative and pre/effects JSON optional — a different migration. Do not freeze
   0009 until P6-Q0 resolves.
3. Executor *(EH2 — must not repeat the pipeline-executor in-memory-await anti-pattern)*:
   ready-node detection (all preconditions satisfied by world state) → materialize as task
   (P3 spawn, team-bounded rules apply) → on task terminal, apply effects to world state,
   advance. **Node status is a DERIVED mapping from task status** *(EM4)*: `review` (agent
   never called `task_update`) → node stays `running` with a needs-review flag, effects
   NOT applied; `pending_approval` → `ready-held`; effects apply only on task `done`;
   replan only on `failed`. **Executor state lives entirely in `goals`/`plan_nodes` rows
   with a startup reconciliation pass** — no in-memory awaits (and fix the existing
   `pipeline_runs` orphan-sweep gap while here). **Adaptive replanning with a barrier:**
   on node failure, join-or-cancel in-flight sibling nodes, then re-run A*; **every effect
   application is stamped with plan version and effects from superseded versions are
   discarded** (unversioned application after replan silently corrupts world state).
   Diff old/new; superseded → `skipped`. Replan limit (settings, default 3) → goal
   `blocked` (P1 escalation).
4. Consensus gate [C4]: goal-level setting — before the final "export" node (P7 push),
   a Reviewer-role run must approve; disagreement → `blocked` with both positions.
5. UI — the Node Graph: React Flow canvas on Goal detail (route under `/tasks`):
   nodes colored by status (green glow on done per vision), edges = dependencies,
   live via existing WS bus events; click node → task/run drill-in. Replan renders as
   a visible plan-version timeline ("v2 — replanned after node X failed").
   *(CEO E2)* Run controls on the graph: pause goal, cancel node (existing cancel API),
   retry node. *(CEO S1-b)* The Planner consumes P2's `resolveEffectiveTools` when
   emitting `agentHint`s so plans never assign work the agent can't execute. First P6
   implementation task = write + review the domain zod schema (temporal finding).
6. Goal launcher: "New goal" on Tasks page + project workspace main stage input (P4)
   gains a Goal mode.

**Assumptions:** A* domain stays boolean-flag world state (ruflo's model) — rich state
is the Planner's job to encode; typical plans ≤ ~20 nodes.
**Risks:** LLM-authored preconditions/effects can be inconsistent (unsolvable or
trivially-satisfied plans) — solver diagnostics + bounce-back loop + hard replan cap;
node-graph UI scope creep (ship read-only first, editing lands in P10 canvas);
world-state drift vs reality (effects claimed but not delivered) — verifier hook per
node type where checkable (typecheck/test nodes verify themselves).
**Dependencies:** P1 (blocked/escalation), P3 (spawn + team bounds). P5 enriches
Planner context but is not required.

**RESOLVED QUESTIONS (P6) — owner, 2026-07-03:**
- **P6-Q0 → HEAD-TO-HEAD AT BUILD GATE.** Keep the schema + React Flow node graph +
  replanning regardless; decide A*/GOAP vs LLM-planned-DAG by a **written comparison on
  real goals** before committing the engine. `0009` DDL stays deferred behind this (EM4).
  GOAP wins only if the comparison shows concrete replanning/explainability gains.
- **P6-Q1 → INSIDE `/tasks` as a Goal mode/tab.** Matches the handoff's "Tasks/Pipelines
  UI"; the single launcher (rule 16) already has a Goal mode.
- **P6-Q2 → React Flow** (already settled by design rule 15 — the one canvas).
- **P6-Q3 → CONSENSUS GATE ON for goals ending in a push/PR node** (skipped for pure
  analysis/planning goals). Reliable push-node detection required.
- **P6-Q4 → pipelines and GOAP goals stay SEPARATE for now** (folded — P10 canvas may
  unify later; migrating pipelines onto plan graphs now is premature).

**Lock status: 🔒 LOCKED 2026-07-03** (engine decided at build via P6-Q0 head-to-head;
executor row-recoverable + replan barrier + derived node status [EH2/EM4] mandatory).

---

## P7 — Git automation & execution profiles  `[execution §1-4]`

**Objective:** blast-radius control becomes code: agents can only ever produce branches
and PRs, authored as the machine user, with profile-appropriate targets (factory → PR
to `main`; product apps → PR to `staging`), and secrets never enter agent context.

**Exists:** per-agent git identity injection (`agent@sparstrow.com`); runs CWD-scoped
to rootDir; `github-agent` SSH remote pattern (this repo's own flow); CI author-check.

**Net-new:**
1. *(EC2 — the real threat is a resident agent reading the DB, not disk theft.)* Two
   root-cause fixes, both mandatory:
   - **Child env from an explicit allowlist** at all three spawn sites (`run-manager.ts`,
     `one-shot.ts`, `terminal/manager.ts`) — stop spreading `{...process.env}` into agent
     processes. An env-whitelist *test* is not enough; the spread itself must go.
   - **PAT out of the app DB.** It lives in an OS keychain or a key file OUTSIDE the
     agent-readable data dir (the `settings` SQLite row sits in the same file any
     Bash/Read agent can open); agent tools are denied filesystem access to
     `config.dataDir` + the DB. Used only by core-side git ops.
   PAT masked in UI, never injected into agent env.
2. Execution profiles on projects (`0010`: `projects.execution_profile`
   `factory|production_app`, `projects.staging_branch`): profile decides PR target and
   guard rails (spec §2 flows).
3. Guard rails (core-enforced, not prompt-enforced): a git-ops service wraps
   branch/commit/push/PR; refuses push to `main`/`staging` refs; branch naming
   convention (`agent/<task-slug>`); PR creation via GitHub API with PAT (graduating
   FACTORY-LOOP's manual compare-URL step).
4. Secret isolation audit: deploy secrets live in CI/Vercel only [spec §1]; agent env
   built from a whitelist — add a test asserting no `*_TOKEN`/`*_KEY` settings leak
   into spawn env.
5. Phase-2-later (orchestrator-mediated push where agent has no network) is **not**
   built now; the git-ops service is shaped so the swap is a config flip [spec §3].
6. UI: the **aggregate PR queue lives on the Dashboard** (repo, branch, checks status,
   open link — the founder's #2 morning activity must not require visiting N project
   pages); project detail shows the filtered per-project view + profile badge.

**Assumptions:** GitHub remains the host; free-plan advisory branch protection on
product repos is acceptable (owner discipline gate) [spec §4].
**Risks:** PAT scope creep — document exact fine-grained permissions (contents:rw,
pull_requests:rw on named repos); PAT in SQLite at rest (single-user local machine —
P7-Q1 decides posture).
**Dependencies:** P4 (projects carry the profile).

**OPEN QUESTIONS (P7):**
**RESOLVED QUESTIONS (P7) — owner, 2026-07-03:**
- **P7-Q1 → KEY FILE outside the agent-readable data dir now** (encrypted, machine-local
  key); migrate to OS keychain when Electron lands. Agents denied FS access to data
  dir + DB; token never in agent env (EC2).
- **P7-Q2 → CORE OPENS PRs via the GitHub API** with the PAT — graduates the manual
  compare-URL step; owner still reviews + squash-merges every PR.
- **P7-Q3 → DEFAULT all existing projects `factory`**; flip client-product repos to
  `production_app` manually.

**Lock status: 🔒 LOCKED 2026-07-03** (explicit-allowlist child env at all 3 spawn sites +
PAT-out-of-DB [EC2] are mandatory; guard rails core-enforced, not prompt-enforced).

---

## P8 — Multi-provider direct API + unified tool-calling  `[agents §7, owner §0.1]`  ★ FOUNDATIONAL

**Objective:** direct-API providers (Gemini, Anthropic, OpenAI, Ollama-local) are **the
way every non-Claude-CLI model runs** (§0.1). Core owns a tool-call loop that exposes the
**same capability registry** (rule 20) as native function schemas, so a direct-API agent
has the identical toolset a Claude Code CLI agent gets via MCP. This is the "unified
tool-calling interface / MCP bridge" the owner specified — not an optional provider column.

**Net-new:**
1. `agents.execution_mode` (`cli|direct_api`) + provider adapter interface in
   `providers/` with a **tool-loop runtime**: registry → native tool schemas per provider
   (Gemini function calling, OpenAI/Anthropic tools, Ollama tools); loop: call → tool
   dispatch (in-process, no MCP transport) → result → continue; `run_events` normalized
   identically to CLI so Runs UI + `recordEvent`/`finalize` are provider-agnostic (reuse
   the extracted spawn→stream→finalize core, EM2).
2. Key vault per provider (P7 at-rest posture — keychain/key-file, NOT app DB, EC2).
3. `POST /api/v1/providers/discover-models` — live model list per key, cached; Creator +
   agent-form dropdowns consume it. Ollama discovery = local `GET /api/tags`.
4. Adapters: **Anthropic API** (dogfoods the main brain) + **Gemini API** (`@google/genai`)
   + **Ollama** (local, no key). OpenAI when a concrete need appears (TODOS).
5. The direct-API tool-loop OWNS its message history, so "resume-on-wake" is natural
   there (replay the array) — but fresh-run-with-injected-context (P1-Q1 lock) stays the
   universal contract; resume is the per-runtime optimization.
6. Tool availability by runtime: file/terminal tools require a real working dir — direct-
   API reasoning agents (Planner, Reviewer, signal-extractor) run cheaper/faster than CLI
   cold-starts and are the ideal fit; the resolved-toolset preamble (rule 22) tells each
   agent exactly what it has, so there is no "why can't my API agent edit files" confusion.

**Assumptions:** every target provider supports native tool calling (true for
Gemini/OpenAI/Anthropic/Ollama). **Risks:** two execution runtimes to test forever
(mitigate: shared finalize/normalize core + the same registry — divergence is a build
error, rule 20); a provider without tool calling would need the loop to degrade (none
targeted). **Dependencies:** rule 20 registry (P1 foundation); benefits P5 (cheap signal
extraction) + P6 (Planner turns) directly.

**RESOLVED QUESTIONS (P8) — owner, 2026-07-03:**
- **P8-Q3 → KEEP AT P8.** Prove the foundation (P1-P7) on the primary Claude Code CLI
  runtime first; add other providers after. P5 signals / P6 planner run on Claude CLI
  until P8 lands (accepted).
- **P8-Q1 → ANTHROPIC API FIRST** (dogfood the main brain, best-tested tool-calling SDK),
  then Gemini, then Ollama.
- **P8-Q2 → OLLAMA FAST-FOLLOW** after the cloud adapters (additive; add on concrete
  local/offline need).

**Lock status: 🔒 LOCKED 2026-07-03** (foundational per §0.1; tool-loop reuses the extracted
spawn→stream→finalize core [EM2] + the capability registry [rule 20]; `run_events`
normalized identically to CLI so Runs UI is provider-agnostic).

---

## P9 — Exceptional creation + Skill Specter ingestion  `[agents §5-6]`

**Objective:** agent creation becomes context-aware (duplicate detection, memory-informed
prompts, no artificial length ceiling) and the factory can ingest external agent/skill
definitions through a security quarantine instead of trust-on-import.

**Exists:** Agent Creator (deterministic-first + AI interview), `/draft` endpoint with
clamps, `renderSkillMd`/skill-writer, FIND intent (client-side), memory search, P4
sandbox machinery, P5 typed memory + graph tools.

**Net-new:**
1. Creator pre-flight: before drafting, `/draft` service runs (a) registry scan
   (embedding-similarity over existing agents' role+prompt → "you already have X,
   87% similar — use/update instead?") and (b) memory scan (global + project standards)
   folded into the interview context [spec §5].
2. Prompt ceiling: drop the <40-line guidance from the Creator prompt [C3 — amends
   Pass-1 P3.4]; structured multi-section SKILL.md (inputs required, output contracts,
   constraints, loops) via section-by-section generation; generator still never
   truncates.
3. Ingestion pipeline *(EH8 — "read-only" and "can clone+graphify hostile repos" are
   incompatible if clone/Bash are agent tools)*: **core clones the repo** (not an agent
   tool); the Intelligence Extractor then runs **Read-only, no Bash, no network,
   cwd-jailed to the sandbox clone**; graph indexing runs with network disabled and
   repo-provided config/hooks ignored (extract/analyze tools often execute project code).
   Found skills reconstructed as **quarantined draft agents** (disabled, sandbox-scoped
   memory, no tool grants). Boundary test vs an actively hostile fixture repo (attempted
   exfil + code-exec + injection) is mandatory, not optional.
4. Skill Specter inspection: static checks (tool requests vs policy, URL/exfil
   patterns, prompt-injection heuristics) + LLM security review with a strict rubric →
   report card per import: pass/flag/block + suggested modifications [spec §6].
5. Promotion workflow: quarantine UI page (under Agents) — diff-style review of the
   draft agent + Specter report → "Promote" (enable, real scopes, tool grants you
   approve) or "Discard". 1-click per spec.
**Assumptions:** imports are occasional (no bulk pipeline UX needed); Specter is
advisory + gating UI, not a formal sandbox executor.
**Risks:** false confidence — Specter pass ≠ safe; promotion UI must show raw
SKILL.md, not just the report (owner reads before enabling). Prompt-injection of the
*extractor itself* while reading hostile repos — extractor runs with read-only tools,
sandbox project, no memory write outside sandbox (test this boundary).
**Dependencies:** P4 (sandbox), P5 (graph/memory scans). P8 optional (cheap review runs).

**RESOLVED QUESTIONS (P9) — owner, 2026-07-03:**
- **P9-Q1 → ADVISORY duplicate detection** (suggest, never hard-block creation).
- **P9-Q2 → DEDICATED Skill-Specter security-reviewer agent** with a pinned rubric (not
  the general drafting model).
- **[C3] confirmed:** P9 relaxes the <40-line SKILL.md guidance to structured
  multi-section prompts (amends Pass-1 lock P3.4; generator still never truncates).

**Lock status: 🔒 LOCKED 2026-07-03** (extractor runs core-clone / read-only / no-network /
cwd-jailed [EH8]; hostile-fixture boundary test mandatory; raw SKILL.md always shown before
promote + explicit "I read the skill" ack).

---

## P10 — Team Workspace  `[teams §1-2, north-star doc]`

**Objective:** the north-star convergence: `/teams/:id` becomes a workspace — filtered
viewports over the global tasks/pipelines/schedule (never forked state), a dual-mode
Team Manager Agent (advisor chat + draft-a-workflow), and an n8n-style canvas where
drafts are reviewed, edited, and published to the global registry.

**Exists:** teams (P3-extended), tasks/pipelines/cron tables + APIs, P6 React Flow
canvas + plan graphs, P3 delegation, messages.

**Net-new:**
1. Schema (`0011`): nullable `team_id` on `tasks`, `pipelines`, `cron_jobs` (+ indexes);
   backfill null (global). Surface ownership rule [spec §1]: global pages remain source
   of truth; team pages filter by `?teamId=`.
2. Team workspace tabs: Tasks / Pipelines / Schedules / Members — same components as
   global pages, mounted with the filter (component reuse, no forked UIs).
3. Team Manager Agent: per-team chat panel.
   - **Advisor mode:** answers from roster + team-scoped activity + memory.
   - **Draft mode:** emits Draft Pipeline JSON (zod-validated, same repair-retry
     pattern) — **never writes to DB** [spec §2].
4. Canvas: React Flow editor rendering the draft — nodes = steps (agent + prompt
   template), edges = order/`{{input}}` piping; manual node/edge editing;
   **Publish** → creates real pipeline (+ optional team_id) via existing API;
   publish requires zod-clean graph (single start, no cycles, all agents exist).
5. Nav/UI: team detail gains workspace layout; "Draft with Manager" entry point on
   Pipelines tab.

**Assumptions:** P6 shipped React Flow + JSON-draft plumbing (heavy reuse); pipelines
stay linear-with-piping in v1 canvas (branching pipelines are a later evolution).
**Risks:** canvas scope explosion (v1 = draft/edit/publish linear flows only);
Manager Agent hallucinating agents/steps (validation catches; unknown agent →
inline fix-up chip).
**Dependencies:** P3 (teams live), P6 (canvas tech + draft patterns).

**RESOLVED QUESTIONS (P10) — owner, 2026-07-03:**
- **P10-Q1 → SLIM read-only view** for ephemeral (task-spawned) teams (they're transient).
- **P10-Q2 → LINEAR PIPELINES ONLY in canvas v1.** GOAP goal-template authoring on the
  canvas deferred (→ TODOS). Team Manager drafts are review-then-Publish (never direct DB
  writes); publish gated on a valid graph (single start, no cycles, agents exist).

**Lock status: 🔒 LOCKED 2026-07-03** (heavy reuse of P6 React Flow + draft-JSON patterns;
`team_id` filters over global tasks/pipelines/cron — never forked state).

---

## Cross-cutting engineering rules (apply to every phase)

1. **Migrations:** hand-written SQL per Drizzle convention, numbered `0004+`, FK policy
   explicit per migration, `foreign_keys=ON` assumed, cascade behavior documented +
   tested (Pass-2 precedent).
2. **Tests:** every phase lands vitest coverage for new pure logic (resolvers, planners,
   parsers), API routes (happy + error paths), and every cascade/guard called out in
   its section. Target: more test surface than route code on engine phases.
   *(Design)* Every phase build-spec also ships a UI states registry
   (loading/empty/error/success/partial per surface — Teams Pass-2 precedent).
3. **Phase-6 foresight [C7 — RESOLVED at premise gate + D6-followup]:** the factory itself
   goes multi-tenant eventually (access-spec Phase 6 governs; APP.md's "stays single-user"
   line is superseded). **Every new table carries a nullable, indexed `user_id` column**
   from `0004` onward **as a forward-MARKER** (D6-followup): there is NO `users` table yet,
   no FK — `PHASE6-NOTES.md` records that the real tenancy migration adds the `users`
   table + FKs + backfills ALL tables (including existing agents/projects/runs/tasks) in
   one coherent pass when it's actually time. Plus the portability contract: text ids +
   ISO timestamps, all data access through Drizzle, no raw SQLite pragmas in feature code,
   JSON columns as text (PG-compatible).
4. **Windows-first:** no stdio MCP for headless agents [C5]; paths via `node:path`;
   no `~` expansion assumptions (Pass-1 lesson).
5. **Cost visibility:** every new background LLM consumer (signals, dream cycle,
   briefings, Specter) is: off-or-capped by default until its gate says otherwise,
   attributed in runs (`trigger` values), and visible on the Dashboard cost view.
6. **Security defaults:** no `bypassPermissions` from any AI-authored config (clamp
   pattern everywhere a model emits agent/tool config: Creator, Specter, Manager
   drafts, GOAP planner agentHints).
7. **DB snapshot before migrations** *(CEO)*: core runs the existing offline snapshot
   script before applying any new migration chain — SQLite migrations are effectively
   one-way.
8. **Migration numbers reflow** if the owner reorders phases at the gates (`0004..0011`
   assume the §4 order).
9. **LLM-consumer tests** *(CEO)*: phases with model-in-the-loop logic (P5 signals,
   P6 planner, P9 specter) ship golden-transcript fixture tests (recorded turns →
   parser/clamp/solver assertions), not just unit tests.
10. **Ecosystem-substitution check** *(CEO F4)*: every phase gate answers "what happens
    to this phase if the CLI harness ships it natively in 3 months?" before lock.
    P8 especially: if kept, build on the vendor SDK loop (Claude Agent SDK /
    `@google/genai`), never a hand-rolled dispatch loop.
11. **Buy/reuse/skip** *(CEO F7)*: every phase gate includes a 3-line
    buy-vs-reuse-vs-skip analysis (including "do nothing" priced) before lock.
12. **Token budgets + evals** *(CEO F8)*: every background LLM consumer gets a monthly
    token budget with auto-off; P5 features land with a fixed 5-10 probe eval
    (memory-retrieval + task-completion) run before/after to prove they help.
13. **Untrusted-content boundary** *(CEO F10, promoted from P9)*: any agent consuming
    content the owner didn't author (cloned repos, fetched pages) runs read-only +
    sandbox-scoped memory from P1 onward — not deferred until P9.
14. **UI states registry per surface** *(Design, dual-voice)*: every new surface ships
    loading/empty/error/degraded specs at its phase gate; empty states say why + the
    action that fills them; **success-empty** (attention queue, contradictions) gets
    affirmative "all clear" treatment; metrics/charts hidden below N=10 data points;
    every background-LLM artifact (briefing, digest, signals) has an explicit
    **no-output contract** — silence over filler. System artifacts render as a distinct
    digest-card class with a Messages filter (never mixed undistinguished into real
    agent→user mail); Dashboard digest strip links to them; project detail shows
    latest-only.
15. **One canvas, one status vocabulary** *(Design, dual-voice — resolves P6-Q2)*:
    React Flow is the ONLY canvas. One `@sparstrow/ui` node family — `StatusNode`
    (P6: status ring + label + agent chip + drill-in) and `EditableStepNode` (P10:
    same shell + form affordances) — one edge style, one canvas chrome. The P3
    delegation tree is an indented list, not a canvas. Semantic status tokens locked
    at P1: attention/blocked=amber, approval=violet, failed=red, done=emerald,
    skipped/archived=gray, running=animated accent, pending=muted — every later state
    maps onto this table; no new hues without amending it.
16. **One launcher** *(Design, dual-voice)*: a single shared launcher component
    (canonical instance = P4 project-workspace main stage; Tasks page header mounts the
    same) with an explicit Task / Goal / Pipeline mode switch — default Goal for
    GOAP-enabled projects, else Task. P6 extends it; P10's "Draft with Manager" stays
    team-scoped and creates *definitions*, not work.
17. **Per-run gateway secret** *(Eng EH9)*: the agent gateway (`/mcp`, `/agent/*`)
    today authenticates on a discoverable `run_<id>` not bound to the caller — any
    Bash-capable agent that learns a sibling run id can impersonate it. Every run is
    bound to an unguessable per-run secret delivered to that spawn only, validated by the
    gateway, invalidated on completion. Until built, `createdByAgentId` / delegation
    provenance is treated as **forgeable — never a security decision** (affects P3
    cross-team gating and the circuit breaker).
18. **Background work off the main thread** *(Eng EM7)*: dream cycle, signal extraction,
    and auto-index run in a worker thread (own DB connection — then WAL + `busy_timeout`
    genuinely matter) or in yielded micro-batches with a per-batch row cap. Synchronous
    per-stdout-line `recordEvent` + a synchronous O(n²) nightly dedup would otherwise
    starve run-event ingestion, WS, and Fastify. The real chaos test is **event-loop
    latency under load**, not `SQLITE_BUSY` (one shared connection serializes in-process).
19. **WAL-safe pre-migration snapshot** *(Eng EM7, tightens rule 7)*: the snapshot before
    a migration chain uses the SQLite online-backup API (as `backup-db.mjs` does) or
    copies `.db` + `-wal` + `-shm` together — a bare `copyFileSync` of `.db` misses
    committed transactions still in the WAL, i.e. is stale exactly in the crash-recovery
    case the rule exists for.
20. **One capability registry, two tool surfaces** *(DX-C3/DX6 + owner §0.1)*: a single
    registry is the source of every agent-facing capability and emits (a) MCP tool
    registrations for the **Claude Code CLI** (existing HTTP MCP server) and (b) **native
    tool schemas** for the **direct-API tool-loop** (Gemini/Anthropic/OpenAI/Ollama
    function calling), plus the preamble tool docs + the SKILL.md tool section. The legacy
    `sparstrow` fenced text-directive grammar is **removed** (its consumer, the Gemini
    CLI, is retired). A tool present in the registry but missing from either surface is a
    **build error** — the two runtimes cannot drift. This is the owner's "unified
    tool-calling interface / MCP bridge."
21. **Agent-facing errors are structured for recovery** *(DX-H1)*: every agent-facing
    rejection returns `{outcome, message, whatToDoNext}` — and "correct, now stop"
    outcomes (`pending_approval`, `waiting_children`) are **NOT** `isError:true` (else a
    fresh agent retries or hallucinates a workaround). P2 denials carry provenance
    ("denied by Task-level policy — do not retry"); degraded graph tools stay registered
    and return "unavailable, proceed without graph" rather than vanishing.
22. **Preamble reflects the RESOLVED toolset** *(DX-M2)*: the "you can use" section is
    generated from the run's effective toolset (P2 resolver output), never static text —
    so what the agent is told always matches what it has. Internal transition statuses
    (`blocked_answered`, `waiting_children`) never appear in agent-read text *(DX-M4)*;
    the agent-facing `task_update` enum stays the human-meaningful subset.
23. **Factory-health self-check page** *(E5 — gate APPROVED to BUILD; fold into P7's
    Settings area, extend per phase)*: one Settings surface answering "is my factory
    armed?" — graph engine present, embedder loaded, PAT valid, provider keys/CLIs reachable
    (Claude CLI, Anthropic/Gemini API keys, Ollama up), each green/degraded with why. It
    is the operator-side mirror of the agent's resolved-toolset preamble (rule 22); every
    degrade-by-design dependency registers a health check here.

## NOT in scope (this whole plan)

- Phase 6 cloud/multi-tenant (Vercel/Supabase/Auth/RLS) — foresight rules only [C7].
- Electron packaging work (wrapper exists as future shell; unaffected by phases).
- Visual redesigns of the 11 board pages (classic factory loop, separate track) [C8].
- Cross-provider tool-name normalization (P2 assumption).
- Orchestrator-mediated no-network push (execution §3 phase 2) — shaped-for, not built.
- OpenAI adapter (P8 explicitly excludes until needed).

## What already exists — leverage map

See §1 table. Headline: the delegation primitive (task_create+assignToAgent), wake
foundation (sessionId resume), scope grammar, hybrid search, event bus, and React
Flow-ready live WS updates all exist — the ten phases are extensions, not foundations.

---
<!-- AUTONOMOUS DECISION LOG -->
# /autoplan Review (2026-07-02, master engineering plan)

Codex unavailable (`[codex-unavailable: binary not found]`) — dual voices = **Claude
subagents only** (`[subagent-only]`), one independent reviewer per phase, no shared
context. Restore point:
`~/.gstack/projects/sparstrow-sparstrowGen/claude-dreamy-engelbart-874599-autoplan-restore-20260702-204613.md`.

## Phase 1 — CEO review (mode: SELECTIVE EXPANSION)

### 0A Premise challenge — premises named for the gate
The plan rests on six premises. None are auto-accepted; all go to the owner at the
premise gate (autoplan rule: premises are never auto-decided):

- **PR-1 "Build the factory, not the products."** Weeks of engine work (GOAP, memory
  graph, swarms) are justified because the factory then multiplies output on VitalHIS/
  ERPs/client variants. Assumed, never argued. The do-nothing alternative — keep using
  Claude Code + the existing v0 factory directly on products — is the honest baseline.
- **PR-2 "Delta on the existing app, not greenfield."** The handoff's literal wording
  says build APIs/schemas/frontend; the app exists. The plan assumes delta. [C1]
- **PR-3 "Swarm > single agent."** Manager decomposition + specialized sub-agents beats
  one strong agent with good context. True for parallelizable work; unproven for the
  typical single-feature task where one CLI agent with memory does fine. The plan keeps
  single-agent runs as the floor — swarms are opt-in per goal.
- **PR-4 "GOAP/A* is the right planning formalism."** Preconditions/effects + A* gives
  explainable, replannable plans (and the node-graph visual). Alternative: LLM-generated
  task DAG without formal state (simpler, less rigorous replanning). Plan bets on GOAP
  per the handoff; the LLM still authors the domain, so GOAP's rigor is bounded by the
  LLM's domain quality.
- **PR-5 "Knowledge-graph memory beats hybrid search at this scale."** Graphify+gbrain
  methods add real complexity (Python dep, nightly LLM spend). At a solo founder's note
  volume, today's vector+FTS may already be 80% of the value. Plan mitigates by making
  every P5 feature degrade gracefully and cost-capped — but the premise stays.
- **PR-6 "Fable as sole implementer, all-phases-locked-then-build."** Owner-chosen (D4).
  Risk: phases locked months before their build embed stale assumptions; mitigation:
  each phase re-validates its locked section against `main` at build start and
  re-escalates if drift is found (added to §0 process contract by this review).
- **PR-7 "The factory's terminal state" (CEO F9.5 — the owner's own documents
  disagree).** APP.md: "It stays a single-user local tool; the cloud/multi-tenant story
  belongs to the products it builds." access/architecture.md Phase 6: the factory itself
  goes Vercel/Supabase multi-tenant for sales teams. This decides whether C7 foresight
  (user_id columns) matters at all. Named decision at the premise gate.

### 0B Existing code leverage
Verified in §1 and the per-phase "Exists" blocks — every sub-problem is mapped to
existing code, and the headline finding stands: the delegation primitive
(`task_create(assignToAgent)`), resume (`sessionId`), scope grammar, hybrid search,
event bus, and WS live-updates already exist. Nothing in the plan rebuilds an existing
subsystem; every phase extends. No parallel-flow duplication found.

### 0C Dream state
```
CURRENT STATE                    THIS PLAN                       12-MONTH IDEAL
CRUD harness: you hand-feed  →   Self-organizing factory:    →   You describe outcomes;
tasks to single agents,          goals decompose, swarms         the factory plans, builds,
watch runs, carry all            execute in bounded teams,       QAs, PRs product features
context in your head             memory compounds, blockers      across client variants;
                                 queue for your morning          you review PRs + answer
                                 review                          the attention queue
```
Delta: the plan moves decisively toward the ideal. Gap left open (correctly): product
deploy/QA automation beyond PR creation stays manual — that is the products' own CI
story, not the factory's.

### 0C-bis Implementation alternatives
```
APPROACH A: Dependency-ordered delta (THE PLAN)
  Summary: 10 phases extending the live monorepo, foundation-first.
  Effort: L-XL total | Risk: Med
  Pros: compounding value each phase; nothing thrown away; each phase shippable
  Cons: long program; later phases re-validate against drifted main
  Reuses: everything (§1 table)
APPROACH B: Greenfield rebuild (handoff literal)
  Summary: new Fastify/Drizzle/Vite app implementing all six specs from scratch.
  Effort: XL++ | Risk: High
  Pros: no legacy constraints; single coherent design pass
  Cons: discards a working, tested, shipped app; months before parity; violates DRY
APPROACH C: Minimal wedge (P1+P3 only, then reassess)
  Summary: build escalation + delegation only; defer everything else.
  Effort: M | Risk: Low
  Pros: fastest value; smallest bet
  Cons: contradicts owner's chosen all-phases-planned workflow (D4); leaves the
        five specs unplanned, which is the very thing the handoff asks for
Completeness: A=9/10 · B=3/10 (outcome per effort) · C=4/10
RECOMMENDATION → A (P1 completeness + P2 boil-lakes + P4 DRY). Not close — mechanical.
```

### 0D SELECTIVE EXPANSION analysis
*Complexity check:* the plan far exceeds 8 files — by design; it is a program of 10
phases, each individually sized S-L. The per-phase complexity discipline (schema →
resolver/service → API → UI, tests per section) is the mitigation. *Minimum set:* C
above; rejected at 0C-bis. *Expansion scan* (cherry-picks, autoplan rules applied):

| # | Expansion | Blast radius | Size | Decision |
|---|---|---|---|---|
| E1 | Run-detail shows **injected memory provenance** (which notes/directives entered this run) — turns memory debugging from archaeology into a glance | P5 touches injector; run detail exists | S | **AUTO-APPROVED** → folded into P5 (task added) |
| E2 | **Node-graph run controls** — pause goal, cancel node, retry node from the graph | P6 builds the graph + cancel exists in RunManager | S | **AUTO-APPROVED** → folded into P6 |
| E3 | **Wake/attention metrics on Dashboard** (blocked count trend, median time-to-answer, wake-loop guard trips) | P1 builds the queue; dashboard exists | S | **AUTO-APPROVED** → folded into P1 |
| E4 | Global **activity feed** page (every bus event, filterable) | outside any phase's files | M | **DEFERRED → TODOS.md** (P3 pragmatic: Runs page + attention queue cover the need) |
| E5 | **Factory health self-check** page (graphify present, embedder loaded, PAT valid, provider CLIs on PATH) | Settings page exists; checks span P5/P7/P8 | M | **TASTE — surfaced at final gate** (genuinely useful for a local app that degrades by design; but it's a new surface no spec asked for) |

### 0E Temporal interrogation (per-phase gates carry these; program-level)
- HOUR 1: which phase's migration runs first — chain `0004..0011` is fixed by phase
  order; if the owner reorders phases at the gates, migration numbers reflow (plan
  notes this in cross-cutting rules — added).
- HOUR 2-3: wake semantics (P1-Q1) and hierarchy order (P2-Q1) block core logic —
  that is why they gate before build, not during.
- HOUR 4-5: GOAP world-state grammar and the Planner JSON contract will surprise —
  P6 requires the domain zod schema written and reviewed as its FIRST task (added).
- HOUR 6+: implementers will wish every background LLM consumer had a kill switch —
  cross-cutting rule 5 already mandates caps + toggles.

### 0F Mode confirmation
SELECTIVE EXPANSION (prescribed by /autoplan) — held throughout; approach A confirmed.

### Sections 1–11 (examined at master-plan altitude; per-phase depth recurs at each phase gate)

**S1 Architecture.** Dependency graph in §4 (produced). Coupling verified sound: new
subsystems (goap/, git-ops, graph tools) attach to the bus/run-manager seams that already
exist; no cycles (P10→P6→P3→P1). Scaling: SQLite WAL + single-process Fastify holds for
single-user; first thing to break under 10x agent fan-out is the global concurrency cap
queue — by design (bounded). SPOF: the core process itself (acceptable, local app; orphan
sweep already recovers). **Finding S1-a (auto-added, P1):** P3 must require child-task
tool policy ⊆ parent's effective policy (no privilege escalation via delegation) — added
to P3 item 2. **Finding S1-b (auto-added, P5):** P6 Planner must consume P2's resolver
when suggesting agentHints so plans never assign work an agent can't execute.
**S2 Error & rescue.** Master registry below; per-phase registries land in each phase's
build spec (pattern already proven in Pass 1/2 appendices).
**S3 Security.** Threats named: delegation priv-esc (S1-a, mitigated), free-text→config
clamps (cross-cutting rule 6 — extended to GOAP agentHints + Manager drafts by this
review), extractor prompt-injection while reading hostile repos (P9 read-only sandbox
boundary + test), PAT blast radius (P7-Q1 gate; fine-grained, repo-scoped documented),
secret leak into agent env (P7 whitelist + leak test), sandbox memory bleed (P4 scope
filter + test). Cross-team approval gate is itself a security control — approve-by-
default would gut it; default stays human-gated.
**S4 Data flow & interaction edges.** The four shadow paths for the two highest-risk new
flows (P1 answer→wake, P3 fan-out→wake) are specified in-phase (wake-count guard,
debounced watcher, idempotent wake). **Finding S4-a (auto-added, P1):** answer submitted
while the task's prior run is still `running` must be rejected 409 ("run in flight") —
added to P1 item 3.
**S5 Code quality.** Plan mandates shared pure functions for every cross-surface rule
(resolver, renderSkillMd precedent) — consistent with existing patterns; no DRY
violations introduced; naming follows existing conventions (snake_case DB, camelCase TS).
**S6 Tests.** Cross-cutting rule 2 requires per-phase test surface; master test plan
artifact is produced in the Eng phase (autoplan Phase 3). LLM-touching phases (P5
signals, P6 planner, P9 specter) get golden-transcript fixture tests — added to
cross-cutting rule 2.
**S7 Performance.** Named hot spots: dream-cycle O(n²) similarity (mitigate: embedding
prefilter + sampled pairs — in P5). ~~node-graph WS event volume (existing bus throttles
UI at run granularity)~~ **CORRECTED by Eng EM1: no WS/bus throttle exists** — `events/bus.ts`
is a bare EventEmitter, `ws/handler.ts` re-stringifies every event per client with no
backpressure. Rule for P1/P3: per-client WS topic filtering (UI subscribes to what it
renders), stringify-once fan-out, `bufferedAmount` drop/coalesce guard, coalesced
task/node-level events for the P6 graph. Memory injection token budget with directives
(directives prepend inside the existing budget, trimming notes first — clarified in
P4 item 5).
**S8 Observability.** Every background consumer attributed via `trigger` (exists) +
Dashboard cost view (P1/E3) + wake-guard metrics (E3). Run-detail memory provenance (E1)
closes the "why did the agent think that" debugging hole.
**S9 Deployment.** Local app: each phase = one PR train; migrations irreversible-by-
default in SQLite → **auto-added cross-cutting rule 7: core takes an automatic DB
snapshot (existing backup script) before applying any new migration chain.**
**S10 Trajectory.** Reversibility: P1/P2/P4 additive (5/5); P3 instances + P6 goap
tables are one-way-ish data models (2/5) — precisely why they gate on owner questions
(P3-Q1, P6-Q1). Path dependency on CLI providers acknowledged; P8 is the hedge and is
itself scope-gated. 1-year read: §0 process contract + per-phase locks make the plan
self-documenting.
**S11 Design/UX (light — Phase 2 does the deep pass).** Information architecture of
the new surfaces maps onto existing pages (no new nav sprawl except quarantine under
Agents); the attention queue is the founder's #1 daily surface and correctly lives on
Dashboard.

### Master Error & Rescue Registry (program level)
| Codepath | Failure | Rescue | Owner sees |
|---|---|---|---|
| P1 answer→wake | session expired | fresh run + injected context | badge clears; run history shows "resumed (fresh)" |
| P1 answer→wake | run in flight | 409, answer queued not applied | "run still active — answer saved" |
| P3 fan-out | child spawn fails (agent disabled) | task `failed`, lead woken with failure summary | delegation tree shows red node |
| P3 cross-team | owner denies | lead woken with denial context | tree shows denied node |
| P5 graph engine (codebase-memory-mcp) | binary missing / index fails / crash-loop | feature-degrade, breaker latch, health-check surfaces | Settings engine row + panel badge; agents get DX3 fallback text (spawn-pinned surface — tools never vanish mid-run) |
| P5 dream cycle | LLM budget hit mid-cycle | stop, resume next night from checkpoint | digest notes partial completion |
| P6 planner | unsolvable domain | bounce to Planner with diagnostic, ≤N retries | goal `blocked` with diagnostic |
| P6 executor | node fails, replan cap hit | goal `blocked` (P1 queue) | attention queue entry with plan history |
| P7 git-ops | push rejected / PAT invalid | task `blocked`, never retried silently | attention queue + Settings PAT warning |
| P9 extractor | hostile repo content | read-only + sandbox scopes hold; Specter flags | quarantine card marked BLOCKED |
| any bg LLM consumer | cost cap hit | halt consumer, log, surface | Dashboard cost view + inbox digest |

### Failure Modes Registry (critical gaps → carried into phase gates)
| ⚠ | Mode | Disposition |
|---|---|---|
| ⚠ | Wake ping-pong (blocked↔todo loop) | wake-count guard + metric (P1, E3) |
| ⚠ | Delegation priv-esc via child tool policy | S1-a constraint + test (P3) |
| ⚠ | LLM-authored GOAP domain nonsense | zod + solver diagnostics + bounce loop + replan cap (P6) |
| ⚠ | Dream cycle corrupts memory | soft-archive only, citations, daily digest, per-project isolation (P5) |
| ⚠ | Sandbox memory bleed to global | write-scope filter + boundary test (P4) |
| ⚠ | Secret leak into agent env | whitelist + leak test (P7) |
| | Stale locked phase vs drifted main | re-validate at build start (PR-6 mitigation, §0) |

### Dream state delta
This plan leaves the factory at ~80% of the 12-month ideal: goals→swarms→PRs with
compounding memory. Remaining 20%: product-side deploy/QA automation, scheduled
autonomous building (FACTORY-LOOP "later" mode), Electron packaging, and the cloud
story (Phase 6) — all consciously out of scope.

### CEO Completion Summary
Premises: 6 named → **gate**. Alternatives: 3 → A (mechanical). Cherry-picks: 3
auto-approved fold-ins (E1-E3), 1 deferred (E4), 1 taste (E5 → final gate). Section
findings: 4 auto-added constraints (S1-a, S1-b, S4-a, rule 7), 0 unresolved. Registries:
produced above. NOT-in-scope + leverage map: §"NOT in scope", §"What already exists".

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Mode = SELECTIVE EXPANSION | Mechanical | — | Prescribed by /autoplan | other modes |
| 2 | CEO | Approach A (delta, dependency-ordered) | Mechanical | P1/P2/P4 | Only approach that keeps the working app and plans all specs | B greenfield, C wedge |
| 3 | CEO | E1 memory provenance in run detail → P5 | Auto | P2/P3 | In blast radius, S, closes memory debugging hole | skip |
| 4 | CEO | E2 node-graph run controls → P6 | Auto | P2 | Graph exists in-phase; cancel API exists | skip |
| 5 | CEO | E3 wake/attention metrics → P1 | Auto | P1/P2 | Queue + dashboard in blast radius | skip |
| 6 | CEO | E4 activity feed → TODOS.md | Auto | P3 | Outside blast radius; Runs page covers | in-scope |
| 7 | CEO | E5 health self-check page | **Taste → final gate** | — | Useful for degrade-by-design app vs unasked-for surface | — |
| 8 | CEO | S1-a child tool policy ⊆ parent effective | Auto | P1 | Delegation must not escalate privileges | unconstrained |
| 9 | CEO | S1-b Planner consumes P2 resolver for agentHints | Auto | P5 | Plans must not assign unexecutable work | ignore |
| 10 | CEO | S4-a answer-while-running → 409 | Auto | P1 | Prevents double-wake race | last-write-wins |
| 11 | CEO | Rule 7: DB snapshot before migration chains | Auto | P1 | SQLite migrations effectively one-way; backup script exists | none |
| 12 | CEO | PR-6 mitigation: re-validate locked phase at build start | Auto | P1 | All-locked-then-build embeds staleness risk | build blind |
| 13 | CEO-sub | P1 wake: fresh-run = designed primary (gemini sessionId=null verified) | Auto | P1/P5 | Plan assumption falsified by code | resume-primary |
| 14 | CEO-sub | P3-Q1 rec flipped to copy-on-first-instantiate | Auto | P1 | Clean-room silently regresses agent knowledge | clean-room rec |
| 15 | CEO-sub | P6-Q0 added: GOAP vs LLM-DAG head-to-head required at gate | Auto | P5/P3 | A* value unproven once LLM authors domain | build GOAP unexamined |
| 16 | CEO-sub | Rules 10-13 added (ecosystem check, buy/reuse/skip, budgets+evals, untrusted-content boundary) | Auto | P1 | Systematic gaps across phases | ad-hoc |
| 17 | CEO-sub | P5-Q5 gbrain buy-vs-build + P5/P3 split options added | Auto | P4 | Reuse dismissed by assertion; sizing under-split | silent reimplement |
| 18 | CEO-sub | P2-Q0 lite-vs-full added | Auto | P3/P5 | Resolver+matrix may be over-built for one user | unexamined full build |
| 19 | CEO-sub | F1 Client-Delivery-Kit reframing + F2 rolling locks | **USER CHALLENGE → gate** | — | Single-voice critical: challenges owner's D4 workflow | — |
| 20 | CEO-sub | PR-7 factory terminal state contradiction | **PREMISE → gate** | — | Owner's own docs disagree | — |

## CEO dual voices — consensus table `[subagent-only]`
| Dimension | Claude subagent | Codex | Consensus |
|---|---|---|---|
| 1. Premises valid? | Contested: PR-1 value anchor never argued; PR-7 docs contradict | N/A | → premise gate |
| 2. Right problem to solve? | DISPUTED — revenue-pull vs factory-push (F1, critical) | N/A | → gate (flagged; single critical voice) |
| 3. Scope calibration correct? | NO — P2 over-built, P9 premature, P3/P5 under-split (F6/F10/F11) | N/A | → P2-Q0, P9 defer question, split options added |
| 4. Alternatives sufficiently explored? | Partial — gbrain/canvas/do-nothing gaps (F7) | N/A | rule 11 added; P5-Q5 |
| 5. Ecosystem/competitive risk covered? | Concentrated in P5/P6/P8, unpriced (F4) | N/A | rule 10 added |
| 6. 6-month trajectory sound? | RISK — waterfall staleness (F2, critical), regret inventory (F9) | N/A | → gate (rolling-locks challenge) |

**Phase 1 complete.** Codex: unavailable. Claude subagent: 11 findings (2 critical,
4 high, 5 medium) — 8 auto-folded, 2 to premise gate, 1 (E5 + P9-defer) to final gate.
Consensus: 0/6 CONFIRMED (single-voice), 6 dimensions carry actions.

### PREMISE GATE — RESOLVED by owner, 2026-07-02
| # | Decision | Outcome |
|---|---|---|
| D5 | F1/F2 user challenge (kit-first / rolling locks) | **REJECTED — owner keeps D4: all 10 phases locked, then build.** Original direction stands; PR-6 build-start re-validation is the staleness hedge. P6/P8/P9/P10 questions WILL be answered at the final gate. |
| D6 | PR-7 factory terminal state | **Multi-tenant eventually** — access-spec Phase 6 governs; C7 resolved: nullable indexed `user_id` on every new table + portability contract (cross-cutting rule 3 updated). APP.md line to be amended. |
| D7 | Value-anchor rule | **NOT adopted** — the factory is the deliverable of this program by owner's explicit choice. F1 regret risk accepted, eyes open. |
| D8 | PR-2/PR-3/PR-4/PR-5/C8 | **All accepted** with their folded mitigations (P6-Q0 head-to-head, rules 10-13, caps+evals). |

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 21 | GATE | D4 all-locked-then-build reaffirmed | Owner | — | Owner rejects single-voice F1/F2 challenge | rolling locks, kit-first |
| 22 | GATE | user_id columns on all new tables | Owner | — | Factory multi-tenant eventually (PR-7) | portability-only, local-forever |
| 23 | GATE | No value-anchor rule | Owner | — | Factory is the program's deliverable | adopt |
| 24 | GATE | 5 premises accepted w/ mitigations | Owner | — | Guardrails already folded | adjust |

## Phase 2 — Design review (main voice; 7 passes)

Ground truth verified: `packages/ui/src/styles/globals.css` carries the standard
shadcn token set; **no semantic status palette exists** (`--accent-{sky,emerald,...}`
from the old design export was never added); **no DESIGN.md exists** (visual-redesign
track's problem, noted, out of scope here).

**Pass 1 — Information architecture (6/10 → fixes below).** The founder's morning loop
defines the app. The plan lists Dashboard surfaces but never orders them.
*(D-1 auto)* Dashboard hierarchy locked: ① Human Attention Required (blocked +
pending_approval, answer inline) ② Running now (active runs/goals) ③ Overnight digest
(briefings, dream-cycle summary, finished goals) ④ Cost view. Goal detail: status line +
current blockers first, graph second.
**Pass 2 — Interaction states (4/10 in draft → registries mandated).** Unspecified
day-1-embarrassing states fixed: *(D-2 auto)* empty attention queue is a designed
"all clear ✅" state (the goal state, celebrated, not a gray void). *(D-4 auto)* a goal
whose Planner is still running shows a streaming plan skeleton ("planning… 4 actions so
far"), never an empty canvas. *(D-3 auto)* morning briefing uses a fixed template
(Shipped / Blocked / Costs / Next) and **skips sending when empty** — no inbox spam.
Fresh-project workspace, zero-hit synthesis (gap-analysis-only answer), empty quarantine
all get explicit empty states. Every phase build-spec must ship a states registry
(loading/empty/error/success/partial) per the Pass-2 Teams precedent — added to
cross-cutting rule 2.
**Pass 3 — Journey & emotional arc (7/10).** Morning: Dashboard → answer → review →
launch. The arc breaks if answering requires page-hopping for context. *(D-7 auto)*
Attention-card anatomy specified: question text, task title+link, agent chip, age,
context accordion (last run summary + relevant plan node), inline composer
(Enter submits), Approve/Deny pair for approvals with the tool-policy diff visible.
Decision-complete without leaving the card.
**Pass 4 — AI-slop risk (3 surfaces flagged).** "Permission audit matrix",
"dashboard section", "briefing artifact" are generic-pattern handwaves. *(D-6 auto)*
P2 matrix concretized: one row per tool; chip chain `Global → Agent → Project → Task`;
final-state column; overridden grants struck through; provenance on hover. D-1/D-3/D-7
fix the other two.
**Pass 5 — Design-system alignment.** *(D-5 auto)* Add semantic **status tokens** once
(P1): `--status-running/-done/-failed/-blocked/-pending` (+foregrounds), consumed by
badges, kanban chips, node graph, canvas — one source for "what color is blocked".
All overlays/dialogs reuse the existing primitives (Pass-1 focus-trap lesson carried).
**Pass 6 — Responsive & a11y.** Desktop-first local app (accepted). *(D-8 auto)*
Every graph surface (P3 tree, P6 graph, P10 canvas) has full list-view parity as the
keyboard/screen-reader path — graphs are progressive enhancement, never the only way.
Composer and queue fully keyboard-driven.
**Pass 7 — Unresolved design decisions.** ① Three graph/tree visualizations across
P3/P6/P10 — one visual language or three bespoke builds? (→ D-9, see consensus).
② Node information density (label+agent+status+cost per node vs minimal) — deferred to
P6 gate with mockup. ③ DESIGN.md absence — recommend /design-consultation before the
visual-redesign track, out of this plan's scope.

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 25 | Design | D-1 dashboard hierarchy order locked | Auto | P5 | Morning loop defines the app; order was unspecified | unordered sections |
| 26 | Design | D-2 empty queue = designed all-clear | Auto | P1 | The goal state deserves design | gray empty |
| 27 | Design | D-3 briefing fixed template + skip-if-empty | Auto | P1/P5 | Prevents inbox spam + slop reports | freeform daily |
| 28 | Design | D-4 planner-running = streaming skeleton | Auto | P1 | Empty canvas while planning is broken-feeling | spinner only |
| 29 | Design | D-5 semantic status tokens in P1 | Auto | P4 | One source of status color for 5+ surfaces | per-surface colors |
| 30 | Design | D-6 permission matrix concretized | Auto | P5 | Generic "matrix" = slop risk | handwave |
| 31 | Design | D-7 attention-card anatomy | Auto | P1/P5 | Answer without page-hop is the core UX | link-out card |
| 32 | Design | D-8 list-view parity for all graphs | Auto | P1 | A11y + keyboard path; graph = enhancement | graph-only |
| 33 | Design-sub | C1 typed attention rows + Dashboard aggregate PR queue | Auto | P1/P5 | Morning loop needs ONE home; review-leg was broken | per-phase sections |
| 34 | Design-sub | C2 answer-composer full spec (per-question fields, wake feedback, 409 pill) | Auto | P1 | Most-used control had a 4-word spec | bare textarea |
| 35 | Design-sub | C3 task detail Dialog→route/sheet; delegation = affordances + detail tree | Auto | P5 | Modal can't absorb 4 phases of content; kanban has no rows | rows-expand |
| 36 | Design-sub | H1 project-workspace concrete layout (header/main/sidebar order; briefing = feed item; variants in overflow) | Auto | P5 | "Cowork pattern" is a vibe, not a hierarchy | card pile |
| 37 | Design-sub | H2 rule 14 states registry + no-output contracts | Auto | P1 | Day-1-embarrassing states by construction | unspecified |
| 38 | Design-sub | H3+H4 rule 15 canvas family + status token table (resolves P6-Q2 = React Flow) | Auto (dual-voice agree) | P4/P5 | 3 graphs + 6 phases of status colors need one owner | 3 bespoke |
| 39 | Design-sub | H5 attention band, not a 7th kanban column | Auto | P5 | 7 columns break the 6-col grid; blocked ≠ workflow stage | new column |
| 40 | Design-sub | H6 permission UI = flat effective-tools list, home = Run detail | Auto | P3/P5 | Grid-matrix-in-modal is enterprise audit UI for one user | tools×levels grid |
| 41 | Design-sub | H7 rule 16 single launcher w/ mode switch | Auto | P4/P5 | 4 uncoordinated entry points | per-phase buttons |
| 42 | Design-sub | M1-M8 folded (provenance replaces raw; memory filter placement; badge on Dashboard; tabbed creation modal + bg clone; quarantine two-pane + ack; Manager chat drawer; version stepper + node density; digest-card class) | Auto | P1/P5 | Specific fixes, all structural | — |

## Design dual voices — litmus scorecard `[subagent-only]`
| Dimension | Main voice | Subagent | Consensus |
|---|---|---|---|
| 1. Information architecture | 6/10 — ordering unspecified | CRITICAL C1 — morning loop fragmented | CONFIRMED → typed queue + aggregate PR (fixed) |
| 2. Missing states | 4/10 — day-1 embarrassments | HIGH H2 — every new surface | CONFIRMED → rule 14 (fixed) |
| 3. User journey | 7/10 — answer-without-hop | C1/C2 — review leg broken, composer blind | CONFIRMED → composer spec + PR queue (fixed) |
| 4. Specificity / AI-slop | 3 surfaces flagged | Same 3 + M2/M5/M8 | CONFIRMED → all concretized (fixed) |
| 5. Design-system alignment | status tokens missing | H4 — vocabulary fragmenting | CONFIRMED → token table rule 15 (fixed) |
| 6. Responsive & a11y | list-view parity (D-8) | not contested | single-voice, adopted |
| 7. Unresolved decisions | graph language → taste? | H3 — decide NOW, React Flow family | AGREED → auto-decided (rule 15), no longer taste |

**Phase 2 complete.** Codex: unavailable. Main voice: 8 auto-decisions. Subagent:
3 critical + 7 high + 8 medium — all structural, all auto-folded (zero aesthetic-taste
leftovers; the one candidate taste decision, graph visual language, resolved by
dual-voice agreement). Consensus: 6/7 dimensions CONFIRMED-and-fixed, 1 single-voice.
Passing to Phase 3 (Eng).

## Phase 3 — Eng review (main voice)

**Step 0 scope challenge.** Every sub-problem mapped to existing code (§1, per-phase
"Exists" blocks — verified, not asserted). Complexity check: 10 phases is far past the
8-file smell by design; the mitigation is per-phase gating + the S-L sizing per phase,
with split options (P3a/b, P5a/b) recorded for the owner at the final gate. No phase
rebuilds an existing subsystem.

**System architecture (new components on existing seams):**
```
                    ┌─────────────────────────── UI (React/Vite) ───────────────────────────┐
                    │ Dashboard(typed queue·PR queue·digest·cost)  Tasks(/tasks/:id, band,  │
                    │ detail tree)  Projects(workspace)  Memory(types·synth)  Goals(React   │
                    │ Flow StatusNode)  Teams(workspace + EditableStepNode canvas)          │
                    └───────────────┬───────────────────────────────┬───────────────────────┘
                                    │ REST /api/v1 (bearer)         │ WS /ws (bearer)
┌───────────────────────────── core (Fastify :48750) ────────────────────────────────┐
│ api/routes: +tasks/answer +approve  +goals  +teams-filters  +providers/discover     │
│             +git  +quarantine                                                       │
│ taskboard ── spawn_subtask / task_block ──► orchestrator/run-manager ◄── scheduler  │
│     │        (team-boundary + subset-policy)        │        ▲         (cron: dream │
│ events/bus ◄─ run.completed / task.updated ─────────┘        │          brief)      │
│     ├─► completion-watcher (P3 wake, debounced)   providers: claude-code│gemini-cli │
│     ├─► signal-extractor (P5, capped)             [P8: +SDK adapters + tool-loop]   │
│     └─► ws handler (live UI)                                                        │
│ goap/ (P6): planner turn → zod domain → A*|DAG core → plan_nodes → materialize tasks│
│ git-ops (P7): guard-railed branch/commit/push/PR; PAT core-side only                │
│ memory/: scopes(+instances) injector(+manifest) search(+synthesize)                 │
│          graph-tools (codebase-memory-mcp children via core stdio-client, re-exported over HTTP MCP) [C5]        │
│ db: +blocked/pending_approval  +open_questions  +parent_task_id  +agent_instances   │
│     +project/task tool cols  +goals/plan_nodes/plan_edges  +is_ephemeral  +team_id  │
│     +memory type/links  +user_id (all new tables, D6)                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```
Coupling assessment: all new engine pieces attach at three existing seams (bus events,
run-manager spawn path, MCP tool registry) — no seam requires rewrite; P8 is the only
component adding a second execution path through run-manager (why it is scope-gated).

**Test diagram + plan.** Master test plan artifact written to
`~/.gstack/projects/sparstrow-sparstrowGen/claude-dreamy-engelbart-874599-test-plan-20260702.md`
— per-phase matrices, a 5-scenario cross-phase integration suite (wake E2E, permission
chain, sandbox wall, goal-to-PR, injection gauntlet), 2am-Friday chaos tests (kill core
mid-wake; SQLite BUSY under dream-cycle + 4 runs; 50-node replan while 3 nodes run),
and a flakiness watchlist (golden transcripts, fake timers, fixture repos — never live
models in CI).

**TODOS.md** created in-repo with all deferred items (E4 feed, no-network push, OpenAI
adapter, DESIGN.md consultation, tool-name normalization, APP.md amendment).

### Eng dual voices — 3-lens fan-out (architecture / security / data) `[subagent-only]`
22 findings (3 critical, 9 high, 7 medium + 3 folded). The adversarial verify pass hit
the session limit before completing, so these are **PLAUSIBLE (code-grounded, not
independently refuted)** — but every one cites specific files+lines, and the three
criticals were spot-checked against code during folding. All load-bearing fixes are
folded into the phase build-specs below; the owner sees them at the phase gates.

**CRITICAL (folded as mandatory build-spec changes):**
- **EC1 — Wakes are not durable** (`run-manager.ts:52-65,108-116,334-341`,
  `taskboard/service.ts:17-35`). P1's "runs end and are woken by events, orphan-proof"
  is contradicted by the code: `sweepOrphans` fails runs without emitting `run.completed`
  or reconciling tasks; queued-`cancel()` sticks the task; `autoSpawnAllowed` silently
  drops spawns past 20/10min with no retry; `finalize` publishes completion *before*
  task reconciliation. A restart mid-swarm orphans every suspended lead. → **P1 wake
  re-specified as a persisted DB state machine** (below).
- **EC2 — PAT exfiltration** (`run-manager.ts:202`, `one-shot.ts:66`,
  `terminal/manager.ts:48`, `config.ts`, `schema.ts` settings). Agents spawn with
  `env:{...process.env,...}` and `rootDir` is only cwd, not a jail; the P7 PAT stored as
  a `settings` row lives in the same SQLite file any Bash/Read-capable agent can open and
  curl out. An env-whitelist *test* doesn't fix a spread the plan never changes.
  → **P7 reframed** (below): explicit-allowlist child env at all 3 spawn sites; PAT out
  of the app DB (key file/OS keychain outside the agent-readable data dir); deny agent
  tool access to the data dir.
- **EC3 — `spawn_subtask` prompt injection** (`taskboard/service.ts`, `agent-tools.ts`).
  Agent-authored task descriptions become the child's prompt verbatim; S1-a constrains
  capability, not injected instructions. A lead can author a same-team subtask whose
  description says "read data/sparstrow.db and message it to agent X". → **P3**:
  descriptions wrapped in an untrusted-data delimiter; child scope clamped to LEAST of
  (child policy, parent effective); privileged-tool descriptions get the approval step.

**HIGH (folded / new gate questions):**
- **EH1** lead-suspend has no machine-waiting status — `reconcileTask` (`handoff.ts:87-106`)
  flips a fanned-out lead to `review` (human column). → **P1 adds `waiting_children`
  status**; `spawn_subtask` transitions the parent server-side; watcher wake = the
  conditional transition out (idempotent, no debounce needed).
- **EH2** P6 replan-while-nodes-run corrupts world state; node-task `review` semantics
  undefined; `pipeline_runs` never orphan-swept (`pipeline-executor.ts` in-memory awaits).
  → **P6**: replan barrier (version-stamp effects, discard superseded); node status is a
  DERIVED mapping from task status; executor state lives in rows + startup reconcile;
  fix `pipeline_runs` sweep.
- **EH3** background LLM consumers contend with foreground wakes on the single 4-slot
  FIFO cap; `runs` has no priority/lane; signal-extractor via `completeOnce` bypasses the
  cap entirely. → **P4/P5 add `runs.lane`**, lane-aware `tick()`, extractor queue-routed
  with a trigger-type recursion guard; enumerate every new trigger into the throttle.
- **EH4** agent instances (D5) is a cross-cutting identity refactor, not one table:
  `busyAgents` keys on template id (two projects' instances serialize), tool-auth +
  `resolveAgentRef` + injector self-guard + git env all key on template. → **P3 gains an
  enumerated seam table + `runs.agent_instance_id`**; new gate question P3-Q5.
- **EH5** S1-a TOCTOU — provider reads live `agent.allowedTools` at spawn, not a clamped
  snapshot; child queues behind the cap, rows mutate in the window. → **P2/P3**: persist
  the clamped effective toolset on the child run; provider resolves ONLY from the
  immutable per-run snapshot.
- **EH6** P5 signal notes are a stored/second-order injection channel — a run that reads
  hostile content produces a "pitfall" note later injected into other agents. → **P5**:
  signals from untrusted-content runs quarantined (agent/sandbox scope, non-injectable
  until approved); injected memory labeled untrusted data.
- **EH7** P4 sandbox isolation bypassed by `agent:self`+`global` write scopes; `agent:self`
  resolves to the template (cross-project) until P3 instances land. → **P4**: sandbox/
  untrusted runs clamp WRITE scopes to `project:<sandbox>` only; **order P3 instance
  resolution before/with P4 sandbox + P9 extractor** (cross-phase dependency added).
- **EH8** P9 extractor can't be both read-only and able to clone+graphify hostile repos.
  → **P9**: clone core-side (not an agent tool); extractor runs Read-only, no Bash, no
  network, cwd-jailed; graphify network-off + repo-config ignored; boundary test vs a
  hostile fixture.
- **EH9** agent gateway (`/mcp`,`/agent/*`) authenticates on a discoverable run-id not
  bound to the caller — any Bash agent that learns a sibling run id can impersonate it;
  P3 keys delegation trust on this forgeable provenance. → **new cross-cutting security
  rule + P1-adjacent task**: per-run secret (not the run id), delivered to that spawn
  only, invalidated on completion; until then, treat `createdByAgentId` as non-security.
- **EH10 (data)** `user_id`-on-new-tables-only creates a half-tenant schema — no `users`
  table, no FK target, existing core tables (agents/projects/runs/tasks) have none, no
  backfill. → **new gate question D6-followup** (below): the D6 "add user_id" decision
  needs a coherent shape or it is cargo-cult tenancy.

**MEDIUM (registered; fold at phase gates):** EM1 the WS/bus throttle appendix-S7 claimed
does not exist (`events/bus.ts` bare EventEmitter, `ws/handler.ts` no backpressure) —
**S7 corrected**, per-client WS topic filtering added to P1/P3. EM2 five phases edit
RunManager's create/tick/start/finalize with no scheduled seam refactor — add one early
task extending `RunCreate` with `resumeSessionId`+`lane`+`effectiveTools` and extracting
the spawn→stream→finalize core. EM3 cross-team approval card must show the verbatim
agent-authored description (the injection carrier), not just title+tool-diff. EM4 P6
`plan_nodes.status` duplicates task status (no mapping for `review`/`pending_approval`);
`plan_edges` is derived under GOAP but authoritative under the DAG alternative — defer
0009 DDL behind P6-Q0. EM5 `tasks.open_questions` JSON defeats the attention-queue/E3
queries and invites lost-update races → **first-class `task_questions` table** (folded
into P1). EM6 cross-phase suite must live in-repo + gate-enforced (not the external
file), plus a migration-chain upgrade test and the gemini-can't-`task_block` gap
(gemini has no MCP + `sessionId:null`; the `sparstrow` fenced directive grammar has no
block/questions directive). EM7 SQLite BUSY chaos test targets the wrong failure (one
shared connection serializes) — real risk is **event-loop starvation** from synchronous
`recordEvent` per stdout line + synchronous dream-cycle; background memory work must run
in a worker thread or yielded micro-batches; and rule-7's pre-migration snapshot is
WAL-unsafe (`copyFileSync` of `.db` only misses `-wal`).

## Decision Audit Trail (Eng)
| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|----------------|-----------|-----------|
| 43 | Eng | EC1 wake = persisted DB state machine (not bus subs) | Auto | P1/P5 | Central P1 claim falsified by sweepOrphans/cancel/finalize | 
| 44 | Eng | EC2 P7 reframed: allowlist child env + PAT out of app DB + data-dir tool deny | Auto | P1 | Resident-agent-reads-DB is the real threat, not disk theft |
| 45 | Eng | EC3 spawn_subtask description = untrusted-data delimiter + least-scope clamp | Auto | P1 | Task descriptions become child prompts verbatim |
| 46 | Eng | EH1 `waiting_children` status + server-side transition | Auto | P5 | reconcileTask competes for the lead task |
| 47 | Eng | EH2 P6 replan barrier + derived node status + row-recoverable executor | Auto | P1/P5 | pipeline-executor anti-pattern at 10x |
| 48 | Eng | EH3 `runs.lane` + lane-aware tick + queue-routed extractor | Auto | P1 | Background work starves the founder's #1 loop |
| 49 | Eng | EH4 P3 instance seam table + `runs.agent_instance_id` (→ P3-Q5) | Auto→gate | P5 | Identity is load-bearing across the codebase |
| 50 | Eng | EH5 per-run clamped toolset snapshot; provider reads snapshot only | Auto | P1 | S1-a TOCTOU makes subset unenforceable as written |
| 51 | Eng | EH6 quarantine signals from untrusted-content runs | Auto | P1 | Stored second-order injection channel |
| 52 | Eng | EH7 sandbox WRITE-scope clamp + P3-before-P4/P9 ordering | Auto | P1 | agent:self/global bypass sandbox isolation |
| 53 | Eng | EH8 core-side clone + Read-only/no-net extractor jail | Auto | P1 | "read-only" incompatible with clone/Bash in the toolset |
| 54 | Eng | EH9 per-run gateway secret; provenance non-security until then (→ new rule 17) | Auto→gate | P1 | run-id auth is impersonable |
| 55 | Eng | EH10 user_id shape (→ D6-followup gate question) | Gate | — | Half-tenant schema is cargo-cult without a coherent shape |
| 56 | Eng | EM1-EM7 folded/registered (WS filtering, RunCreate seam, approval prompt, 0009-behind-P6-Q0, task_questions table, in-repo cross-phase suite + migration/gemini tests, worker-thread bg + WAL-safe snapshot) | Auto | P1/P4 | All code-grounded structural fixes |

## Eng dual voices — consensus table `[subagent-only]`
| Dimension | Claude 3-lens | Codex | Consensus |
|---|---|---|---|
| 1. Architecture sound? | NO — wake durability (EC1) is the load-bearing gap | N/A | → P1 state-machine rewrite (folded) |
| 2. Test coverage sufficient? | NO — cross-phase suite external; migration+gemini gaps (EM6) | N/A | → in-repo gate-enforced (folded) |
| 3. Performance risks addressed? | Partial — event-loop starvation misdiagnosed as BUSY (EM7) | N/A | → worker-thread bg (folded) |
| 4. Security threats covered? | NO — 3 criticals + gateway/injection channels | N/A | → EC2/EC3/EH6/EH8/EH9 (folded) |
| 5. Error paths handled? | NO — orphan/reconcile failures leave leads waiting forever | N/A | → registry rows + reconcile sweep (folded) |
| 6. Deployment risk manageable? | Partial — WAL-unsafe pre-migration snapshot (EM7) | N/A | → online-backup snapshot (folded) |

### New gate question raised by Eng (bears on the already-made D6 decision)
- **D6-followup (EH10) — user_id shape.** The premise gate chose "nullable indexed
  `user_id` on every new table." Eng flags this produces a **half-tenant schema**: no
  `users` table, no FK target, existing core tables (agents/projects/runs/tasks) have no
  `user_id`, and no backfill story — cargo-cult tenancy that satisfies neither today's
  single-user reality nor a future migration cleanly. Options at final gate: (a) keep
  bare nullable `user_id` columns as forward-markers + document in PHASE6-NOTES that the
  real tenancy migration adds the `users` table, FKs, and backfills all tables at once
  (rec — cheapest honest version of "keep the door open"); (b) add a real `users` table
  now (`owner` row seeded) + FKs on new tables only (partial but coherent); (c) reverse
  D6 to portability-contract-only (no columns). Surfaced, not auto-decided.

**Phase 3 complete.** Codex: unavailable. 3-lens fan-out: 22 findings (3 critical,
9 high, 7 medium), verify pass incomplete (session limit) → all PLAUSIBLE, criticals
spot-checked. 0/6 dimensions clean; all mapped to folded fixes or gate questions.
Passing to Phase 3.5 (DX).

## Phase 3.5 — DX review (main voice)

**Two developer personas.** (1) The **founder-operator** (configures agents/tools,
answers the queue, reads the graph). (2) The **AI agent as developer** — the sharp one:
every spawned agent consumes an interface (SKILL.md system prompt, injected `<memory>`
block, the MCP toolset or the gemini fenced-directive grammar, the task description as
its brief) and **cannot ask clarifying questions before starting** — ambiguity becomes
wasted runs. Ground truth: `orchestrator/preamble.ts` builds what every agent sees;
`handoff.ts` holds the gemini `sparstrow` grammar (today: only `task_update` + `handoff`).

**TTHW (agent time-to-productive).** A freshly-spawned sub-agent's "hello world" =
understanding its task + tools + memory + escalation path from its prompt alone. Today's
preamble gives identity + memory protocol but **no escalation contract** and **no
statement of what tools it has or when to use which**. Target: a delegated agent acts
correctly on turn 1 with zero discovery runs.

**DX Scorecard (8 dimensions, 0-10):**
| # | Dimension | Score | Gap → fix (folded) |
|---|---|---|---|
| 1 | Agent time-to-productive | 4 | Preamble omits escalation + the delegation brief. **DX1:** P3 injects into every delegated agent's preamble: parent intent, why-you, sibling context, and "if stuck, call `task_block` / emit the block directive — you will be re-run with the answer." |
| 2 | Tool ergonomics (agents) | 5 | ~6 new tools across phases risk sprawl + "when do I use which?". **DX2:** one "your tools" preamble section grouped by intent (do-work / delegate / escalate / remember / look-up), each with a one-line WHEN; names stay verb_noun (`task_block`, `spawn_subtask`, `graph_query`). |
| 3 | Error legibility (agents) | 4 | Clamped permission, cross-team `pending_approval`, circuit-breaker halt, degraded graphify — an agent needs an *actionable* message, not a dead end. **DX3:** every agent-facing rejection returns problem + cause + what-to-do ("tool X denied by task policy — proceed without it or `task_block` to ask the human"), never a bare 403/500. |
| 4 | Escalation/wake contract | 3 | Fresh-run wake (PRIMARY) means the resumed process has **no memory of blocking**. **DX4:** the wake preamble must state "you previously blocked on Q; the human answered A; here is your prior progress — continue from there," self-contained. Tie to P1 `injected_context`. |
| 5 | Founder operational DX | 6 | Permission hierarchy config, node-graph reading, quarantine promotion. **DX5:** the P2 effective-tools view (design H6) + node click-through + quarantine two-pane (design M5) already fold this; add "why did this agent do X" = the E1 provenance panel. |
| 6 | Consistency: gemini grammar vs MCP | 3 | **The parallel-interface drift is real and confirmed in code** — `preamble.ts`/`handoff.ts` give gemini only `task_update`+`handoff`; every new tool (task_block, spawn_subtask, memory_save already partially, graph_query, message_send) must be mirrored in the fenced grammar or gemini agents silently can't do it. **DX6:** one shared capability registry drives BOTH the MCP registration AND the gemini directive grammar + preamble docs (single source; a tool missing from one surface is a build error). Resolves EM6/P1-Q4 structurally. |
| 7 | Docs/discoverability | 5 | SKILL.md is the agent's only manual. **DX7:** the generator (P9 ceiling relaxation) emits the tool/escalation/memory contract into every SKILL.md so it's in-band, not tribal. |
| 8 | Feedback loop | 6 | Founder learns an agent misbehaved via run detail. **DX8:** E1 provenance + the delegation tree + attention queue already close most of this; add per-agent "recent failed runs" on the SkillViewer (small). |

**Developer journey (agent, delegated task):** wake → read preamble (identity, project,
**tools-by-intent [DX2], escalation [DX1]**) → read task description (untrusted-delimited
[EC3]) → read `<memory>` block (untrusted-labeled [EH6]) → do work → hit ambiguity →
`task_block`/directive [DX1] → run ends → (later) fresh wake with self-contained
"you asked Q, answer is A, prior progress P" [DX4] → complete → `task_update`. Every
arrow the plan previously left implicit is now a preamble contract.

**Developer journey (founder, morning):** covered by design C1/C2 (typed queue, composer)
+ Dashboard aggregate PR queue + E1 provenance ("why did it do that") + node-graph
run controls (E2). No new DX gaps beyond design's.

**DX implementation checklist (folded into phases):** DX1-DX4 → P1/P3 preamble contract;
DX6 → a shared capability registry (P1 foundational — every later tool registers once,
emits to MCP + gemini grammar + preamble + SKILL.md); DX3 → agent-facing error format
in every tool/route; DX7 → SKILL.md generator (P9).

### DX dual voices — independent subagent `[subagent-only]`
The subagent found the sharp version of my main-voice pass, grounded in code: the
**agent-facing interface** (the actual prompt string, `RunContext`, tool descriptions,
wake payload, two-grammar parity) is the consistently under-specified layer — precisely
where wasted runs, silent no-ops, and hallucinated recoveries originate. Three criticals,
four highs, five mediums — all confirmed against code, all folded:

- **DX-C1 (critical)** wake handoff was specified at the DB layer but never as *the prompt
  the agent reads* (`run-manager.ts:171` = `[preamble, memory, ## Task]`, no wake
  section); plus a real column-name collision (`runs.injected_context` = memory audit vs
  the plan's `tasks.injected_context`). → `buildWakePrompt` pure fn + golden tests; column
  renamed `tasks.wake_payload` (folded into P1).
- **DX-C2 (critical)** `RunContext = {runId, agent, projectSlug}` (`agent-memory.ts:17`)
  carries no `taskId`/`parentTaskId`/`teamId` — delegation is invisible to the agent and
  tools can't auto-scope. → task-aware `RunContext` + `## Your assignment` preamble as a
  **P1 foundation** (prerequisite for P3), folded.
- **DX-C3 (critical)** gemini second-class: the fenced grammar is only `task_update`+
  `handoff` (`handoff.ts:30-33`); ~6 new capabilities need per-tool parity, deferred to
  one Q. → **cross-cutting rule 20** (one registry drives both surfaces or declares
  claude-only), folded.
- **DX-H1** agent-facing errors are raw `Error:` strings; "correct, now stop" outcomes
  look like failures → **rule 21** structured recovery errors, folded.
- **DX-H2** `task_create` vs `spawn_subtask` overlap invisible to agents → disambiguation
  in tool descriptions + escalation ladder in preamble, folded (P3 + rule 21).
- **DX-H3** injection delimiter marks the carrier but never teaches the reader; `<memory>`
  header is trust-positive (`injector.ts:73`) → receiving-side trust instruction + header
  change + golden injection test, folded (P1 item 6).
- **DX-H4** `task_block(questions[])` is unstructured → structured question schema
  (options/recommendation/default), folded (P1 item 2).
- **DX-M1/M2/M4/M5** SKILL.md factory-contract boundary; resolved-toolset preamble;
  internal statuses never agent-visible; unknown-directive surfacing → rules 20/22 +
  P9 SKILL.md boundary, folded.
- **DX-M3** promote E5 factory-health from taste → deliverable (degrade-by-design product
  needs one "is my factory armed?" surface) → **strengthens the E5 final-gate taste
  decision** (both DX and CEO now argue for it; still owner's scope call).

## DX Scorecard (post-fold) & consensus `[subagent-only]`
| Dimension | Main voice | Subagent | Consensus |
|---|---|---|---|
| 1 Agent time-to-productive | 4 | DX-C2 critical (no task context) | CONFIRMED → task-aware RunContext (P1 foundation) |
| 2 Tool ergonomics | 5 | DX-H2 (task_create overlap) | CONFIRMED → disambiguation + ladder |
| 3 Error legibility | 4 | DX-H1 critical-adjacent | CONFIRMED → rule 21 |
| 4 Escalation/wake contract | 3 | DX-C1 critical (no wake prompt) | CONFIRMED → buildWakePrompt + wake_payload |
| 5 Founder operational DX | 6 | DX-M3 (health surface) | CONFIRMED → E5 to gate (strengthened) |
| 6 gemini/MCP consistency | 3 | DX-C3 critical | CONFIRMED → rule 20 single registry |
| 7 Docs/discoverability | 5 | DX-M1 | CONFIRMED → SKILL.md contract boundary (P9) |
| 8 Feedback loop | 6 | not contested | single-voice |

**TTHW:** delegated-agent time-to-productive moves from "discover task/tools/escalation
across N wasted runs" → "act correctly turn 1" once RunContext is task-aware, the
preamble carries tools-by-intent + the assignment brief, and the wake prompt is
self-contained. Target met on paper; golden-transcript tests prove it per phase.

**Phase 3.5 complete.** Codex: unavailable. Main voice: 8-dimension scorecard, all folded.
Subagent: 3 critical + 4 high + 5 medium, all code-grounded, all folded. Consensus: 7/8
dimensions CONFIRMED, 1 single-voice. The agent-as-developer interface is now a
first-class layer of the plan, not an afterthought. Passing to Phase 4 (Final Gate).

## Decision Audit Trail (DX)
| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|----------------|-----------|-----------|
| 57 | DX | DX-C1 buildWakePrompt pure fn + wake_payload rename | Auto | P5/P1 | Wake was DB-specified, never as the agent's prompt |
| 58 | DX | DX-C2 task-aware RunContext as P1 foundation | Auto | P1 | Delegation invisible to agent without it |
| 59 | DX | DX-C3 rule 20: one registry, both agent interfaces | Auto | P4/P5 | gemini silently loses every new capability otherwise |
| 60 | DX | DX-H1 rule 21: structured agent-facing errors, non-isError stops | Auto | P1 | Bad errors → retries/hallucinated workarounds |
| 61 | DX | DX-H2 task_create/spawn_subtask disambiguation + ladder | Auto | P5 | Two tools, one apparent job |
| 62 | DX | DX-H3 receiving-side trust instruction + memory header | Auto | P1 | Security control was half-built (carrier marked, reader untaught) |
| 63 | DX | DX-H4 structured task_block question schema | Auto | P1 | Founder queue quality bounded by question quality |
| 64 | DX | DX-M1-M5 folded (SKILL.md boundary, resolved-toolset preamble, internal-status hiding, unknown-directive surfacing) | Auto | P1/P5 | Code-grounded structural fixes |
| 65 | DX | DX-M3 strengthens E5 (factory health) taste decision | Taste→gate | — | Degrade-by-design needs an "armed?" surface; DX+CEO agree |

## Final Gate — per-phase locks (owner, 2026-07-03)
| # | Phase | Decision | Class | Rationale |
|---|-------|----------|-------|-----------|
| 66 | §0.1 | **Stack change:** Gemini CLI retired → Claude Code CLI primary + direct-API (Gemini/Anthropic/OpenAI) + Ollama; drop fenced grammar; unified tool-calling registry | Owner | Gemini CLI retired to Antigravity 2.0; API-native tool calling supersedes text grammar |
| 67 | §0.1 | **P8 promoted optional→foundational**; C9 scope challenge withdrawn | Owner | Direct API is now how every non-Claude model runs |
| 68 | P1 | P1-Q1 fresh-run-primary wake | Owner | Universal contract across CLI + direct-API |
| 69 | P1 | P1-Q2 Dashboard section + badge | Owner | The morning surface, one home |
| 70 | P1 | P1-Q3 block-and-wake only | Owner | No idle CLI processes |
| 71 | P1 | P1-Q4 superseded → registry parity | Owner | No gemini grammar to extend |
| 72 | P1 | **P1 LOCKED** (foundation) | Owner | Registry + task-aware RunContext + wake state machine + task_questions |
| 73 | P2 | P2-Q0 P2-LITE (resolver+snapshot+clamp; matrix UI deferred) | Owner | Full matrix is enterprise UI for an audience of one |
| 74 | P2 | P2-Q1 Global→Agent→Project→Task | Owner | Projects contain their agents (sandbox/client isolation) |
| 75 | P2 | P2-Q2 empty allow = inherit/default everywhere | Owner | Restriction always explicit disallow; no silent strip |
| 76 | P2 | **P2 LOCKED** (lite) | Owner | Immutable per-run snapshot is the P3 security spine |
| 77 | P3 | P3-Q1 copy self-notes on first instantiate | Owner | Preserve agent expertise; isolate per-project after |
| 78 | P3 | P3-Q5 busy keyed on instance | Owner | Cross-project parallelism is the point of instances |
| 79 | P3 | P3-Q2 per-spawn cross-team approval | Owner | Tightest cross-domain security gate |
| 80 | P3 | P3-Q3 soft-archive ephemeral teams (folded) | Owner-fold | Keeps history + FK integrity |
| 81 | P3 | P3-Q4 depth cap 3 configurable (folded) | Owner-fold | Bounds runaway recursion + cost |
| 82 | P3 | **P3 LOCKED** | Owner | Instance-identity seam table is the biggest item |
| 83 | P4 | P4-Q3 variant copies project-scope notes only | Owner | Clean shared-architecture inheritance |
| 84 | P4 | P4-Q1 briefings opt-in per project | Owner | Background-LLM cost discipline |
| 85 | P4 | P4-Q2 dedicated project_directives table | Owner | Explicit always-inject contract |
| 86 | P4 | P4-Q4 read-only file tree (open-in-editor → TODOS) | Owner | Simplest; editor launch is a later nicety |
| 87 | P4 | **P4 LOCKED** | Owner | Sandbox clamp + P3-before-sandbox ordering mandatory |
| 88 | P5 | P5-Q5 extract temp-gbrain algorithms into own schema | Owner | Reuse proven logic, skip storage coupling |
| 89 | P5 | P5-QS keep P5 monolithic (no split) | Owner | Wants complete memory build together |
| 90 | P5 | P5-Q2 nightly-batch signals (not per-run) | Owner | One cheap pass; freshness rarely matters intraday |
| 91 | P5 | P5-Q1/Q3/Q4 folded (dream off-default, contradictions flag-only, refresh manual+nightly) | Owner-fold | Cost + safety discipline |
| 92 | P5 | **P5 LOCKED** | Owner | Degrade-gracefully + cost-capped per PR-5 |
| 93 | P6 | P6-Q0 head-to-head at build gate; Q1 Goal-mode in /tasks; Q3 consensus on push/PR goals; Q4 pipelines separate | Owner | Decide the engine on evidence; keep schema+UI |
| 94 | P6 | **P6 LOCKED** | Owner | Engine via head-to-head; executor row-recoverable |
| 95 | P7 | P7-Q1 key-file (not DB); Q2 core opens PRs via API; Q3 default factory | Owner | Resident-agent DB-read is the real threat |
| 96 | P7 | **P7 LOCKED** | Owner | Allowlist env + PAT-out-of-DB mandatory |
| 97 | P8 | P8-Q3 keep at P8; Q1 Anthropic API first; Q2 Ollama fast-follow | Owner | Prove foundation on Claude CLI first |
| 98 | P8 | **P8 LOCKED** (foundational) | Owner | Unified tool-loop reuses registry + finalize core |
| 99 | P9 | P9-Q1 advisory dup-detect; Q2 dedicated Specter reviewer; C3 SKILL.md ceiling relaxed | Owner | Low-friction creation + serious security |
| 100 | P9 | **P9 LOCKED** | Owner | Core-clone/read-only/no-net extractor jail |
| 101 | P10 | P10-Q1 slim ephemeral view; Q2 linear-pipelines-only canvas v1 | Owner | Keep the biggest UI phase bounded |
| 102 | P10 | **P10 LOCKED** | Owner | team_id filters over global state, never forked |
| 103 | GATE | D6-followup → bare user_id markers + PHASE6-NOTES ledger | Owner | Cheapest honest "door open"; real tenancy migration later |
| 104 | GATE | E5 factory-health page → BUILD (cross-cutting rule 23) | Owner | Degrade-by-design needs an "armed?" readout; CEO+DX agree |


---

## Build order (locked dependency sequence)

Implementation proceeds in this order (each phase's `## Pn` build-spec is the contract;
at each build start Fable re-validates the locked section against current `main` per §0
PR-6, and re-escalates on material drift):

**P1** (foundation: capability registry, task-aware RunContext, wake state machine,
`task_questions`) → **P2-lite** (resolver + immutable per-run snapshot + clamp) →
**P3** (delegation, instances, swarms) → **P4** (projects workspace, sandbox, variants) →
**P5** (memory: graphify + extracted gbrain algorithms, dream cycle) → **P6** (GOAP/DAG
engine via P6-Q0 head-to-head + node graph) → **P7** (git automation + PAT + factory-health
page E5) → **P8** (direct-API tool-loop: Anthropic → Gemini → Ollama) → **P9** (exceptional
creation + Skill Specter) → **P10** (Team Workspace + canvas).

Cross-cutting rules 1-23 apply to every phase. Artifacts: this plan (per-phase specs +
appendix), the test-plan artifact at
`~/.gstack/projects/sparstrow-sparstrowGen/claude-dreamy-engelbart-874599-test-plan-20260702.md`,
and `TODOS.md` (deferred items).

**Final gate: APPROVED 2026-07-03.** All 10 phases locked; plan is the build contract.
<!-- /autoplan review end — master plan APPROVED, all phases LOCKED -->
