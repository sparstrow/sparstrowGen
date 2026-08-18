# AGENTS.md — AI Coding Agent Guidelines & Repository Standard

Welcome agent! This file defines the mandatory workflow, safety rules, and engineering standards for all AI coding agents working on **Sparstrowgen**.

---

## 1. Monorepo Architecture & Locked Stack

**Sparstrowgen** is an autonomous AI agent platform and developer control plane built 100% in **TypeScript** for orchestrating multi-node agent runtimes, task pipelines, GOAP goal planning, and `pgvector` RAG memory.

### Workspace Directory Layout
```
.
├── apps/web/           # Next.js 16.3 App Router Web App (Deployed on Vercel)
├── packages/
│   ├── core/           # @sparstrow/core (GOAP Engine, Agent Swarms, Runner, RAG Memory)
│   ├── daemon/         # @sparstrow/daemon (Headless Node.js Agent Execution Engine)
│   ├── desktop/        # @sparstrow/desktop (Electron 36 Desktop Shell App)
│   ├── shared/         # @sparstrow/shared (Zod schemas, types, Drizzle ORM models)
│   └── ui/             # @sparstrow/ui (Shadcn UI component library & Knowledge Center)
└── scripts/            # Monorepo build and development scripts
```

### Locked Technology Stack

**`.sparstrowgen/blueprint.yaml` is the single source of truth for the stack,
commands, and MCP server roster — read it, don't restate its facts here.** It's
loaded every session same as this file, so duplicating its content in prose here
would just be two places to keep in sync instead of one. When the stack changes,
update the blueprint; only touch this section for the wiring detail below, which the
blueprint deliberately doesn't carry (file paths, provider specifics — not "what tech
are we on").

- **Router Adapter**: Custom Next.js navigation adapter (`apps/web/src/lib/react-router-mock.tsx`) intercepting TanStack Router calls.
- **Design doctrine**: `DESIGN.md` — written 2026-08-18 with the owner via the `design-brief` skill, replacing generic tool output nobody had chosen. Read it before any UI work. It defines a **theming contract** (user-selectable brand accent + surface character, with contrast floors) rather than a fixed palette, so never hardcode a colour.
- **Authentication**: `@supabase/ssr` (Passwordless Magic Link, Email & Password, GitHub OAuth, Google OAuth) + Next.js Middleware Session Guard (`apps/web/src/middleware.ts`).
- **Realtime Cloud Sync**: Supabase Realtime Postgres event channel streaming (`apps/web/src/components/providers.tsx`) bridging into live React Query cache invalidation.

Vector search specifics (local vs. cloud) are covered in §4, not repeated here.

### Connected MCP Servers & Skills

The server roster is `blueprint.yaml`'s `mcp_servers` list, configured in
`.mcp.json` — update both together when a server is added or removed. What follows
is operational detail neither of those files carries (why each is there, auth
posture, what pairs with what):

- **`supabase`**: schema inspection, migration execution, Edge Function deployment.
- **`context7`**: up-to-date library/framework documentation lookup — prefer this
  over training-data knowledge or web search for API syntax and version-specific
  docs.
- **`shadcn`**: UI pattern discovery (`search_items_in_registries`,
  `view_items_in_registries`, `get_add_command_for_items`, `get_audit_checklist`).
  Paired with the vendored `shadcn` skill (`.claude/skills/shadcn/`) for the
  procedural half of the Shadcn workflow — see §3.11.
- **`github`**: PR/issue management and repo search against this project's
  GitHub remote. OAuth on first connect (run `/mcp` to authorize), same pattern
  as `supabase` — no token ever belongs in `.mcp.json` or an agent's hands.
- **`playwright`**: browser automation, backing the end-to-end visual/runtime
  testing loop mandated in §3.10.

**`impeccable` Skill**: Production-grade UI design commands (`audit`, `adapt`,
`polish`, `craft`, `shape`, `distill`, `harden`). Personal/user-level, not declared
in this repo. Any other MCP tool or skill an agent sees available (e.g. `clockify`,
`square`) comes from that agent's personal/user-level config the same way — don't
assume it's present for another agent or machine unless it's in `.mcp.json` or
`.claude/skills/`.

---

## 2. Mandatory Git & Branch Workflow

We enforce a strict 3-tier Git & deployment pipeline:

```
[Agent Worktree: feature/*] ──► PR into (Squash) ──► [development branch]
                                                         │ (Milestone complete)
                                                         ▼
[main branch (Production)] ◄── PR into ◄── [staging branch (User Review Gate)]
```

