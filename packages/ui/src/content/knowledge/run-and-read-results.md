---
title: Run it and read the results
section: Getting started
description: Launch your first run, watch the live transcript, and understand everything the run page shows.
order: 4
updated: 2026-07-13
---

With a provider connected and an agent created, you're ready for a first run.

## Launching work

There are several launchpads — they all end in the same place (a **run**):

- **Task Board → New task**: describe the work, assign your agent. The task spawns a run.
- **Chat**: talk to an agent directly in a session — good for exploratory work.
- **Pipelines / Schedule**: automation surfaces that launch runs for you (later tutorials).

For a first test, create a small task — e.g. *"List the three riskiest files in project X
and say why"* — and assign it to your new agent.

## Reading a run

Open **Runs** and click your run. The run page is the factory's flight recorder:

```
Run detail
├─ Live transcript        what the agent said & did, streamed as it happens
├─ Tool calls             every tool invocation and its result
├─ Effective tools line   the exact tool policy this run was allowed (frozen at spawn)
├─ Memory injected        which vault notes the agent was shown, and why
├─ Cost & duration        tokens, price, wall-clock
└─ Re-run                 same input, fresh run
```

Two provenance details worth knowing from day one:

- **Effective tools** are *snapshotted at spawn* — editing the agent mid-run never
  changes a running run's permissions.
- The **memory panel** shows exactly what knowledge the agent saw. If an answer
  surprises you, this is the first place to look.

## When an agent gets stuck

Agents don't spin forever — a blocked agent **escalates**: the run pauses and a question
lands in the Dashboard **attention queue** with an answer box. Reply, and the run wakes
up and continues with your answer. This is the human-in-the-loop pattern you'll see all
over the factory.

## Notes & limitations

- Runs from **untrusted contexts** (sandboxed projects, delegated subtasks, runs that
  fetched external web content) are badged **untrusted** — their memory writes are
  quarantined for your review. See [Memory](/knowledge/memory).
- A run's transcript is stored locally and permanently; nothing is sent anywhere except
  to the provider you chose.

You now know the core loop. Explore the **Surfaces** section for each screen in depth,
starting with the [Dashboard](/knowledge/dashboard).
