---
name: worktree-orchestration
description: >-
  Sets up an isolated git worktree for a unit of work in this repo, including
  port/data-dir isolation for running a dev server alongside the always-on
  packaged app, and the merge-then-cleanup sequence. Use when starting new work
  that needs its own branch, when a dev/preview server must run inside a
  worktree without colliding with the main app on port 48750, or when cleaning
  up after a PR merges.
metadata:
  sparstrowgen-owner: coordinator
---

# Worktree orchestration

Grounded in this repo's actual mechanics — not the generic spec-kit/worktree-per-task
flow described in `doc/research/Sparstrowgen Agent Definition Library.md`, which this
repo doesn't run. Source of the process rules: `AGENTS.md` §2.

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

## Running a dev/preview server inside a worktree

The always-on packaged app owns port `48750` and its default data directory. A dev or
preview server — including one running inside a worktree — must never collide with
that. The isolation mechanism already exists in this repo:
[scripts/dev-preview.mjs](../../../scripts/dev-preview.mjs) sets `SPARSTROW_PORT` and
`SPARSTROW_DATA_DIR` before spawning `core` or `ui`, and
[.claude/launch.json](../../launch.json) has per-worktree presets that pin a unique
port and a worktree-local data directory.

Full pattern, including how to add a new preset for a new worktree, is in
[references/port-isolation.md](references/port-isolation.md). Read it before starting
a dev server for parallel work — do not guess a port.

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

A worktree left behind after its PR merges is a defect — sweep periodically by
comparing live worktrees against merged PRs.
