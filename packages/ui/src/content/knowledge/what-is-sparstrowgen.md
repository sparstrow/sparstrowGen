---
title: What is Sparstrowgen?
section: Getting started
description: The mental model — an agent factory where the board is in the cloud and the work runs on your machines.
order: 1
updated: 2026-08-20
---

Sparstrowgen is your **agent factory**: an app for creating, organizing, and running AI
agents that do real work — writing code, researching, maintaining projects, running
scheduled jobs — while you stay in control of every important decision.

**Agents always run on a machine you own.** What lives in the cloud is the *board* —
your workspace, agents, tasks, and history — so you can open it from a laptop or a
phone and see what's happening. Nothing runs in the cloud, and your code never leaves
the machine it's on.

```
┌── the cloud ──────────────────┐      ┌── your machine(s) ─────────────────┐
│                               │      │                                     │
│  Your workspace and the board │      │  Core service                       │
│  · agents, tasks, goals       │◀────▶│  · spawns and supervises agent runs │
│  · runs and their history     │      │  · your project files, never synced │
│  · memory note text           │      │  · local search index and memory    │
│  · which machines are paired  │      │                                     │
│                               │      │  Agents run through providers you   │
│  Sign in from any browser to  │      │  configure:                         │
│  watch and steer.             │      │  · CLI models (Claude Code,         │
│                               │      │    Antigravity)                     │
│                               │      │  · Direct APIs (Anthropic API,      │
│                               │      │    Ollama — local and key-less)     │
└───────────────────────────────┘      └─────────────────────────────────────┘
```

You **pair** a machine once, from **Machines** in the sidebar, and it reads as active
whenever it's running. A machine that's switched off simply has no agents available on
it; the board is still there.

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
- **Machines** are the computers you've paired. Agents run on these, not in the browser,
  so a machine has to be switched on for work to happen there.

## Where you stay in the loop

The factory is built around **human gates**. Agents can propose, draft, and build — but
merges to protected branches, delegation approvals, quarantined imports, and anything that
needs your judgment lands in the **attention queue** on the Dashboard and waits for you.

## Known Limitations & Boundaries

- **Work happens only on a paired, running machine.** With none online, you can still
  read and plan on the board, but nothing executes.
- **Your project files never sync.** They stay on the machine they're on — which is the
  point. If you queue work for a machine that doesn't have the project, the task waits
  and offers you a way through: run it where the project already is, point Sparstrowgen
  at a copy on that machine, or clone it there from the project's git remote.
- **One workspace per person, for now.** There's no workspace switcher yet.

## Where to go next

1. **Setup** (linked from the dashboard, or **/setup**) — a fresh account lands here: your
   profile, your workspace's name, and pairing your first machine, in order.
2. [First-run setup](/knowledge/first-run-setup) — connect a provider and check factory health.
3. [Create your first agent](/knowledge/create-your-first-agent).
4. [Run it and read the results](/knowledge/run-and-read-results).
