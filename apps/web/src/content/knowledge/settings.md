---
title: Settings
section: Surfaces
description: Providers and keys, factory health, snapshots, GitHub PAT, and app configuration.
order: 14
updated: 2026-09-01
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
embedder, GitHub PAT (optional — features degrade without them).
Check it whenever something feels off; it's faster than guessing.

## Machines — moved

Machines are no longer configured here. They have their own destination in the sidebar,
under **Workspace**: [Machines](/knowledge/machines). Pairing, status, rename, revoke,
remove and the per-machine snapshot switch all live there.

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

- **Pairing needs a browser on the machine being paired.** See
  [Machines](/knowledge/machines) for the full note on what that rules out.
- **Revoking a machine is immediate but not retroactive** — it stops the next request,
  it doesn't undo work already done.
- **Snapshot settings are per machine.** Changing them on one computer does not change
  them on another. They are editable from the browser on the
  [Machines](/knowledge/machines) page, one machine at a time — and only while that
  machine is reachable, since the change is
  carried to it rather than stored centrally. The switch shows what the machine last
  confirmed, so it never reports a change that did not land.
- **Snapshots only cover git repositories.** A project folder that isn't a repo has
  nothing to snapshot into, and is skipped silently.
