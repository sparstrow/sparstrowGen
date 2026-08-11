---
title: First-run setup
section: Getting started
description: Connect a provider, arm the factory, and confirm everything is healthy.
order: 2
updated: 2026-08-10
---

Before agents can run, the factory needs at least one working **provider** (the engine
agents run on). Everything below happens in **Settings**.

> **Using the app in a browser?** Then you also need a **paired machine** — agents run
> on your computers, not in the browser. See step 4 below. If you're in the desktop app
> on the machine that does the work, it's already the machine, and you can skip that.

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

## 4. Pair a machine (browser only)

**Settings → Machines** lists the computers this workspace can reach. If it's empty,
nothing can run.

1. Click **Pair a machine** to generate a short code. It expires, so use it promptly.
2. On the computer you want to use, run `sparstrow pair <code>`.
3. It appears in the list and shows **online** while it's running.

The machine reports which providers it actually has installed, so the board knows what
each one can do. Pairing stores a credential that's scoped to that one machine — you can
revoke it from this card at any time, and it stops reaching the workspace immediately.

## Notes & limitations

- The core service on each machine listens on `127.0.0.1:48750` and is not exposed to
  the network. Reaching your workspace from a browser goes through the cloud board
  instead, which is why a machine has to be **paired** (Settings → Machines) rather
  than opened up.
- CLI providers depend on the CLI being logged in *outside* Sparstrowgen; if a CLI run
  fails immediately, check the CLI works in a terminal first.

## Known Limitations & Boundaries

- **A pairing code works once and expires.** If it lapses, generate a fresh one — a
  used code can't be reused on a second machine.
- **A machine shows offline within about 90 seconds of stopping**, because status is
  worked out from its last check-in rather than announced. A machine that crashes is
  indistinguishable from one that was unplugged, which is deliberate.
- **Providers are detected per machine.** A machine without the `claude` CLI installed
  reports it as unavailable no matter what the board shows elsewhere.

Next: [Create your first agent](/knowledge/create-your-first-agent).
