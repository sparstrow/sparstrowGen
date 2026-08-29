---
title: Chat & Inbox
section: Surfaces
description: Free-form sessions with agents, and the message inbox where agents reach you (and each other).
order: 6
updated: 2026-08-29
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

### Sending a file with your message

Use the paperclip in the composer to attach a file or image to a message —
click it to pick one, or drag a file onto the composer. Each attachment shows
as a chip with its name and size, and can be removed before you send. Once
sent, the attachment stays on the message and is still there when you reopen
the conversation later.

The file is delivered to the machine that runs your turn, where the agent can
open it with its own file tools — so "read this and tell me what's wrong with
it" works on the actual file rather than on a description of it. If a file is
too large or of a type that isn't accepted, you're told which, in the
composer, **before** the message is sent.

[Try in App — Start a Chat](/chat)

### Seeing what an agent made

When an agent's reply hands back something it produced, you see it in that
reply, not just a sentence claiming it. An image renders as a picture you can
click to open a larger view; anything else shows as a named row with its kind
and size, with a way to open or save it. If a reply produced nothing, the
reply looks exactly like any other — no empty tray, no placeholder.

Everything a conversation has produced also collects in one place: open the
paperclip icon beside the conversation's title for a list of every file,
newest first, grouped by the message that asked for it. On a wide screen this
sits in the panel beside the conversation; on a narrower one it opens as a
sheet from the same button, so it's reachable from a phone too.

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
- **Attachments are capped at 2 MB each, and limited to images (PNG, JPEG,
  WebP), PDF, plain text, Markdown, CSV, and JSON.** Anything larger or of
  another type is refused in the composer with the reason, before sending.
  The type list is deliberately narrow rather than "any file": each entry is
  one an agent's file tools can actually do something with.
- **What an agent does with an image is limited by the provider.** The
  command-line agents this app runs read files as text; an attached
  screenshot is delivered and readable as a file, but none of the currently
  supported providers has a vision path for interpreting what it depicts.
  Text, code, CSV, JSON and PDF attachments are what this is genuinely for.
- **Deleting a conversation removes its messages and attachments from your
  view, but the stored copies of attached files are not yet purged from
  storage.** They become unreachable through the app; a cleanup pass that
  removes the underlying files is still to come.
- **What an agent hands back is capped at 10 MB per file** — larger than what
  you attach, since a generated image routinely exceeds the composer's 2 MB
  limit. Anything over the cap is refused, and you're told which file and why,
  in the reply itself — never dropped silently.
- **Files an agent creates or edits inside one of your project's own folders
  are not shown here, and no copy of them is kept.** Those files belong to the
  project and are reached through it, not duplicated into the conversation —
  only files an agent hands back explicitly, with nowhere else to live, show
  up in the reply or the panel.
- **Clicking a file in the panel opens it, but does not jump you to the
  message in the transcript that produced it.** The two are separate views
  over the same conversation, not linked navigation yet.
