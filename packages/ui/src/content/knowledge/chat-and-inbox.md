---
title: Chat & Inbox
section: Surfaces
description: Free-form sessions with agents, and the message inbox where agents reach you (and each other).
order: 6
updated: 2026-08-22
---

## Chat — talk to your agents

**Chat** is the conversational surface: session-based, markdown-rendered. You can
create a session and it will hold its place in the sidebar, but sending a message
into it requires a paired machine and is not available yet — see Known Limitations
below. A session has a *context* that shapes what the agent sees:

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

- **Sending a chat message requires a paired machine and does not work yet.**
  Creating a session works today; posting into it returns "requires a paired
  machine" until that lands.
- Chat turns are their own history, separate from [Runs](/knowledge/runs-and-transcripts) —
  they don't get a Runs entry, transcript, or cost/provenance tracking the way a
  task run does.
- Chat is one agent per session; to make several agents cooperate, use
  [Pipelines](/knowledge/pipelines) or [Goals](/knowledge/tasks-and-goals).
