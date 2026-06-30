# SPEC — Agents page redesign + new features

Source: `.design-src/agents/export.html` (Claude Design export, decoded via `scripts/ds-unpack.mjs`)
Authored modules read: mod-04 (Agents/Dashboard/SkillViewer), mod-05 (Agent Creator),
mod-09 (Agent Teams), mod-10 (AppShell nav). Compared against current app on branch
`chore/backup-scripts`, 2026-06-27.

Legend: **[EXISTS]** already in app · **[NEW]** net-new · **[CHANGE]** redesign of existing ·
**[CONFLICT]** design assumption disagrees with backend reality (resolve before build).

---

## Scope (LOCKED 2026-06-27)

The page we are working on is **Agents**. The export bundles more (Dashboard, Projects,
Schedule, Tasks, Run detail) — those are OUT of scope.

- **Pass 1 (this build):** F1 SkillViewer · F2 split New-agent button · F3 Agent Creator.
- **Pass 2 (separate autoplan run later):** F4 Agent Teams · F5 nav for Teams.

### Locked decisions
1. **SKILL.md = generated projection, DB is source of truth.** The agent row (fields, tools,
   prompts, scopes) is authoritative. A generator formats it into a SKILL.md and writes
   `~/sparstrow/agents/<id>/SKILL.md`; the file is regenerated on every create/update. There is
   **no stored `skill` column** — it is derived. In the UI, the **SKILL.md tab is read-only**
   (view + copy); all editing happens through the Overview structured fields, which regenerate
   the file. (This overrides the design's editable SKILL.md textarea.)
2. **Providers:** build against the real enum `claude-code` + `gemini-cli`. Drop `codex` from the
   UI. No backend provider change.
3. **Build order:** F1–F3 first; Teams (F4/F5) deferred to pass 2.
4. **"Run team":** deferred with Teams (pass 2).

### Office-hours feature lock (2026-06-27)
5. **SKILL.md body source = `systemPrompt`.** Collapse the design's separate `systemPrompt` +
   `skill` fields. The generated SKILL.md is: frontmatter (name/role/model/tools, from the
   structured fields) + `systemPrompt` rendered as the markdown body. No separate stored body
   field; `systemPrompt` is the one prose field an agent carries.
6. **Edit surface = the SkillViewer.** Editing an existing agent happens inline in the SkillViewer
   panel (Overview fields → Save → regenerate SKILL.md). `AgentFormDialog` is kept **only** for the
   F2 "Manually create" path. Move edit out of the dialog.
7. **Agent Creator is confirmed in scope** (founder: agent creation is frequent + the raw form is
   painful) and **keeps the FIND intent** (locate existing agents by capability) — useful as the
   agent count approaches the 30-agent target.
8. **Agents page stays a config registry.** No per-agent live status / run state on this page;
   the operational "what's my workforce doing now" view belongs to Dashboard/Runs (a later pass).
   Keeps this build's data needs to plain CRUD + the draft endpoint.

---

## Feature list (the CONFIRM checklist)

### F1 — Agents list: open agent in a SkillViewer slide-over  **[CHANGE]**
- Today: a flat table; row actions Edit/Test-spawn/Delete via dropdown; create/edit in a modal
  dialog (`AgentFormDialog`).
- Design: same table columns (Name, Role, Provider, Model, Permissions, Enabled, Updated, ⋯),
  but the **Name is a button** that opens a right-side **SkillViewer** panel (≈560px). Row ⋯
  menu gains **View agent** alongside Edit/Test-spawn/Delete.
- SkillViewer has two tabs:
  - **Overview** — sectioned read view with inline Edit mode (Edit → fields become inputs →
    Save/Cancel). Sections: Identity (name, role, system prompt), Model (provider, model),
    Execution & access (working dir, max turns, permission mode, allowed/disallowed tools),
    Memory scopes (read/write scope chips: `global` / `project:*` / `agent:self`), Status
    (enabled, last updated), Skill (link to the SKILL.md source file).
  - **SKILL.md** — renders the agent's SKILL.md (frontmatter table + markdown body) with a
    Copy button; in edit mode, a mono textarea.
  - ESC closes (or cancels edit); click-outside closes when not editing.
- Comparer notes:
  - Overview fields are ~90% backed by `agentSchema` already. Renames to wire: design
    `workingDir`→`cwd`, `readScopes`→`memoryReadScopes`, `writeScopes`→`memoryWriteScopes`.
  - **[NEW] SKILL.md generator (not a column)** — generate SKILL.md from the agent row and write
    `~/sparstrow/agents/<id>/SKILL.md` on create/update. SKILL.md tab is **read-only** (view+copy);
    edits go through the Overview fields. (Resolved: DB is source of truth.)
  - **[RESOLVED] providers** — build against the real enum `claude-code` + `gemini-cli`; drop codex.

### F2 — Split "New agent" button: Manual vs Agent Creator  **[CHANGE]**
- Today: a single "New agent" button → opens the form dialog.
- Design: a dropdown (`NewAgentButton`) with two rows:
  - **Manually create** → existing agent form (keep current path).
  - **Create with agent creator** → opens Agent Creator (F3).
- Low risk: pure UI; the Manual path reuses what exists.

### F3 — Agent Creator  **[NEW]**
- A full-screen modal (≈1080×760), two columns:
  - **Left: chat.** Empty state with 4 starter prompts. Conversational interview — one focused
    question per turn. Composer with up-to-3 followup suggestion chips; Enter sends.
  - **Right: live draft pane.** Renders the forming agent (name, role, model, permissions,
    allowed/disallowed, read/write scopes) + a live **SKILL.md preview**. "Create agent"
    (enabled when ready) + reset.
- Two intents:
  - **BUILD** — interview → fill every field with sensible defaults → write a real SKILL.md
    (<40 lines) → create the agent.
  - **FIND** — locate existing agents by capability; results render as match cards with
    **Open** / **Use as starting point** (clones into the draft).
- AI bridge: design calls `window.claude.complete()` with a system prompt and expects strict
  JSON back `{reply, intent, draft, readyToCreate, matches, followups}`. Has a deterministic
  keyword fallback so the flow works without AI.
- Comparer notes:
  - **[NEW] backend endpoint** — needs a real server route (e.g. `POST /api/v1/agents/draft`)
    that runs the Creator system prompt against Claude and returns the structured turn. The
    `window.claude.complete` shim must map to this. This is the one feature with real backend
    work beyond CRUD.
  - The draft schema it emits matches F1's field set (so it shares the `skill` decision + the
    provider conflict).
  - "Create agent" → reuses the existing create-agent mutation; only the draft-shaping is new.

