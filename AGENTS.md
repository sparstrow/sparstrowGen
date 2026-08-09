# AGENTS.md — AI Coding Agent Guidelines & Repository Standard

Welcome agent! This file defines the mandatory workflow, safety rules, and engineering standards for all AI coding agents working on **Sparstrowgen**.

---

## 1. Monorepo Architecture Overview

Sparstrowgen is a multi-node, cloud-synced agent platform built 100% in **TypeScript**:

```
.
├── apps/web/           # Next.js 15 App Router Web App (Deployed on Vercel)
├── packages/
│   ├── daemon/         # @sparstrow/daemon (Headless Node.js Agent Execution Engine)
│   ├── desktop/        # @sparstrow/desktop (Electron 36 Desktop Shell App)
│   └── shared/         # @sparstrow/shared (Shared Zod schemas, types, Drizzle models)
└── scripts/            # Build and development scripts
```

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

---

## 4. Environment & Database Configuration

* **PostgreSQL & Supabase**: Database schemas live in `@sparstrow/shared` and `@sparstrow/daemon` using **Drizzle ORM** (`pgTable`).
* **Vector Search**: Use Supabase `pgvector` for memory notes and RAG context injection.
* **Environment Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public anon key.
  - `SUPABASE_SERVICE_ROLE_KEY`: Daemon server key for administrative Postgres access.
