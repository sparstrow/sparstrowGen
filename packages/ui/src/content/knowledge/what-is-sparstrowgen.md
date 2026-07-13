---
title: What is Sparstrowgen?
section: Getting started
description: The mental model — a local-first agent factory that builds and runs AI workers for you.
order: 1
updated: 2026-07-13
---

Sparstrowgen is your **agent factory**: a local, single-user app for creating, organizing,
and running AI agents that do real work — writing code, researching, maintaining projects,
running scheduled jobs — while you stay in control of every important decision.

Everything runs on your machine:

```
┌─────────────────────────── your machine ───────────────────────────┐
│                                                                     │
│   This UI  ◀───────▶  Core service (127.0.0.1:48750)                │
│   (what you're        · spawns and supervises agent runs            │
│    reading now)       · stores everything in a local SQLite DB      │
│                       · manages memory, tasks, pipelines, cron      │
│                                                                     │
│   Agents run through providers you configure:                       │
│   · CLI models (Claude Code, Antigravity)                           │
│   · Direct APIs (Anthropic API, Ollama — local and key-less)        │
└─────────────────────────────────────────────────────────────────────┘
```

## The core ideas

- **Agents** are configured workers: a system prompt, a model/provider, a set of allowed
  tools, and optional skills. You create them once and reuse them everywhere.
- **Projects** are folders on disk that agents work inside — with their own memory scope,
  directives, and git awareness.
- **Tasks** are units of work you (or other agents) assign. An assigned task spawns a run;
  blocked agents escalate questions back to you.
- **Runs** are the audit trail: every agent execution, its full transcript, tool calls,
  what memory it saw, and what it cost.
- **Memory** is a markdown vault the agents read and write, scoped so the right knowledge
  reaches the right agent — searchable by meaning, not just keywords.
- **Pipelines, Schedules, and Goals** turn single runs into automation: multi-step chains,
  cron jobs, and LLM-planned task graphs.

## Where you stay in the loop

The factory is built around **human gates**. Agents can propose, draft, and build — but
merges to protected branches, delegation approvals, quarantined imports, and anything that
needs your judgment lands in the **attention queue** on the Dashboard and waits for you.

## Where to go next

1. [First-run setup](/knowledge/first-run-setup) — connect a provider and check factory health.
2. [Create your first agent](/knowledge/create-your-first-agent).
3. [Run it and read the results](/knowledge/run-and-read-results).