### F4 — Agent Teams  **[NEW]** (no backend exists at all)
- **Teams index** — grid of team cards (name, description, agent-count chip, assigned-project
  chips, member avatars). "New team" → inline `NewTeamPanel` (name, description, toggle which
  projects to assign).
- **Team detail** — editable name (click-to-edit), description, agent-count, **Run team** action,
  Delete. Assigned-projects section (add/remove project chips). Members section with a **List
  view** / **Tree view** toggle.
  - **List view** — managers, each with nested subagents (one level deep shown), click-to-edit
    name/role, add subagent, remove.
  - **Tree view** — org-chart: team root → managers → subagents, with connector lines.
- Data model (design): `team { id, name, description, projectIds[], members[], createdAt }`;
  `member { id, name, role, agentId, children[] }` (recursive: manager → subagents).
- Comparer notes:
  - **[NEW] everything** — no `teams` table, type, API, route, or nav entry today. Needs: schema
    + migration, shared zod type, CRUD API, UI route/page, nav entry.
  - `agentId` on each member references a real agent; `projectIds` reference real projects (both
    exist). "Run team" semantics (what running a manager→subagent hierarchy actually does in the
    run engine) is **undefined and out of scope for the UI build** — wire the button to a stub or
    defer. Flag for a separate design.

### F5 — Navigation: add Teams  **[CHANGE]**
- AppShell (mod-10) is the sidebar+header chrome. Adding Teams (F4) needs a nav entry + route.
- Verify against current `packages/ui/src/routes/` + nav config; keep the existing 13 routes,
  add `teams`.

---

## Design system / tokens / motion

- **Component mapping ≈ 1:1.** The design composes with `window.SparstrowgenDesignSystem_*`,
  which is your exact `@sparstrow/ui` set (Card, Badge, Button, Input, Select, Textarea, Table,
  Tabs, DropdownMenu, Separator, Switch, Label). Build with the real primitives; almost no new
  base components. New *composite* components only: SkillViewer, NewAgentButton, AgentCreator,
  Teams (index/detail/list/tree), NewTeamPanel.
- **Tokens** are CSS variables matching `globals.css` (`--border`, `--radius-xl`, `--primary`,
  `--muted-foreground`, `--accent-{slate,sky,amber,violet,emerald,red}`, etc.). Primary `#D97757`.
  The task board references `--accent-*` semantic colors — confirm those exist in `globals.css`
  or add them.
- **Fonts**: custom woff2 fonts ARE embedded in the export (`--font-sans`, `--font-mono`).
  Capture the actual families before build; the old `.design-sync` "system fonts only" note is stale.
