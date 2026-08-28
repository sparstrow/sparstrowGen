---
title: Chat & Inbox
section: Surfaces
description: Free-form sessions with agents, and the message inbox where agents reach you (and each other).
order: 6
updated: 2026-08-28
---

## Chat — talk to your agents

**Chat** is the conversational surface: session-based, markdown-rendered. Create a
session, send a message, and the agent's reply appears in the session as it's
produced — in complete steps rather than one long wait followed by a wall of text.
Sending needs a paired machine that's currently online; see Known Limitations below
for what happens otherwise. A session has a *context* that shapes what the agent sees:

- **Free** — just you and the agent.
- **Project** — the session runs inside a project: its directives, memory scope, and
  files apply.
- **Agent** — pick which agent persona you're talking to, using that agent's own
  provider, model, and configured behavior.

Sessions persist — close the app, come back, continue the thread, and a reply that
was still being produced when you left will have kept going in the background.
Only one reply is generated at a time per session — send another message once the
current one finishes. Use chat for exploratory work ("look at this and tell me what
you think") where a formal task would be overkill; you can always graduate an
outcome into a task later.

Didn't like a reply, or it failed? **Retry** re-asks without retyping —
picking a different model first, if you want the second attempt to use one.
The original reply stays in the conversation; retry adds a new one rather
than replacing it.

A new session names itself from your first message once it's sent, so the
session list stops filling up with identical "New conversation" rows. From a
session's own menu (the rail row, or the conversation header) you can
**rename** it at any time, or choose to remove it — **Archive** takes it out
of your active list without deleting anything, and **Delete** permanently
removes the conversation and its message history, which can't be undone.

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

- **Sending needs at least one paired machine that's currently online, and —
  for a Project session — that machine needs the project checked out
  locally.** With none paired, all paired machines offline, or the right
  project unavailable anywhere online, you're told plainly which of the
  three it is and pointed at pairing rather than left with a dead end.
- **An unanswered message waits up to 24 hours**, then is marked as having
  taken too long rather than left waiting silently forever; retry is offered
  — see above.
- **Only one reply at a time, per session.** Sending while a reply is already
  in progress is refused — wait for it to finish, or use retry once it has.
- **A reply reflects the provider's own message-by-message output, not a
  word-by-word stream.** A short answer with no tool calls typically arrives
  as one block; a longer answer that involves several steps grows visibly as
  each one completes.
- Chat turns are their own history, separate from [Runs](/knowledge/runs-and-transcripts) —
  they don't get a Runs entry, transcript, or cost/provenance tracking the way a
  task run does.
- Chat is one agent per session; to make several agents cooperate, use
  [Pipelines](/knowledge/pipelines) or [Goals](/knowledge/tasks-and-goals).
- **No unarchive control exists yet.** Archiving a session removes it from
  the active list; bringing it back currently needs the "Archived" filter to
  find it, not a dedicated restore action.