### Critical Branch Rules
1. **Isolated Worktrees ONLY**:
   - You MUST create an isolated Git branch/worktree for your task: `feature/<task-name>`, `fix/<bug-name>`, or `task/<task-id>`.
   - **NEVER** edit files directly on `development`, `staging`, or `main`.
2. **PR Target & Merge Strategy**:
   - All agent pull requests MUST target `development`.
   - PRs into `development` use **Squash and Merge** to maintain a clean history.
   - **NEVER** push directly to `staging` or `main`.
3. **Verification Before PR**:
   - You MUST run and pass all typechecks and unit tests locally before submitting a PR:
     ```bash
     pnpm typecheck
     pnpm test
     ```
4. **Worktree & Branch Cleanup Post-Merge**:
   - Once a PR is merged into `development` (and GitHub auto-deletes the remote feature branch), agents MUST prune and clean up local worktrees and branches:
     ```bash
     git checkout development
     git pull origin development
     git worktree remove <worktree-path> || git branch -d <feature-branch>
     git fetch --prune
     ```
5. **Auto-Enqueuing PR Merges**:
   - Immediately upon opening a PR, agents MUST execute `gh pr merge <pr_number> --auto --squash` so that GitHub automatically queues and merges the PR as soon as CI passes, without requiring manual button clicks in the GitHub UI.