- **Motion**: plain CSS transitions + cubic-bezier (no framer-motion). Inventory:
  - Slide-over panels (SkillViewer, right-side): enter from right.
  - Hover transitions on rows/cards/buttons (`background .12s`, `border-color .12s`).
  - Agent Creator "thinking" dots: staggered pulse (`spg-pulse`, 0.18s delay step).
  - Tree/segmented controls: thumb slide `.15s cubic-bezier(.3,.7,.4,1)`.

---

## Backend delta summary (for /autoplan)

| Item | Status | Pass | Work |
|---|---|---|---|
| Overview fields (name…enabled) | [EXISTS] | 1 | wire renames (cwd, memoryRead/WriteScopes) |
| SKILL.md generator + file write | [NEW] | 1 | format agent row → `~/sparstrow/agents/<id>/SKILL.md` on change; read-only in UI |
| providers (claude-code, gemini-cli) | [RESOLVED] | 1 | drop codex from UI; no backend change |
| Agent Creator AI endpoint | [NEW] | 1 | `POST /api/v1/agents/draft` → Claude → structured turn |
| Teams (table→API→route→nav) | [NEW] | 2 | full vertical slice |
| "Run team" execution semantics | [DEFER] | 2 | separate design; stub the button |

All CONFIRM-gate decisions are resolved (see Scope → Locked decisions). SPEC is approved and
ready for `/autoplan` on Pass 1 (F1–F3).

---
<!-- AUTONOMOUS DECISION LOG -->
# /autoplan Review (2026-06-27, Pass 1 F1–F3)

Reviewed by CEO/Design/Eng/DX phases. Dual-voice = **Claude subagents only** —
`codex` CLI not installed (`[codex-unavailable]` all phases). 4 independent
subagents reviewed the SPEC fresh; findings folded in below.

**Premise gate (human):** 4 premises accepted; the 5th — "agent creation is frequent
+ painful ⇒ F3 AI builder" — was a User Challenge. **Resolved by founder:
deterministic-first, AI as enhancement** (Option C). Pass 1 keeps F3, but the working
default is form-prefill + Duplicate-agent + client-side FIND; the AI interview layers
on top as an *announced* enhancement (fallback is the visible floor, never silent).

## Decision Audit Trail
| # | Phase | Decision | Class | Principle | Rationale |
|---|-------|----------|-------|-----------|-----------|
| 1 | CEO | Accept registry/SKILL.md-projection/Pass-1 premises | Mechanical | P6 | Reviewers confirm correct; schema already matches |
| 2 | CEO | F3 scope = deterministic-first (Option C) | **User Challenge** | — | Founder chose at premise gate |
| 3 | CEO | Add "Duplicate agent" action to Pass 1 | Auto | P2/P3 | In blast radius, ~0 backend, biggest creation-pain relief at 30-agent scale |
| 4 | CEO | FIND = client-side filter, not LLM endpoint | Auto | P3/P4 | List is already client-side; LLM round-trip is waste |
| 5 | Eng | Single shared `renderSkillMd()` in @sparstrow/shared | Auto | P4/P5 | UI preview + server write must be byte-identical; one source |
| 6 | Eng | Extract one shared agent-fieldset (create+edit+draft) | Auto | P4 | Kills create/edit drift across 3 surfaces |
| 7 | Eng | /draft validates draft vs schema + clamps permissions | Auto | P1 | Trust boundary; no `bypassPermissions` from a draft |
| 8 | Eng | /draft transport = **reuse RunManager** (`createRunAndAwait` helper) | Taste → **RESOLVED** | P5 | Founder chose at final gate: stay in-architecture, no new SDK/auth/billing dep |
| 9 | Eng | SKILL.md = **on-demand for UI + best-effort disk write** (config `agentsDir`, DELETE cleanup) | Taste → **RESOLVED** | P5 | Founder chose at final gate: keep on-disk artifact for future consumers, fix ~/path + orphan + write-fails-create bugs |
| 10 | DX | Fallback must be announced, not silent | Auto | P1 | Silent regex-substitute-for-AI is a correctness trap |

**Final gate: APPROVED 2026-06-27.** Both taste decisions resolved (recommended options). Plan locked for Pass 1.

## Dual-voice consensus (CEO)
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Premises valid? | Mostly (F3 contested) | N/A | Resolved at gate |
| Right problem? | Config polish defers higher-value run-observability | N/A | flagged |
| Scope calibrated? | F3 over-weighted; Duplicate cheaper | N/A | → Option C |
| Alternatives explored? | "Duplicate agent" dismissed-by-omission | N/A | added |
| 6-mo trajectory? | AI prompt drifts from zod schema | N/A | mitigate via schema-derived contract |

