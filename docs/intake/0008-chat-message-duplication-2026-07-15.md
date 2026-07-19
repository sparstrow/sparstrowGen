---
id: 0008
category: feedback
secondary_modes: []
status: captured
project: factory
surface: Chat / Free chat (cross-surface — also observed in Claude Code)
date: 2026-07-15
screenshots: [assets/0008-chat-message-duplication.png]
links: { related: "docs/intake/0009-agy-canned-reply-ignores-input-2026-07-15.md" }
resolution:
---

## What I brought (verbatim)

I just asked one question, "How's life?" and it duplicated my chat twice: "How's life? How's
life?" I think that is also happening in Claude code as well. It's not agent-specific; it's an
interface or backend problem. That's one.

Screenshot shows: sending a single message in the "How is life" chat (Free chat, provider
`antigravity`, model Gemini 3.1 Pro (High)) results in two separate right-aligned "How is life"
message bubbles appearing in the transcript, with a response still pending (loading dots) below
them.

## What the Listener understood

Sending one message in Sparstrowgen's Chat → Free chat surface causes it to appear twice as
separate sent bubbles before any reply streams in. The user believes this is not
provider/agent-specific — they've also seen the same duplication behavior in Claude Code — so
they read it as an interface- or backend-level bug (something in how a sent message gets
recorded/rendered), not something particular to the antigravity/agy integration specifically.

Related: filed alongside 0009 (a separate, provider-specific bug seen in the same session) —
these were split into two docs per the user's own framing ("that's one" / "the second thing").