6. **Commit Without Asking**:
   - Once edits for a coherent unit of work are complete (a fix, a doc update, a task's checklist items), commit them on the current feature/worktree branch **without waiting for the user to say "commit this"** — this file is the standing, advance authorization for that.
   - Commit at the end of a logical change, not after every individual file edit: an in-progress multi-file change lands as one commit (or a few coherent ones) once it's actually done, not a commit per file touched or per half-finished edit.
   - This does not relax rule 3 (verification before PR) and does not change anything about opening or pushing PRs — those still follow rules 1, 2, and 5 above exactly as written. It only covers local commits to the agent's own branch.

---

## 3. Engineering Guidelines & Knowledge Center Rules

1. **Obey Explicit Directives**:
   - Maintain documentation integrity. Do NOT delete comments or docstrings unrelated to your changes.
2. **In-App Knowledge Center Synchronization**:
   - The app features a built-in user Knowledge Center (`packages/ui/src/content/knowledge/*.md`). It is **user-facing product surface**, not internal notes — treat a wrong article as a user-visible defect, because that is what it is.
   - When adding a new feature or modifying user-facing functionality, agents MUST update or add the matching Knowledge Center markdown article in the **same PR** as the code changes.
   - **Also check the articles you did NOT touch.** This is the rule that actually gets missed. A feature can make a page false without going near it — M1–M3 shipped accounts, sign-in, and machine pairing while `what-is-sparstrowgen.md`, `first-run-setup.md`, and `limitations.md` all still told users "one user, one machine, no accounts, no remote access". Four pages carry **global claims** and must be re-read whenever the product's shape changes:
     - `what-is-sparstrowgen.md` — the mental model and architecture diagram
     - `first-run-setup.md` — what a new user is told the app is
     - `limitations.md` — the honest list of what it deliberately does not do
     - `providers-and-execution-modes.md` — auth, sync, and provider reality
   - **Never document what is not built or not enabled.** A deferred or disabled feature is described as unavailable, or not at all. Documenting an intended state as a current one is worse than silence: it sends users to a button that fails. Check `doc/Deferred.md` and `doc/KnownGaps.md` before writing a capability sentence.
   - **Drift runs in both directions.** Understating (the app can do more than the page says) frustrates; **overstating is the dangerous one** — a page once claimed `pgvector` HNSW semantic search over `memory_notes`, a column that had been deliberately removed. Verify a capability in the code or schema before describing it, exactly as rule 3 requires for code.
   - Bump each edited article's `updated:` frontmatter date when its content meaningfully changes; that date is shown to users as a freshness signal, so leaving it stale is its own small lie.
   - **Standard Section Requirement:** Every Knowledge Center article MUST include a dedicated `## Known Limitations & Boundaries` section explicitly stating performance limits, resource boundaries, and operational constraints.
3. **Never Guess Code Logic or File Paths**:
   - Inspect authoritative files using code search or `view_file` before writing code.
4. **Inspect Error Logs Before Diagnosing**:
   - Always read full, un-truncated error stack traces before proposing fixes. Base diagnoses strictly on log evidence.
5. **No Superficial Symptom Patches**:
   - Do NOT mask errors by returning dummy fallbacks, catching and swallowing exceptions silently, or commenting out failing tests. Fix the underlying root cause.
6. **Never Declare Success Without Running Verification**:
   - You MUST execute test commands (`pnpm typecheck`, `pnpm test`, or specific test files) to prove your code works before claiming task completion.
7. **Human-in-the-Loop (HITL) Gates**:
   - Destructive operations (dropping database tables, deleting protected files, releasing to production) REQUIRE explicit user confirmation.
8. **Open Question Protocol & Options Framework**:
   - Do NOT build the specific thing an unanswered question is about. An open question blocks **only the subtask that depends on it** — never the whole task, and never the whole plan.
   - Park the blocked subtask in `doc/OpenQuestions.md`, mark that one checklist item `[~] blocked → OQ-n` in its task file, and **complete every other item in the task**. One piece missing must not stop the plate being served.
   - A task is "done except OQ-n" — a real, reportable state. Report it that way rather than leaving the whole task open.
   - When the question is answered, unblock that item, finish it, and delete the entry from `OpenQuestions.md`.
   - When presenting open questions to the user, always structure each question with full context, a simple user-side scenario, and concrete options.
   - For every option presented, provide:
     - Pros and Cons
     - Score out of 10
     - Blast radius if chosen wrong
     - Overall caveats
     - Agent's overall recommendation
9. **Micro-Level & Complete Feature Delivery (No Over-Engineering)**:
   - Build features at a **micro-level**: complete the full long-term design (backend, frontend, UI/UX, and data layer) of one feature cleanly before moving to the next.
   - Avoid over-engineering or unnecessary abstractions. Choose minimal, effective implementations that solve the requirement.
   - If feature B depends on feature A, build feature A completely first (exposing the minimal clean interface required), then build feature B completely.
10. **End-to-End Visual & Runtime App Testing (Automated Browser Agent Loop)**:
    - At the end of ANY feature implementation or bug fix, a browser agent MUST be automatically invoked to launch/open the app, interact with the UI, and perform end-to-end testing and usability testing.
    - The browser agent MUST report back with detailed feedback, console errors, and usability issues found.
    - The main agent MUST then verify and fix any reported issues.
    - Upon applying fixes, the browser agent MUST be invoked again to re-verify. This loop MUST continue until all issues are resolved and the goal is complete before claiming task completion.
    - **This is what the `frontend-verify` skill (`.claude/skills/frontend-verify/`) implements.** It is the concrete, repeatable form of this rule — invoke it rather than improvising the loop, and always after the `interactive-prototype` or `design-system` skills produce something.
11. **Shadcn UI & MCP Server Integration (Impeccable Workflow)**:
    - ALL design work and Impeccable commands (`craft`, `shape`, `polish`, `audit`, `bolder`, `quieter`, `distill`, `harden`, etc.) MUST use `@sparstrow/ui` Shadcn UI components and design tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`).
    - ALWAYS leverage the `shadcn` MCP server tools (`search_items_in_registries`, `view_items_in_registries`, `get_add_command_for_items`, `get_audit_checklist`) to discover, inspect, and audit Shadcn UI component patterns.
    - **Mandatory Order of Work Before Writing a Component**:
      1. Read `DESIGN.md` in full — especially §6 Iconography and §7 Motion, whose absence is what made the app read as plain — plus `PRODUCT.md`'s register. Verify new UI in **both modes and at least the Paper and Mono surfaces**; Mono is the honest worst case.
      2. Invoke the `/shadcn` skill and use the Shadcn UI MCP — `list_components` / `get_component` / `get_component_demo` for primitives, `list_blocks` / `get_block` for composite surfaces. Check for an existing block before composing a page from scratch.
      3. Only then write code.
13. **The Design Skill Chain (order matters)**:
    - `design-brief` → `design-system` → `interactive-prototype` → `frontend-component-build` → `frontend-verify`.
    - `design-brief` writes the doctrine by interviewing the owner with rendered options. Everything downstream is accountable to it, so nothing downstream may run before it exists.
    - **Never restate the doctrine's rules inside another skill, agent, or checklist.** Point at it. A duplicated doctrine keeps enforcing itself after the original changes — this happened in `design-system-conformance` and silently overrode the design system for every agent that loaded it.
    - **Record why a design changed, not just what changed.** When the owner asks for a different style, a tighter layout, or something added on top, that request has a reason behind it, and the reason is worth more than the change: it usually generalises into a rule that stops the same debate recurring on every subsequent page. `design-system/DECISIONS.md` is where it goes — see the `design-system` skill.
12. **Mandatory Supabase & Postgres Skills**:
    - Load the `supabase` skill for ANY task touching Supabase — schema changes, Auth, Realtime, Storage, Edge Functions, RLS, the CLI/MCP, or client-library (`supabase-js`, `@supabase/ssr`) integration.
    - Load the `supabase-postgres-best-practices` skill **before** writing or changing anything that lives in Postgres, running anywhere: tables/columns, migrations, RLS policies (and their tests), indexes, triggers, functions, `pg_cron`/`pgmq`, `pgvector`, or restoring/importing data. Load it too when diagnosing slow queries, timeouts, locking, or rows visible to the wrong tenant.
    - Load both together for anything Supabase-and-schema at once (e.g. an RLS-bearing migration) — one covers the platform, the other covers the SQL.
    - Load BEFORE writing the SQL or the migration, not after. M1 found three real defects this way — per-row RLS function calls, `SECURITY DEFINER` helpers reachable as public RPC endpoints, and 25 unindexed foreign keys — that a plausible-looking migration would otherwise have shipped uncaught to staging.
    - This is not satisfied by general Postgres knowledge or by a past session's memory of the rules. Invoke the skill in the turn where the work happens.

---

## 4. Environment & Database Configuration

> Before changing anything below, load the `supabase` and
> `supabase-postgres-best-practices` skills — mandatory per §3.12, not optional
> for "simple" changes.

* **Two databases, two owners.** The cloud control plane (identity, machines,
  board, runs, transcripts, chat) is Postgres/Supabase, schema in
  `packages/shared/src/db/schema.ts` (`pgTable`). Each daemon's execution store
  and derived memory index is local SQLite, schema in
  `packages/core/src/db/schema.ts` (`sqliteTable`). **Splitting a standalone
  `@sparstrow/daemon` package out of `@sparstrow/core` is a planned goal, not yet
  built** — until that split happens, the daemon's code lives in and runs as
  `@sparstrow/core`. Don't create a `packages/daemon/` directory speculatively;
  the split should be its own deliberate piece of work.
* **RLS is the security boundary, not an add-on.** Dispatch is cloud-canonical,
  so a task row targeting a runtime causes a process to spawn on someone's
  machine. Any new table needs a workspace-scoped policy. Post-migration SQL
  lives in `packages/shared/drizzle/policies/`; see its README before touching
  policies.
* **Never query the control plane with the `postgres` role from application
  code.** It owns the tables and bypasses RLS. Server-side reads and writes go
  through supabase-js with the caller's session.
* **Vector Search is LOCAL, not cloud.** Memory embeddings are 384-dim
  (`EMBEDDING_DIM` in `packages/shared/src/constants.ts`) computed by the
  bundled FastEmbed model and stored in each daemon's `sqlite-vec` index. Cloud
  `memory_notes` deliberately has **no vector column** — only note content syncs,
  because retrieval sits in the hot path of every run and must not become a
  network call. Do not add pgvector to the control plane without reopening that
  decision.
* **Environment Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public anon key.
  - `SUPABASE_SERVICE_ROLE_KEY`: Administrative Postgres access. Server-side
    only; never ship it to a client or a daemon.
  - `DATABASE_URL`: Direct Postgres connection, for migrations only.

---

## 5. Documentation & Decision Records (`doc/`)

All non-code project memory lives in `doc/`. Read `doc/README.md` first.

**Every file type below has a skeleton in `doc/templates/`** — specs, plans,
phase specs, tasks, verification tasks, bugs, security reports, runbooks, and
entries for all four registers. Copy the matching one instead of inventing a
shape: they encode the required sections (a task's checklist, a gap's "clears
when", a deferral's unpark trigger) that make "done" mean the same thing every
time it's written. `doc/templates/README.md` maps situation → template →
destination.

### The lifecycle starts at a spec, not a plan

**This app is UX-first.** It is mostly backend, and backend-heavy projects fail
in one specific way: every layer gets built, each passes its tests, and the
thing the owner wanted to *use* never quite arrives. The spec is the
counterweight.

```
idea → spec → owner review → plan → tasks → code
```

* **`doc/specs/`** — what the owner wants, **in the owner's terms**. User
  stories prioritized P1/P2/P3, acceptance scenarios as Given/When/Then, and an
  Interface & experience section covering all four states. **No technology in a
  spec** — no table names, endpoints, component names, or framework. If a
  sentence couldn't be read aloud to someone who has never seen the codebase,
  it belongs in the plan.
* **Every user story is independently demoable.** Build only that story and the
  owner still has something they can open and use. A story that delivers
  nothing alone is a technical step wearing a story's clothes — it belongs in
  the plan's foundational work.
* **The owner reviews the spec before planning starts.** Cheapest point to
  catch a wrong direction; a wrong spec propagates silently into the plan, the
  tasks, and everything downstream.
* **Internal work skips the spec.** Anything that only changes how the repo is
  built, checked, documented, or governed goes straight to a plan whose `Spec`
  row reads `n/a (internal)`. When it's genuinely unclear, ask.
* **The plan splits the spec into foundational and per-story work**, using one
  test: *can the owner see the result?* Yes → it belongs to a story. No → it is
  foundational, and it blocks the story work behind it. Foundational phases get
  ordinary technical tasks; story phases get tasks grouped so the phase ends in
  something demoable, and are graded on the spec's acceptance scenarios rather
  than a list of components built. Full rules: `doc/tasks/README.md`.
* **Every task carries a `Serves` row** naming its user story or the story
  phase it unblocks. A task that can name neither is a task nobody asked for.

* **`doc/plans/`** — approved plans. The what and why. Uncertainty is allowed here.
* **`doc/tasks/`** — executable specs derived from an approved plan, one folder
  per phase, plus `MasterTaskQueue.md` holding the global run order.
  **A task document contains zero open questions: every decision it needs is
  already made and written down.** If converting a plan into tasks surfaces a
  question, it goes to `OpenQuestions.md` and blocks only the checklist item that
  depends on it — the rest of the task still gets built and ticked off.
* **Every task carries a checklist, an id, and a concurrency tag** (`[S]`
  sequential, `[P]` parallel, `[C]` concurrent — defined in
  `doc/tasks/MasterTaskQueue.md`). Tick items as they land; the queue is the
  single source of truth for what runs next and what may run alongside it.
* **When a new plan adds tasks**, re-run the queue: insert the new tasks,
  re-evaluate dependencies against anything still open, and reorder. The queue is
  regenerated, not appended to.
* **When a phase's tasks are fully completed**, nothing is deleted or archived —
  `doc/plans/` and `doc/tasks/` are an append-only record. Mark the phase
  `README.md`, the queue rows, and the status table done in place; update the
  plan header's `Status` line to the next phase or, if that was the last one, to
  `✅ Completed`. Anything the phase spawned into `OpenQuestions.md`,
  `Deferred.md`, `KnownGaps.md`, or `Ideas.md` keeps its own lifecycle —
  completion doesn't resolve it. Full protocol: `doc/tasks/README.md`.
* **`doc/OpenQuestions.md`** — decisions waiting on the owner. Every entry needs
  the full options framework from §8 above. When one is answered, record the
  answer where it's consumed and **delete the entry**.
* **`doc/Deferred.md`** — agreed to build, explicitly parked. Each entry records
  what triggers unparking it.
* **`doc/KnownGaps.md`** — **built, but not proved**, plus limitations accepted
  knowingly. **Read it before relying on something, and before claiming it
  works.** An entry is a statement about the strength of the evidence, not a bug
  report. Each records what would break if the assumption is wrong and the
  concrete thing that closes it; when you close one, **delete the entry** and say
  where the proof lives.
* **`doc/Ideas.md`** — unscoped, no commitment, may never be built.
* **`doc/bug/`** — owner-reported or agent-found wrong behavior in the running
  app. One file per bug (`BUG-<date>-<slug>.md`), never deleted, just marked
  resolved in place. Format and index: `doc/bug/README.md`.
* **`doc/security/`** — vulnerabilities and trust-boundary issues: auth bypass,
  injection, leaked secrets, data crossing users/workspaces, RLS gaps. One file
  per issue (`SEC-<date>-<slug>.md`), never a live secret or replayable exploit
  payload inside it. Format and index: `doc/security/README.md`.

**Always document a bug or security issue in the same turn it surfaces** —
whether the owner reports it directly, or an agent notices it while
implementing, reviewing, or verifying unrelated work. Do not wait to be asked,
and do not rely on chat history being re-read later; a problem mentioned only
in a chat message does not exist to the next session. Once a bug/security file
is well enough understood to fix, open a task in `doc/tasks/` (or add to an
existing phase) and link it back to the bug/security file's id — the report
stays as the historical record, the task is what gets executed.

When the owner says "park it", "later", or "just an idea", write it to the right
file in the same turn rather than relying on the conversation to be re-read.

**Shipping without proof is allowed; shipping without saying so is not.**
Verification sometimes can't be completed — the platform won't deliver the
signal, the surface that exercises the code doesn't exist yet, the harness can't
reach it. That's a normal outcome and not a reason to hold a change back. It *is*
a reason to write it down: name what you actually ran in the task's Result
section, and open a `KnownGaps.md` entry **in the same change**. Never tick a box
on weaker evidence than it asked for and stay silent about it — a ticked box that
quietly means "looked right to me" devalues every other ticked box in the repo,
and the next agent has no way to tell which is which. Caveats raised only in chat
do not exist.
