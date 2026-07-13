---
title: First-run setup
section: Getting started
description: Connect a provider, arm the factory, and confirm everything is healthy.
order: 2
updated: 2026-07-13
---

Before agents can run, the factory needs at least one working **provider** (the engine
agents run on). Everything below happens in **Settings**.

## 1. Pick and connect a provider

Open **Settings → Providers**. Each provider card shows its execution mode and health:

| Provider | Mode | What you need |
|---|---|---|
| Claude Code | CLI | The `claude` CLI installed and logged in on this machine |
| Antigravity | CLI | The `agy` CLI installed and logged in |
| Anthropic API | Direct API | An API key (paste it into the key field) |
| Ollama | Direct API | Ollama running locally — no key at all |

API keys are stored **encrypted, outside the database**, and are never placed in an
agent's environment. Use **Discover models** on a direct-API provider to pull its live
model list (it falls back to a static list if discovery fails).

> **Tip:** Ollama is the fastest way to a first successful run — local, free, key-less.

## 2. Check factory health

The **Factory health** card in Settings answers "is my factory armed?" in one glance:

- **Required:** database, memory vault, at least one healthy provider.
- **Degrades gracefully:** code-graph engine, embedder, GitHub PAT — missing ones turn
  features off rather than breaking runs.

Green across the required row means you're ready to create an agent.

## 3. Optional but recommended

- **GitHub PAT** (Settings → Git): lets agents push branches and open PRs for
  production-app projects. Stored encrypted; only a masked hint is ever shown again.
  See [Git automation](/knowledge/git-automation).
- **Code-graph engine** (Settings → Engine): a one-click install that gives agents
  structural awareness of your codebases. Projects index on demand.

## Notes & limitations

- The core service binds to `127.0.0.1:48750` — local only, by design. There is no
  remote/multi-user access.
- CLI providers depend on the CLI being logged in *outside* Sparstrowgen; if a CLI run
  fails immediately, check the CLI works in a terminal first.

Next: [Create your first agent](/knowledge/create-your-first-agent).
