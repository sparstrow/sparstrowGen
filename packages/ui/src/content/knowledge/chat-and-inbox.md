---
title: Chat & Inbox
section: Surfaces
description: Free-form sessions with agents, and the message inbox where agents reach you (and each other).
order: 6
updated: 2026-07-13
---

## Chat — talk to your agents

**Chat** is the conversational surface: session-based, streaming, markdown-rendered.
A session has a *context* that shapes what the agent sees:

- **Free** — just you and the agent.
- **Project** — the session runs inside a project: its directives, memory scope, and
  files apply.
- **Agent** — pick which agent persona you're talking to.

Sessions persist — close the app, come back, continue the thread. Use chat for
exploratory work ("look at this and tell me what you think") where a formal task would
be overkill; you can always graduate an outcome into a task later.

[Try in App — Start a Chat](/chat)

## Inbox — messages that wait for you

The **Inbox** collects asynchronous messages:

- **Agent → you** — reports, notices, briefings (e.g. the opt-in morning project
  briefing lands here).
- **Agent → agent** — visible so cross-agent coordination is auditable, not hidden.

Reply to a message to continue that thread, or route it onward. Unlike the Dashboard
attention queue, nothing here blocks a run — the inbox is *informational*; the
attention queue is *decisional*. If it must be answered for work to continue, it will
be on the Dashboard, not just here.

## Known Limitations & Boundaries

- Chat sessions use the same run machinery as everything else — each reply is a run
  you'll find in [Runs](/knowledge/runs-and-transcripts), with the same cost and
  provenance tracking.
- Chat is one agent per session; to make several agents cooperate, use
  [Pipelines](/knowledge/pipelines) or [Goals](/knowledge/tasks-and-goals).
