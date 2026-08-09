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
   - Do NOT proceed with building any feature, writing code, or modifying any file when you have open questions towards the user that remain unanswered.
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

---

## 4. Environment & Database Configuration

* **PostgreSQL & Supabase**: Database schemas live in `@sparstrow/shared` and `@sparstrow/daemon` using **Drizzle ORM** (`pgTable`).
* **Vector Search**: Use Supabase `pgvector` for memory notes and RAG context injection.
* **Environment Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public anon key.
  - `SUPABASE_SERVICE_ROLE_KEY`: Daemon server key for administrative Postgres access.
