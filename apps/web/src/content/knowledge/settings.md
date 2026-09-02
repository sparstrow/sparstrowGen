---
title: Settings
section: Surfaces
description: Providers and keys, factory health, snapshots, GitHub PAT, and app configuration.
order: 14
updated: 2026-09-02
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
under **Workspace**: [Machines](/knowledge/machines). Connecting, status, rename, disconnect,
remove and the per-machine snapshot switch all live there.

## API Tokens

Under **Personal**. One list of everything that can act as you: what it's called, which
computer it's on, when it was created, and when it was last used. Newest first.

Signing in on a computer creates a token here automatically — you don't normally create
one by hand. The exception is a machine with no browser (a server, a CI runner): create
one, copy it once, and give it to that machine with `sparstrow setup --token=`.

**A token is shown exactly once, at creation.** Nothing can show it again. If you lose it,
revoke it and make another.

**Revoke** stops that credential working on its very next request. Revoked rows stay in
the list rather than disappearing — the record that something *had* access is the most
useful thing on this page when you're working out what happened.

> A token acts as **you**, not as one machine in one workspace. Someone holding it can
> reach every workspace you belong to and queue work on any of your machines. Tokens don't
> expire on their own, which is why the last-used column is here: it's how you spot one
> that's still live and shouldn't be.

## Daemon

Under **Personal**, and only in the desktop app — everything on it describes a process on
*this* computer, so in a plain browser the card says so instead of showing controls that
would do nothing.

- **Auto-start on launch** — start the runtime when the app opens. Turning it off doesn't
  stop the app talking to a runtime you started yourself.
- **Keep running after quit** — on by default. Quitting the app leaves the runtime
  running, so this computer stays reachable whenever it's switched on. Turn it off and
  quitting makes the machine unreachable.

Below the switches is a **diagnostics** block — running state, uptime, process id, machine
id, server URL, and how many workspaces this computer serves. It's the first thing to
check when a machine isn't showing up, and the right thing to paste into a bug report. It
never contains a token.

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

- **Adding a machine other than this one needs a checkout of the repository on it.** See
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
