---
name: worktree-orchestration
description: >-
  Sets up an isolated git worktree for a unit of work in this repo, including
  port isolation for the web (Next.js apps/web) dev server — tracked in a port
  registry with per-branch lock/release status, constrained to a fixed pool
  pre-registered in Supabase's Auth Redirect URLs allow-list — and the
  merge-then-cleanup sequence. Use when starting new work that needs its own
  branch, when a worktree needs a web dev port assigned, or when cleaning up
  after a PR merges.
metadata:
  sparstrowgen-owner: coordinator
---

> **Port allocation is not "pick a number that looks free."** Every worktree's
> web dev-server port is tracked in
> [references/port-registry.md](references/port-registry.md) — read it before
> assigning a port to a new worktree, and update it in the same change. Ports
> come from a **fixed pool pre-registered in Supabase's Auth Redirect URLs
> allow-list** — using a port outside that pool breaks
> email-confirmation/magic-link/reset redirects silently.

# Worktree orchestration

Grounded in this repo's actual mechanics — not the generic worktree-per-task flow
described in `doc/research/Sparstrowgen Agent Definition Library.md`, which this repo
doesn't run. Source of the process rules: `AGENTS.md` §2.

## When to create a worktree

Per `AGENTS.md` §2.1: **every** unit of work gets an isolated branch —
`feature/<task-name>`, `fix/<bug-name>`, or `task/<task-id>`. Never edit files
directly on `development`, `staging`, or `main`.

This repo creates worktrees via the harness's `EnterWorktree` tool, not raw
`git worktree add` — `.claude/worktrees/` currently holds live worktrees created this
way, and `.claude/launch.json` has dev-server presets scoped to specific worktree
paths (see below), which only makes sense if the worktree is a real, harness-tracked
directory. Use `ExitWorktree` to remove one when done — never delete the directory by
hand, that leaves harness registry entries behind.

## Running a dev server inside a worktree

The always-on packaged desktop app (`@sparstrow/core` + `@sparstrow/ui`) owns port
`48750`/`5173` as a **singleton** — there is no per-worktree isolated copy of it.
(There used to be a `dev-preview` mechanism for spinning up an isolated
core/ui instance per worktree; it was removed 2026-08-16 once testing moved to
`apps/web` instead — see git history if that capability is ever needed again.)

What worktrees actually get today is a `web` (Next.js `apps/web`) dev server. Its
port isn't just "must not collide" — it must be one of the ports **pre-registered in
the Supabase project's Auth Redirect URLs allow-list**, or
email-confirmation/magic-link/password-reset links opened from that worktree silently
redirect to the Site URL instead of back to the worktree. Never assign a worktree an
arbitrary free port.

**Before assigning a port to a new worktree**, read and update
[references/port-registry.md](references/port-registry.md) — it's the lock/release
ledger of which port belongs to which branch, and the only source of which ports are
actually allow-listed in Supabase. Full mechanics of adding a new `launch.json`
preset are in [references/port-isolation.md](references/port-isolation.md). Do not
guess a port from either file alone — check the registry first.

## Merge and cleanup (AGENTS.md §2.2, §2.4, §2.5)

1. PRs target `development` only. Never push directly to `staging` or `main`.
2. Run `pnpm typecheck` and `pnpm test` locally before opening the PR.
3. Immediately after opening the PR, run `gh pr merge <pr_number> --auto --squash` so
   it merges as soon as CI passes — don't wait for a manual click.
4. **Before removing the worktree, confirm all three:**
   - `gh pr view <n> --json state,mergedAt,headRefName` reads `MERGED`.
   - The post-merge CI run on `development` is green (GitHub deletes the head branch
     at merge time and does not wait for this run — a gone branch is not evidence the
     merge was healthy).
   - The head branch is actually gone.
5. Then `ExitWorktree`, and:
   ```bash
   git checkout development
   git pull origin development
   git fetch --prune
   ```
6. Release the port: in [references/port-registry.md](references/port-registry.md),
   flip that worktree's row back to `🟢 available` and blank the
   branch/worktree/date columns, and delete its preset from `.claude/launch.json`.
   Do this in the same pass as step 5, not as a separate later chore.

A worktree left behind after its PR merges is a defect — sweep periodically by
comparing live worktrees against merged PRs. The same sweep should compare the port
registry and `launch.json` against `git worktree list`: a row/preset for a worktree
that no longer exists is the same defect, just easier to miss.
