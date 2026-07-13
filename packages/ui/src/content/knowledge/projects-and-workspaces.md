---
title: Projects & workspaces
section: Surfaces
description: Bind agents to real folders — three ways to create a project, sandboxes, directives, and the project workspace.
order: 4
updated: 2026-07-13
---

A **project** is a folder on disk that agents work inside. It carries its own memory
scope, standing instructions, git awareness, and (optionally) a sandbox wall.

## Creating a project — three paths

| Path | What it does | Use when |
|---|---|---|
| **From scratch** | Creates a fresh directory | New work |
| **Bind existing** | Points at a folder you already have | Ongoing codebases |
| **Clone** | Clones a git URL locally | Starting from a remote repo |

On creation the factory can **auto-index** the project (a system agent skims the tree
and seeds project memory), so agents aren't starting blind.

## The project workspace (`Projects → open a project`)

- **File tree** — read-only browser of the project's files.
- **Directives** — standing instructions injected into *every* run in this project,
  verbatim and un-trimmed. Perfect for house rules ("always use pnpm", "never touch
  `/legacy`").
- **Git panel** — current branch, recent activity, the project's open PRs, and its
  execution profile (see [Git automation](/knowledge/git-automation)).
- **Code graph** — structural index status + a 3D visualization of the codebase, once
  the engine is installed.
- **Morning briefing** (opt-in) — a daily digest note about what changed in the project.

## Sandboxes

Mark a project as a **sandbox** to put a wall around it:

- Its agents' memory writes are **clamped to the sandbox scope** — they cannot write
  into global or other projects' memory.
- Its notes are excluded from global memory search.
- Sandbox projects are never auto-indexed, and can't be forked into a client variant.

Use a sandbox for anything untrusted or experimental.

## Notes & limitations

- The file tree is read-only in the UI — agents (and you, in
  [Terminals](/knowledge/terminals)) do the writing.
- Deleting a project doesn't delete the folder on disk; the factory never removes your
  files.