## Dual-voice consensus (Eng)
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Architecture sound? | /draft has NO sync Claude path (CLI-only, streamed) | N/A | **CRITICAL — must spec transport** |
| Test coverage? | Zero test infra exists | N/A | wire vitest (T0) |
| Performance? | CLI cold-start per turn = seconds; 15-min slot, cap=4 | N/A | short-timeout await helper |
| Security? | free-text→LLM→agent config = priv-esc via permissionMode/tools | N/A | **CRITICAL — validate+clamp** |
| Error paths? | bus.subscribe leak on disconnect; fs-write-after-DB-commit | N/A | unsub on timeout; best-effort write |

## Dual-voice consensus (Design)
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Hierarchy | SkillViewer leads with dense form not identity | N/A | add identity header |
| Missing states | AC AI fail/slow/invalid-JSON/partial unspecified | N/A | **CRITICAL — spec all** |
| Journey | 3 surfaces author same agent → drift | N/A | shared fieldset |
| A11y | no focus trap/restore for custom slide-over+modal | N/A | build on dialog primitive |

## Dual-voice consensus (DX)
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Time-to-agent | manual form already ~2 actions; Creator slower for trivial | N/A | Creator's value = decision-support, not speed |
| Schema drift | mod-05.js emits `workingDir/readScopes/skill/codex` | N/A | **CRITICAL — don't port module; build SPEC decisions** |
| Errors | silent AI→fallback; dev never learns /draft is down | N/A | announce + distinguish offline vs error |
| Escape hatches | draft pane read-only; no fast lane for expert | N/A | editable draft / "switch to manual, keep draft" |

## Cross-phase themes (flagged independently in ≥2 phases — high confidence)
1. **One shared `renderSkillMd` + one shared agent-fieldset** — CEO, Design, Eng, DX. Single highest-leverage structural fix; retires create/edit drift, the rename burden, and SKILL.md preview/write divergence.
2. **/draft transport + trust boundary** — CEO, Eng, Design, DX. No sync Claude path; free-text→agent-config is priv-esc. Both must be resolved before build.
3. **SPEC-vs-design-module drift** — DX (critical), Eng. The decoded `mod-05.js` still carries pre-lock schema/providers/silent-fallback. **Build the SPEC's locked decisions, not the module.**

## NOT in scope (deferred, with rationale)
- F4 Teams, F5 nav, "Run team" — Pass 2 (explicit in SPEC).
- Live workforce / per-row run status on Agents page — Dashboard/Runs, later pass (locked decision 8).
- Run-observability surfaced in SkillViewer (CEO suggestion to show last-run status/cost) — deferred; noted as higher-value future work.
- Direct Anthropic SDK transport — rejected default in favor of RunManager reuse (revisit only if founder picks it at final gate).
- Paste-back editing of SKILL.md — intentionally unsupported (DB is source of truth); mitigate with clear "Generated — edit in Overview" label + fully-portable copy.

## What already exists (leverage map — verified against code)
| Sub-problem | Existing code | Gap |
|---|---|---|
| Agent fields (renames, enum) | `packages/shared/src/schemas/agent.ts` | none — `cwd`/`memoryRead/WriteScopes` present, enum already `claude-code`+`gemini-cli`, no `skill` col |
| CRUD + test-spawn | `packages/core/src/api/routes/agents.ts` | add DELETE file-cleanup; add /draft route |
| Form + ScopeEditor + formToPayload | `packages/ui/src/components/agent-form.tsx` | extract shared fieldset |
| Table page | `packages/ui/src/routes/pages/agents.tsx` | name→button, ⋯ View, NewAgentButton, Duplicate |
| Auth (bearer on /api, token injected to UI) | `api/auth.ts`, `api/server.ts` | none — /draft inherits requireAuth |
| Streamed Claude run + event bus + await pattern | `orchestrator/run-manager.ts`, `pipeline-executor.ts` | add `createRunAndAwait(opts,{timeoutMs})` w/ unsub-on-timeout |
| Design primitives (≈1:1) | `components/ui/*` | only new *composites* (SkillViewer, NewAgentButton, AgentCreator) |
| SKILL.md generator | — | **NEW** pure `renderSkillMd()` in shared |

