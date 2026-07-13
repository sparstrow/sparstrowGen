---
title: Schedule
section: Surfaces
description: Cron jobs for agents and pipelines — recurring work that runs while you sleep.
order: 9
updated: 2026-07-13
---

The **Schedule** page turns any agent or pipeline into recurring work.

## Creating a job

1. **Schedule → New job.**
2. Pick the target — an agent (with a prompt) or a pipeline.
3. Set the cadence (cron expression) and save.

Each job row shows its **next fire time**. Use **Run now** to test a job immediately
without waiting for the clock — it launches exactly what the schedule would.

## Controls

- **Pause a job** — stops that one job; its state is kept.
- **Pause the scheduler** — one master toggle stops *all* scheduled firing (useful
  during maintenance or when you're iterating on prompts and don't want background
  noise).

## Where scheduled work shows up

A fired job creates ordinary runs — they land in
[Runs](/knowledge/runs-and-transcripts) tagged to the job, cost included. If a scheduled
agent blocks on a question, it escalates to the Dashboard attention queue like any other
run — schedules don't bypass the human gate.

The nightly **dream cycle** (memory consolidation) also rides this scheduler — see
[Memory](/knowledge/memory).

## Notes & limitations

- The scheduler runs inside the local core service — **jobs only fire while the app is
  running** on your machine. This is a local-first tool, not a cloud scheduler.
- Missed fire times (machine asleep, app closed) are skipped, not back-filled.
- Team-scoped jobs appear in the team workspace's Schedules tab; global jobs here.
