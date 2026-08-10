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
- **Web App**: Next.js 16.3 App Router (`apps/web`) with Turbopack bundler.
- **Router Adapter**: Custom Next.js navigation adapter (`apps/web/src/lib/react-router-mock.tsx`) intercepting TanStack Router calls.
- **UI & Styling**: Tailwind CSS v4, Radix UI primitives, `@sparstrow/ui` Shadcn components, OKLCH design system tokens (`DESIGN.md`).
- **Database & ORM**: Supabase PostgreSQL + Drizzle ORM (`@sparstrow/shared`), Drizzle Kit migrations.
- **Authentication**: `@supabase/ssr` (Passwordless Magic Link, Email & Password, GitHub OAuth, Google OAuth) + Next.js Middleware Session Guard (`apps/web/src/middleware.ts`).
- **Realtime Cloud Sync**: Supabase Realtime Postgres event channel streaming (`apps/web/src/components/providers.tsx`) bridging into live React Query cache invalidation.
- **Vector Search**: Supabase `pgvector` semantic search for memory notes and RAG retrieval.
- **Desktop Shell**: Electron 36 (`@sparstrow/desktop`).
- **Package Manager & Monorepo**: `pnpm` v11.6.0 + Turbo 2.9.18 caching.

### Connected MCP Servers & Skills
- **`shadcn` MCP Server**: UI pattern discovery (`search_items_in_registries`, `view_items_in_registries`, `get_add_command_for_items`, `get_audit_checklist`).
- **`impeccable` Skill**: Production-grade UI design commands (`audit`, `adapt`, `polish`, `craft`, `shape`, `distill`, `harden`).
- **`supabase` MCP Server**: Database schema inspection, migration execution, and Edge Function deployment.
- **Tool Integration MCPs**: `clockify`, `square`, and `blender` MCP servers for agent action execution.

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

---

## 3. Engineering Guidelines & Knowledge Center Rules

1. **Obey Explicit Directives**:
   - Maintain documentation integrity. Do NOT delete comments or docstrings unrelated to your changes.
2. **In-App Knowledge Center Synchronization**:
   - The app features a built-in user Knowledge Center (`src/content/knowledge/*.md`).
   - When adding a new feature or modifying user-facing functionality, agents MUST update or add the matching Knowledge Center markdown article in the **same PR** as the code changes.
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
11. **Shadcn UI & MCP Server Integration (Impeccable Workflow)**:
    - ALL design work and Impeccable commands (`craft`, `shape`, `polish`, `audit`, `bolder`, `quieter`, `distill`, `harden`, etc.) MUST use `@sparstrow/ui` Shadcn UI components and design tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`).
    - ALWAYS leverage the `shadcn` MCP server tools (`search_items_in_registries`, `view_items_in_registries`, `get_add_command_for_items`, `get_audit_checklist`) to discover, inspect, and audit Shadcn UI component patterns.
    - **Mandatory Order of Work Before Writing a Component**:
      1. Read `DESIGN.md` (tokens, motion, component vocabulary) and `PRODUCT.md`'s register.
      2. Invoke the `/shadcn` skill and use the Shadcn UI MCP — `list_components` / `get_component` / `get_component_demo` for primitives, `list_blocks` / `get_block` for composite surfaces. Check for an existing block before composing a page from scratch.
      3. Only then write code.
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
  `packages/core/src/db/schema.ts` (`sqliteTable`). There is no
  `@sparstrow/daemon` package — the daemon is `@sparstrow/core`.
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
  `Deferred.md`, or `Ideas.md` keeps its own lifecycle — completion doesn't
  resolve it. Full protocol: `doc/tasks/README.md`.
* **`doc/OpenQuestions.md`** — decisions waiting on the owner. Every entry needs
  the full options framework from §8 above. When one is answered, record the
  answer where it's consumed and **delete the entry**.
* **`doc/Deferred.md`** — agreed to build, explicitly parked. Each entry records
  what triggers unparking it.
* **`doc/Ideas.md`** — unscoped, no commitment, may never be built.

When the owner says "park it", "later", or "just an idea", write it to the right
file in the same turn rather than relying on the conversation to be re-read.