## Architecture (Pass 1 backend delta)
```
UI                          core (Fastify :48750, bearer-auth /api)
─────────────────────       ────────────────────────────────────────
SkillViewer  ─┐
AgentCreator ─┼─ renderSkillMd() ◀── packages/shared (SHARED pure fn) ──▶ (optional) fs write
NewAgentBtn  ─┘     │                                                      agentsDir/<id>/SKILL.md
                    │                                                      (best-effort, config path)
POST /api/v1/agents/draft
   │  validate body → build system prompt from providerIdSchema+KNOWN_MODELS
   │  createRunAndAwait(creatorAgent, prompt, {resume sessionId, timeout 90s})
   │       └─▶ RunManager ─▶ claude -p stream-json ─▶ bus 'run.completed'
   │  parse resultText → draftTurnSchema.safeParse → CLAMP permissions
   ▼  → {reply, intent, draft(real field names), readyToCreate, matches, followups, sessionId}
POST /api/v1/agents  (existing) ◀── create reuses agentCreateSchema
```

## Failure Modes Registry (critical gaps flagged ⚠)
| Mode | Handling required |
|---|---|
| ⚠ /draft model emits unsafe draft (bypassPermissions, Bash(*)) | server clamps; human-only escalation |
| ⚠ AI silently falls back to regex | announce mode; distinguish offline vs endpoint-down |
| ⚠ schema drift (design field names ported) | one canonical mapping; safeParse before "ready" |
| Model returns non-JSON | strip fences, brace-extract, safeParse, repair turn |
| bus subscriber leak on client disconnect | unsub on timeout/abort |
| DB committed, fs write fails | best-effort write, logged, regenerable (DB is truth) |
| Mid-edit close in SkillViewer | dirty-state discard guard |
| Focus lost behind custom overlay | trap + restore (reuse dialog primitive) |

## Error & Rescue Registry (user-facing)
| Error | Message + rescue |
|---|---|
| Draft service unreachable | "AI builder unavailable — using basic mode. [Retry]" + form-prefill still works |
| Draft turn failed | inline bubble "I didn't catch that — try rephrasing", prior draft kept |
| Create failed after interview | inline error, draft + transcript preserved, "Create anyway"/"Switch to manual (keep draft)" |
| SKILL.md generate failed | tab shows "Couldn't generate SKILL.md [Retry]"; Overview still renders from row |
| Save failed (inline edit) | reuse dialog's destructive-text error region; stay in edit mode |

## Implementation Tasks (aggregated across phases)
> No per-phase `tasks-*.jsonl` were emitted (review ran inline, not via sub-skills);
> list hand-authored from findings under Decision C.

**P1 — critical / foundational**
- [ ] **T0 — wire vitest** across workspace (no test infra exists today).
- [ ] **P1.1 `renderSkillMd(agent)`** pure fn in `packages/shared/src/skill-md.ts` + barrel. Pin frontmatter (name/role/model, `tools`←allowedTools, include disallowedTools for portability), body = full `systemPrompt`. Snapshot + injection tests.
- [ ] **P1.2 Shared agent-fieldset** — extract `ScopeEditor`, provider/model select, permission select, CSV parsing, `agentToForm`/`formToPayload` from `agent-form.tsx` into `agent-fields.tsx`; consume in AgentFormDialog (create), SkillViewer Overview (edit), AgentCreator draft pane.
- [ ] **P1.3 /draft trust boundary** — server-side `agentCreateSchema.safeParse` the model draft; clamp `permissionMode` (no bypassPermissions) + reject wildcard tools; render `reply` as plain text. `packages/core/src/api/routes/agents.ts`.
- [ ] **P1.4 Kill design-name drift** — /draft system prompt generated from `providerIdSchema`+`KNOWN_MODELS` (no `codex`/`gpt-5-codex`); one canonical design→schema field map; reject `skill`/`workingDir`/`readScopes` shapes.

**P2 — high**
- [ ] **P2.1 Duplicate-agent** action (NewAgentButton row + table ⋯) — copy row, regen slug/id. Cheapest creation-pain win.
- [ ] **P2.2 Deterministic-first AgentCreator** (Decision C) — form-prefill + client-side FIND filter as working default; AI interview as announced enhancement; labeled fallback.
- [ ] **P2.3 SkillViewer states** — SKILL.md loading skeleton, save pending/error/success, dirty discard-guard, focus trap+restore. Build on existing dialog/overlay primitive.
- [ ] **P2.4 AgentCreator AI states** — per-turn error+retry, JSON-parse-fail keeps draft, real "Create anyway" gate (name+model+provider), preserve draft+transcript on create fail, editable draft pane / "switch to manual keep draft".
- [ ] **P2.5 Transport** (taste-gated, see final gate) — `runManager.createRunAndAwait(opts,{timeoutMs})` w/ unsub-on-timeout/disconnect, bypass memory injection, dedicated creator agent, `--resume` sessionId.

