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
