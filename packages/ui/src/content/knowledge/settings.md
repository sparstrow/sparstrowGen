---
title: Settings
section: Surfaces
description: Providers and keys, factory health, GitHub PAT, the code-graph engine, and app configuration.
order: 12
updated: 2026-07-13
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
