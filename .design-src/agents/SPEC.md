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

