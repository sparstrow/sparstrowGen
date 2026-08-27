---
title: Providers & execution modes
section: Concepts
description: CLI vs direct-API execution — what's different, what's identical, and how to choose.
order: 1
updated: 2026-08-27
---

Every agent names a **provider**, and the provider determines its **execution mode**.
You never pick a mode directly — it's derived, so it can't drift.

## The two modes

| | CLI | Direct API |
|---|---|---|
| Examples | Claude Code, Antigravity (`agy`) | Anthropic API, Ollama |
| How it runs | Spawns the CLI as a child process | The core calls the model API in a loop |
| Auth | The CLI's own login | API key from the encrypted store (Ollama: none) |
| Tools | The CLI's own tool suite | The factory's built-in capability registry |
| Feel | Full coding-agent experience | Lighter, faster to start, fully local option |

**What's identical in both modes** — and this is the point: memory injection,
directives, tool-permission clamping, run transcripts, cost tracking, provenance,
cancellation. A run reads the same in [Runs](/knowledge/runs-and-transcripts) no matter
which engine produced it.

**A CLI provider can also be reached directly, outside of any run.** From
[Terminals](/knowledge/terminals), *Agent terminal* drops you straight into that CLI's
own interactive session on the machine — `claude` or `agy` talking back to you live,
not a run with a transcript. Direct-API providers have no CLI to open this way, so only
CLI-kind agents are offered there.

## Choosing

- **Claude Code** — the workhorse for real coding tasks in projects.
- **Antigravity** — an alternative CLI engine; useful for a second opinion or different
  strengths.
- **Anthropic API** — direct model access without a CLI; good for chat-style agents,
  reviewers, writers.
- **Ollama** — local models, zero cost, zero keys, works offline. The best "try things"
  provider — and the only one with no external dependency at all.

Mix freely: a pipeline can have a Claude Code step followed by an Ollama step.

## Cloud sign-in and live sync

The web app authenticates against Supabase and keeps its views fresh from the cloud
database:

- **Sign-in**: protected routes require a verified session. You can sign in with
  **email and password**, or have a **one-time sign-in link emailed** to you — useful
  when you'd rather not type a password. GitHub and Google buttons appear on the login
  page but are **currently switched off**; they need OAuth apps registered under the
  owner's accounts, and they light up on their own once that's done.
- **Live updates**: the browser subscribes to changes in the cloud database and
  refreshes the affected views automatically — runs, tasks, task questions, goals,
  plan nodes, messages, chat sessions and messages, machines, project links, and memory
  contradictions. You don't need to reload a page to see an agent's progress.
- **Live run transcripts have their own channel, separate from that feed** — a private
  Realtime broadcast per run, not the database change feed (which would have spent its
  whole message budget on a single run's ~23 events and delivered each one twice).
  Events genuinely arrive while the run is still going, confirmed against a real
  deployment: polling a run mid-execution shows new events appearing one at a time, not
  all at once when it finishes. **How rich the drawing is depends on the provider** —
  Claude Code renders full turn-by-turn bubbles; Antigravity renders narration and
  tool-call notices at a coarser grain. Both render live; neither reads as idle while
  the run is actually progressing.

> Memory search is **not** a cloud vector search. Every machine embeds locally with a
> bundled model and searches its own index, which is why semantic search stays fast and
> works offline — and why the cloud stores note *text* but no embeddings at all.
> See [Memory](/knowledge/memory).

## Notes & limitations

- Direct-API agents use the factory's tool registry — a smaller, curated set compared
  to a full CLI agent. Heavy file-editing work is still CLI territory.
- Model lists for direct providers come from **Discover models** in Settings and can go
  stale; re-discover after provider-side releases.
- CLI providers require their CLI logged-in and working outside the app; the factory
  supervises the process but can't fix its auth.

## Known Limitations & Boundaries

- **GitHub and Google sign-in are switched off.** The buttons render disabled with an
  explanation. Email and password, or an emailed sign-in link, both work today.
- **Sign-in emails are rate-limited** — roughly a handful per hour on the current
  plan. If you hit `Email rate limit exceeded` while testing sign-up or sign-in links,
  wait a few minutes; signing in with a password is unaffected.
- **Live transcript streaming works over its own channel** (see above), confirmed
  against a real deployment. Whether the events render depends on the provider that
  produced the run — check [Runs](/knowledge/runs-and-transcripts) if a run's page
  looks idle while you know it's still running.
- **Auth, connection, and Realtime quotas are set by the hosting plan**, not by
  Sparstrowgen, and change when the plan does. Check the Supabase dashboard for the
  current numbers rather than trusting a figure written here.
- **Password-breach checking is unavailable on the current plan.** Passwords are not
  screened against known-leaked lists, so choose one you don't reuse — or use the
  emailed sign-in link and skip passwords entirely.

