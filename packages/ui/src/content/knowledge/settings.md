---
title: Settings
section: Surfaces
description: Providers and keys, factory health, paired machines, snapshots, GitHub PAT, the code-graph engine, and app configuration.
order: 13
updated: 2026-08-10
---

Settings is the factory's engine room. The cards that matter:

## Providers

Connect and health-check every execution engine — CLI providers (Claude Code,
Antigravity) and direct-API providers (Anthropic API, Ollama). Paste API keys here;
use **Discover models** to refresh a provider's model list. Details:
[Providers & execution modes](/knowledge/providers-and-execution-modes).

Keys are stored encrypted in a machine-local secret store **outside** the database, and
are never exposed to agents — only a masked hint is ever displayed again.

## Factory health

The "am I armed?" self-check: database, memory vault, providers (required) plus
code-graph engine, embedder, GitHub PAT (optional — features degrade without them).
Check it whenever something feels off; it's faster than guessing.

## Machines

The computers running Sparstrowgen that this workspace can reach. **Agents run on
these, not in the browser** — an empty list means nothing can execute.

**Pair a machine** generates a short, single-use code; run `sparstrow pair <code>` on
that computer and it appears here. Each machine reports which providers it actually has
installed, so the board knows what it can be asked to do. A machine shows **online**
while it's running and drops to offline roughly 90 seconds after it stops.

**Revoke** cuts a machine off immediately — it stops reaching the workspace on its very
next request. Use it for a computer you no longer control; pair again to restore it.

## Work-in-progress snapshots

When a run finishes, the files the agent left uncommitted are backed up on that machine
so a crash, a cancel, or the next run can't lose them. It's **on by default**.

The backup is a git object under `refs/sparstrow/wip/<run-id>` — deliberately **not** a
branch. Your current branch, your staged changes, and `git status` are all untouched,
nothing is ever pushed, and anything matched by `.gitignore` is left out. To get work
back:

```
git for-each-ref refs/sparstrow/wip/          # list snapshots
git show --stat refs/sparstrow/wip/<run-id>   # see what one contains
git restore --source=refs/sparstrow/wip/<run-id> -- <path>
```

**Snapshots kept per project** sets how many are retained before the oldest are
deleted; keeping them forever would stop git from ever reclaiming the space.

This card appears in the **desktop app**, not the browser — the setting belongs to one
machine's disk, and machines can legitimately be configured differently.

## Git — GitHub PAT

Store a Personal Access Token to let the factory push branches and open PRs on your
behalf for production-app projects. Same encrypted treatment as API keys. The rules
that govern what agents may do with it live in
[Git automation](/knowledge/git-automation).

## Code-graph engine

One-click install of the structural code-index engine (verified download, pinned
checksum). Once installed, projects can be indexed — giving agents real code-structure
awareness and enabling the project workspace's graph panel. If the engine misbehaves,
this card is where you retry or see why it's off.

## App configuration

Concurrency (how many runs at once), data paths, theme, and the local API token.
Toggles for optional behaviors — e.g. the team Manager Agent and per-agent signal
extraction — also live here.

## Notes & limitations

- Secrets (keys, PAT) can be replaced or deleted but never re-read in full — if you
  lose one, issue a new one at its source.
- Concurrency always reserves a slot for foreground work, so background swarms can't
  starve your interactive runs.

## Known Limitations & Boundaries

- **Pairing codes are single-use and expire.** A code that has been redeemed won't work
  on a second machine; generate another.
- **Revoking a machine is immediate but not retroactive** — it stops the next request,
  it doesn't undo work already done.
- **Snapshot settings are per machine.** Changing them on one computer does not change
  them on another, and they aren't editable from the browser.
- **Snapshots only cover git repositories.** A project folder that isn't a repo has
  nothing to snapshot into, and is skipped silently.
