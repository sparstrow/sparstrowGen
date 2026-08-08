---
id: 0009
category: feedback
secondary_modes: []
status: done
project: factory
surface: Chat / Free chat — antigravity provider (agy CLI, Gemini 3.1 Pro (High))
date: 2026-07-15
screenshots: [assets/0009-agy-canned-reply.png]
links: { related: "docs/intake/0008-chat-message-duplication-2026-07-15.md" }
resolution: shipped — `--print` now carries the prompt as its value; agy has no stdin path (packages/core/src/providers/antigravity.ts)
---

## What I brought (verbatim)

In these past agent projects, when I chat with the Anti-gravity CLI, it is not working properly.
When I send a message, "Hey, tell me my name," it is like, "Hey, this is the Anti-gravity coding
agent. What would you like me to do?" I said, "Hi Anti-gravity, how are you doing?" It again
didn't get my message. It was like, "Hey, I am the Anti-gravity agent. How are you doing?"

**Follow-up, with screenshot evidence (2026-07-15):** Now I asked, "Do you know what day it is
today?" and it came back again saying, "How can I help you today?" It doesn't read through my
text, or it doesn't have any memory, or it is chatting every time again. That's a real problem.

Screenshot shows: in the "How is life" chat (Free chat, provider `antigravity`, model Gemini 3.1
Pro (High)), the assistant reply "How can I help you today?" appears identically after the
duplicated "How is life" messages, and again after a separate message reading "Hi agy, do you
know what day it is today?" — the same generic reply both times, unrelated to what was actually
typed.

**Also asked:** I want you to check other models like Ollama or anything — will they also do the
same thing? (Noted as part of this capture; not investigated as part of capture itself — that's
for whoever picks this up next.)

## What the Listener understood

The `antigravity` provider (agy CLI, tested here via the Gemini 3.1 Pro (High) model) returns a
generic, unvarying reply ("How can I help you today?" / "I am the Antigravity agent, how are you
doing?") regardless of the actual message sent — confirmed reproducible at least twice in the
same chat session with two different real questions, both returning boilerplate that ignores the
input entirely. Looks like the model isn't receiving the user's actual text, and there's no
apparent memory across turns in the same chat. The user also wants to know whether this is
specific to the antigravity/Gemini combination or affects other providers (e.g. Ollama) too.

Related: filed alongside 0008 (a separate, cross-surface duplication bug seen in the same
session) — split into two docs per the user's own framing ("that's one" / "the second thing").