**P3 — medium**
- [ ] **P3.1 File lifecycle** (taste-gated) — config `agentsDir` (no `~`), best-effort write, DELETE cleanup.
- [ ] **P3.2 Tokens/motion** — keep app neutral tokens (design `#D97757`/accent palette is reference, not contract); add only accent tokens actually used in Pass-1 surfaces; add `spg-pulse` + slide-over keyframes to `globals.css`.
- [ ] **P3.3 Layout/a11y polish** — per-column scroll, modal min-viewport/shrink, FIND no-match→BUILD bridge, Shift+Enter, chips as buttons, Copy aria-live, read-only contrast ≥4.5:1.
- [ ] **P3.4 SKILL.md `<40 lines`** = Creator-prompt guidance only; generator never truncates.

<!-- /autoplan review end -->

---

## Pass 2 (Teams F4/F5) — Office-hours lock (2026-06-28)

Interactive feature-lock for the Teams slice (builder mode; factory's own page, single user —
demand diagnostic N/A). Decisions below are the contract for `/autoplan` on Pass 2.

### Locked scope (the small wedge)
Teams Pass 2 is **organization only**: group agents and assign teams to projects. No execution.

- **F4 Teams index** — grid of team cards (name, description, agent-count, assigned-project chips,
  member avatars = initials/color-hash chip). "New team" → **Dialog** (matches Pass-1/projects),
  name + description + project assignment.
- **F4 Team detail** — header (name, description, agent-count, Delete) + assigned-project chip row +
  **members section, List view only** (flat roster). Add member (combobox over the agent registry),
  remove member, edit **`team_role` only** (name/role are read-only, derived from the agent template).
  **Tree/org-chart view + manager→subagent hierarchy CUT from Pass 2** (autoplan UC-A — deferred to
  the run/deploy design).
- **F5 nav** — add `teams` route + nav entry; keep existing routes.

### Locked decisions
- **D1 — NO "Run team" button.** Removed entirely for Pass 2 (not even a stub). Founder decision:
  team execution is being redesigned as a richer "Team Workspace" (see north-star below), so a Run
  button now would imply a capability that doesn't exist and pre-commit the wrong execution model.
- **D2 — Normalized data model.** `teams(id, name, description, created_at, updated_at)`;
  team↔project as a join table `team_projects(team_id, project_id)`; members as
  `team_members(id, team_id, agent_id, team_role NULLABLE, sort)` — **flat membership** (autoplan UC-A
  cut `parent_member_id`/hierarchy from Pass 2). `team_projects` composite PK `(team_id, project_id)`;
  `teams.name` UNIQUE + `slug` (match the agents/projects convention). FK policy explicit in migration
  `0003_teams`: `team_members.team_id` / `team_projects.*` / `team_members.agent_id` → `ON DELETE
  CASCADE` (deleting an agent also removes its memberships — documented + tested; these are the first
  real FKs while `foreign_keys=ON` is already live). Drizzle + hand-written migration.
- **D3 — Members reference agent TEMPLATES; derive display fields.** `team_members.agent_id` →
  the agent registry row (the template). Display name/role come from the agent via join, NOT stored
  copies. `team_role` is an optional team-scoped label (e.g. "Manager", "Reviewer"), distinct from
  the agent's own role. Same "DB is source of truth, don't duplicate" principle as Pass 1's
  SKILL.md. (The design's stored per-member name/role is drift — do not port it.)
- **D4 — List view only (REVISED by autoplan UC-A).** Tree/org-chart view + the manager→subagent
  hierarchy are cut from Pass 2 and deferred to the run/deploy design (additive later — a migration +
  the Tree component, no rework of flat Pass 2). All 3 review voices flagged the hierarchy/Tree as the
  riskiest, most-likely-invalidated part.
- **D5 — Agent template→instance model: LOCKED, BUILT LATER.** Founder model: an agent created on
  the Agents page is a **template**. It is **copied into a project-scoped instance** when (a) a team
  is deployed to a project, or (b) it runs a standalone task in a project — so that each instance's
  `agent:self` memory is isolated per project and never bleeds across projects. **Pass 2 stores only
  template references** (D3). The instance table + copy-on-deploy + per-project `agent:self`
  isolation are built in the **separate run/deploy design** (bundled with the north-star), because
  copies are only created once something actually runs — which Pass 2 does not do. Writing it here so
  it is not lost; it touches the memory scope grammar, run-manager, and tasks.

### Backend delta (Pass 2)
| Item | Status | Work |
|---|---|---|
| `teams` + `team_projects` + `team_members` tables | [NEW] | schema + hand-written migration (adjacency `parent_member_id`) |
| Teams CRUD API | [NEW] | `/api/v1/teams` routes (inherits bearer auth); members nested under team |
| Shared zod types | [NEW] | `packages/shared/src/schemas/team.ts` (team, teamMember, create/update) |
| Teams UI route + nav | [NEW] | `/teams` page, AppShell nav entry (F5) |
| Teams composites | [NEW] | TeamsIndex, NewTeam Dialog, TeamDetail, MembersList (Tree CUT — UC-A) |
| Run team / task list / triggers / templates / manager-agent / visual builder | [DEFER] | → Team Workspace north-star (separate design) |

### North-star spawned from this session
The founder's larger vision — in-team task creation (multi-agent, cron, event triggers, save-as-
template, deploy-to-project), a conversational **Team Manager Agent** advisor, and an n8n / Power
Automate-style **visual workflow designer** — is the convergence of the existing Tasks + Pipelines +
Schedule(cron) + Agent Creator surfaces into one agent-assisted automation builder. It is a north-star
product area, NOT Pass 2, and overlaps existing pages (surface-ownership is its first design question).
Captured in `C:\Sparstrow\Startup plans\Sparstrowgen-team-workspace-northstar.md`; gets its own
`/office-hours` + `/plan-ceo-review`. **Status APPROVED for Pass 2 build is NOT set yet — Pass 2 still
needs `/autoplan` before the `Final gate: APPROVED` marker the build routine requires.**

