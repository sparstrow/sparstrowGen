---
title: Projects & workspaces
section: Surfaces
description: Bind agents to real folders — three ways to create a project, sandboxes, directives, and the project workspace.
order: 4
updated: 2026-08-08
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

### Choosing the folder

Every path needs a **root directory** — an absolute path like `C:\Projects\my-app`. You
never have to type it. **Browse…** beside the field opens a folder picker, and what you
get depends on where you're running:

- **In the desktop app** — the real Windows folder dialog, with the drive list, Quick
  Access, your pinned folders, and Explorer's own **New folder** button.
- **In a browser** — an in-app folder browser. It opens at your home folder, steps in
  and out of folders, and jumps to the drive list in one click. **New folder** appears
  for *From scratch* and *Clone* — the two paths whose target folder isn't supposed to
  exist yet — and is deliberately absent for *Bind existing*, which needs a folder that
  already exists.

The text field stays editable either way: the picker fills it in, and you can still
type or paste a path — which is how you reach a hidden folder or a network share, since
the browser lists neither.

The picker only chooses a path. The rules about that path are unchanged and still
enforced when you press **Create project**: *From scratch* and *Clone* need a target
that's missing or empty, and *Bind existing* needs one that's already there.

> The in-app browser reads the filesystem of **the machine the factory is running on**,
> and it exists only on a local install. It is never exposed by a hosted deployment.

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
- The in-app folder browser lists folders only, hides hidden folders, and shows the
  first 500 entries of a folder (it tells you when it has truncated). Type the path if
  what you want isn't listed.
- Forking a **client variant** still needs its target path typed by hand; the picker
  isn't wired into that form yet.
- Deleting a project doesn't delete the folder on disk; the factory never removes your
  files.
