---
title: First-run setup
section: Getting started
description: Connect a provider, arm the factory, and confirm everything is healthy.
order: 2
updated: 2026-09-02
---

**A new account lands on a Setup guide, not an empty dashboard.** It walks your profile,
your workspace's name, and getting a machine connected — three steps, in order, with the
one still open always shown. Nothing in it is a gate: skip ahead, come back later, or do
a step from somewhere else in the app (adding a computer from **Machines**, say) and the guide
reflects it. Find it any time from the dashboard's setup card, or at **/setup**.

This article covers what that guide does not: connecting a **provider** (the engine
agents run on) and confirming the factory is healthy. Everything below happens in
**Settings**.

> **Using the app in a browser?** Then you also need a **connected machine** — agents run
> on your computers, not in the browser. The Setup guide's third step covers this, or see
> step 4 below. If you're in the desktop app on the machine that does the work, it's
> already the machine, and you can skip that.

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
- **Degrades gracefully:** embedder, GitHub PAT — missing ones turn features off rather
  than breaking runs.

Green across the required row means you're ready to create an agent.

## 3. Optional but recommended

- **GitHub PAT** (Settings → Git): lets agents push branches and open PRs for
  production-app projects. Stored encrypted; only a masked hint is ever shown again.
  See [Git automation](/knowledge/git-automation).

## 4. Connect a machine

Also the Setup guide's third step — do it there or here, they read the same list.
**Machines** — in the sidebar, under Workspace — lists your computers. If it's empty,
nothing can run.

**In the desktop app there is nothing to do.** Signing in connects the computer you're on
automatically; it appears within a few seconds, badged *This device*.

To add a *different* machine — a server, a dev box — use **Add a computer** on that page.
It shows two commands to run over there and detects the machine when it comes online. That
computer needs a checkout of this repository for now, since the `sparstrow` CLI isn't
published yet. A machine with no browser at all uses a token from
**Settings → API Tokens** instead.

Each machine reports which providers it actually has installed, so the board knows what it
can do. Connecting stores a credential on that computer that acts as **you** — it reaches
every workspace you belong to, and you can revoke it at any time from
**Settings → API Tokens**. Full details: [Machines](/knowledge/machines).

## Notes & limitations

- The core service on each machine listens on `127.0.0.1:48750` and is not exposed to
  the network. Reaching your workspace from a browser goes through the cloud board
  instead, which is why a machine **connects outward** to the board rather than being
  opened up to the network.
- CLI providers depend on the CLI being logged in *outside* Sparstrowgen; if a CLI run
  fails immediately, check the CLI works in a terminal first.

## Known Limitations & Boundaries

- **The `sparstrow` CLI is not installable yet.** Connecting a machine *other than the
  one running the desktop app* needs a checkout of this repository on it.
- **A connection attempt expires after 5 minutes.** If it lapses before you confirm, run
  `sparstrow setup` again.
- **A machine's credential acts as you**, across every workspace you belong to — not just
  the one you were looking at. Review what has access under **Settings → API Tokens**.
- **A machine shows offline within about 90 seconds of stopping**, because status is
  worked out from its last check-in rather than announced. A machine that crashes is
  indistinguishable from one that was unplugged, which is deliberate.
- **Providers are detected per machine.** A machine without the `claude` CLI installed
  reports it as unavailable no matter what the board shows elsewhere.
- **A provider reading as available means the CLI is installed, not that it's
  currently authenticated.** A run dispatched to a machine whose CLI login has
  expired still starts, then fails after a few minutes of retries with a clear
  auth error rather than failing instantly — if a run seems to hang before
  failing, re-run `claude auth status` (or the equivalent for your provider)
  on that machine.

Next: [Create your first agent](/knowledge/create-your-first-agent).