<!-- AUTONOMOUS DECISION LOG -->
# /autoplan Review (2026-06-28, Pass 2 Teams F4/F5)

Codex unavailable (`[codex-unavailable: binary not found]`) — dual-voice = **Claude subagents only**,
3 independent reviewers (CEO/Design/Eng), no shared context. DX phase: scope is an internal CRUD page
with no external developer surface — full DX persona/TTHW review would be theater; handled inline
(validated: input validation + clean error codes covered under Eng F8). Restore point:
`~/.gstack/projects/Sparstrowgen/docs-factory-loop-autoplan-restore-20260628-214429.md`.

## Consensus tables (single-voice; Codex N/A)
**CEO** — Right problem? DISPUTED (reviewer: Runs/Dashboard outrank Teams). Premises valid? Mostly,
but "org-metadata-only" has no standalone payoff until run/deploy lands. Scope calibrated? NO — Tree +
hierarchy over-built. 6-mo trajectory? RISK — north-star "surface ownership" may invalidate the hierarchy.
**Design** — Data model + scope sound; **interaction layer under-specified** (states, add-member flow,
tree edge cases, depth, D3 contradiction). No critical architectural blockers.
**Eng** — Adjacency model is the right call but **NOT ready as written**: cycle prevention, member-delete
orphan policy, and the FK cascade-vs-restrict decision (silently changes agent-delete blast radius) are
unspecified and are exactly where it breaks.

