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

> ## ⚠️ 2026-09-02 — the port registry is being replaced, and the branch model changed
>
> Two things in this skill are now wrong. Read this before following it.
>
> **1. Ports no longer come from a Supabase-constrained pool.** Each worktree
> gets its **own local Supabase** (`supabase start`, Docker) plus its own port
> block, allocated by `scripts/dev-env.sh`. The fixed pool existed only because
> every worktree shared one cloud Supabase project whose Auth Redirect URLs
> allow-list had to name each port in advance. A local stack has its own
> allow-list, so the constraint is gone — and so is the silent-redirect-failure
> mode it protected against.
>
> Until `scripts/dev-env.sh` lands (restructure Phase 0c), keep using
> [references/port-registry.md](references/port-registry.md) as written below.
> After it lands, the registry is retired and this skill should be rewritten
> around `make up`.
>
> **2. There are no band branches.** `AGENTS.md` §2 now reads
> `slice/* → development → main`. Any instruction below about band branches,
> two-tier PRs, or band-freshness merges no longer applies.
>
> Plan: [`doc/plans/2026-09-02-multica-architecture-restructure.md`](../../../doc/plans/2026-09-02-multica-architecture-restructure.md)

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
directly on `development`, `staging`, `main`, or a band branch.

**One worktree per agent, without exception.** Two agents sharing a working
directory — subagents, forked sessions, or two Claude Code windows — is not a
merge conflict to resolve later, it is two processes writing the same files at
once. This applies to forked sessions especially: a fork inherits the
conversation, *not* a worktree, so it must create its own before editing.

### A band gets a branch of its own

Per `AGENTS.md` §2.2, a band with more than one task integrates on
`band/<band-number>-<short-slug>`, cut from `development`. Its tasks branch
**from that band branch**, not from `development`, and their PRs target it.

```
development
   └── band/20-m16-live-channel          ← cut once, at band start
         ├── task/T-M16-01-…             ← the [S] gate; lands FIRST
         ├── task/T-M16-02-…             ┐ cut only AFTER 01 has landed
         └── task/T-M16-03-…             ┘ on the band branch
```

The sequencing matters: a band's `[S]` gating task authors the types its
siblings compile against, so the parallel branches must be cut *after* it
merges into the band branch. Cutting all of them at band start defeats the
whole arrangement.

A single-task band skips this — that task branches from `development` and
targets it directly.

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

## Merge and cleanup (AGENTS.md §2.2, §2.5, §2.6)

**Tier 1 — task → band branch:**

1. Run `pnpm typecheck` and `pnpm test` locally before opening the PR.
2. PR targets the **band branch**, not `development`.
3. Immediately after opening it, run `gh pr merge <pr_number> --auto --squash` so
   it merges as soon as CI passes — don't wait for a manual click.
4. Once `gh pr view <n> --json state,mergedAt` reads `MERGED`, remove that
   task's worktree. The band branch stays.

**Tier 2 — band branch → `development`:**

1. Merge `development` **into** the band branch first, so the PR carries only
   the band's own conflicts (`AGENTS.md` §2.4). Never rebase a band branch —
   it orphans any task branch still cut from it.
2. Push, then run the band's live verification pass against **the band
   branch's own Vercel preview** (`AGENTS.md` §2.3). This is the band's
   verification task doing its job.
3. Open the PR into `development`, `--auto --squash`.
4. The queue flip and any band archiving happen **in this PR** — see
   [`doc/tasks/README.md`](../../../doc/tasks/README.md#who-updates-the-queue-and-when).
5. **Before removing the band worktree, confirm all three:**
   - `gh pr view <n> --json state,mergedAt,headRefName` reads `MERGED`.
   - The post-merge CI run on `development` is green (GitHub deletes the head branch
     at merge time and does not wait for this run — a gone branch is not evidence the
     merge was healthy).
   - The head branch is actually gone.

Never push directly to `staging` or `main` at either tier.
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
