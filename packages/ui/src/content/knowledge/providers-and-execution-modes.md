---
title: Providers & execution modes
section: Concepts
description: CLI vs direct-API execution — what's different, what's identical, and how to choose.
order: 1
updated: 2026-07-13
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

## Choosing

- **Claude Code** — the workhorse for real coding tasks in projects.
- **Antigravity** — an alternative CLI engine; useful for a second opinion or different
  strengths.
- **Anthropic API** — direct model access without a CLI; good for chat-style agents,
  reviewers, writers.
- **Ollama** — local models, zero cost, zero keys, works offline. The best "try things"
  provider — and the only one with no external dependency at all.

Mix freely: a pipeline can have a Claude Code step followed by an Ollama step.

## Notes & limitations

- Direct-API agents use the factory's tool registry — a smaller, curated set compared
  to a full CLI agent. Heavy file-editing work is still CLI territory.
- Model lists for direct providers come from **Discover models** in Settings and can go
  stale; re-discover after provider-side releases.
- CLI providers require their CLI logged-in and working outside the app; the factory
  supervises the process but can't fix its auth.