## Cross-phase themes (flagged independently in ≥2 voices — high confidence)
1. **The manager→subagent hierarchy + Tree view is the risk center.** CEO: cut it (most speculative,
   may be invalidated by the north-star's surface-ownership question). Eng: it's the source of
   cycle/infinite-loop risk (F1) and the only real untested complexity. Design: its depth is ambiguous
   in 3 places (F-4). All three converge → see **User Challenge UC-A**.
2. **D3 "derived fields" contradiction.** Design F-7 + CEO F5: the design's "click-to-edit member
   name/role" contradicts D3 (name/role derive from the agent template). Only `team_role` is editable.
3. **Run-observability outranks Teams** (CEO F3/F4) — backed by APP.md's own note that CEO review
   ranked Dashboard/Runs above agent-config polish → see **User Challenge UC-B**.

## Auto-decided (added to the plan — P1/P2/P3 below). Principles: P1 completeness, P2 boil-lakes, P5 explicit.
| # | Phase | Decision | Class | Principle |
|---|-------|----------|-------|-----------|
| 1 | Eng | **Cycle guard required** — server-side ancestor walk rejects self-parent + descendant-as-parent (409); tree assembly carries a visited-set, drops back-edges. Required test. | Auto | P1 |
| 2 | Eng | **FK policy explicit in migration** — `team_members.team_id`/`team_projects.*` → `ON DELETE CASCADE`; `team_members.parent_member_id → team_members(id) ON DELETE CASCADE` (subtree cleanup); `team_members.agent_id → agents(id) ON DELETE CASCADE` **+ documented + tested** (note: this makes agent-delete also remove team memberships — first real FKs in a schema where `foreign_keys=ON` is already live). | Auto | P1/P5 |
| 3 | Eng | **Member-delete = cascade subtree** (via parent_member_id self-cascade); verified by test. | Auto | P5 |
| 4 | Eng | **`team_projects` composite PK (team_id, project_id)**; `teams.name` UNIQUE + `slug` to match the agents/projects convention. | Auto | P4/P5 |
| 5 | Eng | **Response shapes:** index = shallow cards (counts + few avatars, 2 flat queries, no N+1); detail = nested member tree assembled flat→tree in JS, ordered by `(parent_member_id, sort)`. Recursive `z.lazy` `teamMemberNode` schema + flat `teamMember` schema. | Auto | P1/P3 |
| 6 | Eng | **Ownership validation** — app-side existence checks for `agent_id`/`project_id` → clean 400/409, not raw SQLite FK 500 (mirror agents.ts validate-before-persist). | Auto | P1 |
| 7 | Eng | **Tests (vitest):** zod incl. recursive node; cycle rejection; cascade behaviors (team→members, agent→members, manager→subtree); flat→tree assembly (ordering, orphan, cycle); composite-PK dup rejection. (More test surface than route code — correct.) | Auto | P1 |
| 8 | Design | **States registry** — reuse Pass-1 patterns: skeletons; empty (no teams / team-no-members / no-projects-to-assign / no-agents-to-add); error (fetch/save/delete); optimistic-vs-pending for member add/remove + project toggle + delete-confirm Dialog with "agents & projects are kept" copy. | Auto | P1 |
| 9 | Design | **Add-member flow specified** — combobox/command over the agent registry (filter enabled), optional `team_role` entered at add-time, same template addable once per role; this is the core interaction. | Auto | P1 |
| 10 | Design | **Member inline-edit = `team_role` ONLY** (name/role read-only, sourced from agent) — reconciles the D3 contradiction. Reuse Pass-1 edit-mode (Save/Cancel/dirty-guard/ESC), not a second click-to-edit paradigm. | Auto | P4/P5 |
| 11 | Design | **Team detail hierarchy order:** (1) header name+desc+count+Delete, (2) assigned-project chip row, (3) members section (dominant) with List/Tree toggle (default List, per-component state). | Auto | P5 |
| 12 | Design | **NewTeam = reuse the Pass-1/projects Dialog** (not a divergent inline panel); member avatars = initials/color-hash chip (one net-new visual atom). | Auto | P4 |
| 13 | CEO | **Protect template→instance semantics** — Pass-2 code treats `team_members.agent_id` strictly as a *template* reference; no code path treats a member as a runnable instance (code comment + no run wiring). | Auto | P1 |

## NOT auto-decided — surfaced to user (autoplan: User Challenges + premise judgment are never auto-decided)

**UC-A — Cut the manager→subagent hierarchy + Tree view from Pass 2?** All three voices converge that
`parent_member_id` adjacency + the Tree (org-chart) view is the riskiest, most over-built, most
under-specified part — and the north-star's unanswered "surface ownership" question could invalidate
the hierarchy entirely. Cutting it → `team_members(team_id, agent_id, team_role, sort)` flat, **List
view only**; defer hierarchy + Tree to the run/deploy design that actually needs them. This also
deletes findings #1/#3 (cycles), simplifies #2/#5, and drops the whole tree-edge-case surface.
*Cost if wrong:* if the north-star keeps the hierarchy, we re-add `parent_member_id` + Tree later (a
new migration + the Tree component — additive, no rework of what flat Pass 2 builds).

**UC-B — Build Dashboard/Runs before Teams?** CEO voice (backed by APP.md's own note) argues
run-observability is higher value than agent-config polish, and Teams-without-execution is an inert
labeled folder until the deferred design lands. *Cost if wrong:* Teams is designed and ready now;
Dashboard/Runs need their own design pass first, so reordering delays shipping anything from the board.

**Premise note:** the office-hours premises (org-metadata-only, Run undefined, DB source of truth) were
human-locked; CEO's challenge to their *value* is captured in UC-B, not silently overridden.

## Final gate resolution (2026-06-28)
- **UC-A → CUT.** Flat membership + List view only; hierarchy (`parent_member_id`) + Tree deferred to
  the run/deploy design. Consequences for the auto-decided table above: finding **#1 (cycle guard) and
  #3 (subtree cascade) are N/A** (a flat model can't cycle); **#2** keeps only `team_id`/`agent_id`/
  `team_projects` cascades (no `parent_member_id` FK); **#5** response is a flat member list ordered by
  `sort` (no flat→tree assembly); Design **F-4/F-5 tree-edge-cases are N/A**. Findings #4, #6, #7, #8,
  #9, #10, #11, #12, #13 stand.
- **UC-B → PROCEED with Teams now** (then Dashboard/Runs).

**Final gate: APPROVED 2026-06-28** (Pass 2 Teams F4/F5 — flat-membership + List-only scope). Plan
locked; ready for the build routine.
<!-- /autoplan review end (Pass 2 — APPROVED) -->

