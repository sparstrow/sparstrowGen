---
title: Runs & transcripts
section: Surfaces
description: The factory's flight recorder — history, live transcripts, cost, and full provenance for every run.
order: 7
updated: 2026-08-22
---

Every agent execution — from a task, a chat reply, a pipeline step, a cron job, a goal
node — is a **run**. The Runs page is the history; the run page is the flight recorder.

## The Runs list

Filter by agent, project, status, or outcome. Each row shows duration, cost, and how the
run ended. This is where you notice patterns: an agent that's always expensive, a
project whose runs keep failing, a cron job that quietly stopped succeeding.

## Inside a run

- **Transcript** — the full conversation, streamed live while running: every assistant
  turn, every tool call and its result. Fenced code renders highlighted with one-click
  copy. Confirmed against a real deployment — new content appears while the run is
  still going. Depth varies by provider: some newer providers stream their events on
  schedule but the page doesn't draw them into readable turns yet, which shows as an
  empty-looking transcript on an otherwise-healthy run — check the run's final Result
  text if the transcript itself looks stuck.
- **Effective tools** — the *exact* tool policy the run was allowed, frozen at spawn.
  Even if the agent is edited mid-run, this run's powers don't change.
- **Injected memory** — the precise set of vault notes the agent was shown, post-budget.
  If an agent "knew" something surprising, the answer is here.
- **Untrusted badge** — set when the run was sandboxed, delegated, or touched external
  content (web fetches, foreign tools). Untrusted runs' memory writes go to quarantine
  instead of straight into the vault.
- **Cost** — token usage priced per the provider's table, plus wall-clock duration.
- **Re-run** — launch the same input as a fresh run (fresh context; runs never resume a
  stale context).

## Notes & limitations

- Cancelling a run stops it cleanly (CLI runs kill the child process; direct-API runs
  abort the loop) — partial transcript is kept.
- Cost is computed from provider price tables — for new or local models (e.g. Ollama)
  it may read zero; treat it as an estimate, not accounting.
