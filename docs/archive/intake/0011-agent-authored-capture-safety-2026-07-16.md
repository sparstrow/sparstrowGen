---
id: 0011
category: feature-change
secondary_modes: []
status: captured
project: factory
surface: Curator (docs/workflows/agents/curator.md) + intake format (docs/intake/README.md)
date: 2026-07-16
links: { related: "docs/intake/0010-qa-user-agent-dogfood-and-capture-2026-07-16.md" }
resolution:
---

## What I brought (verbatim)

The capture itself should be like "agent captured." It needs to have the agent name or "agent
being captured by," and when I give my feedback, that's like "me who captured it" or "she or owner
captured." When agent capture happens, we need to make sure that all those details are reviewed
once again by me.

We need to add more instructions on curator: if the file has been captured by an agent, it should
run a review with me. I should tell it what can be removed and what can be needed. Accordingly, it
should remove those from the file and delete that information from the file itself, because that
relevant information or instruction might confuse the coding agent and it might actually implement
it.

Let's just say, if the delete agents feature is being captured by the QA agent and, when I review
with the curator and I say, "No, we don't need this functionality," the curator should remove that
line from it. It should rewrite these functionalities, like "user rejected" or "user said," because
when the coding agent finds it out, it shouldn't implement those. That's my concern on it.

## What the Listener understood

A factory-wide safety mechanism for any capture that was authored by an agent rather than the
owner. Two parts:

1. **Provenance on every intake doc — who captured it.** Record whether a capture was made by an
   agent (with that agent's name / "captured by <agent>") or by the owner. Owner-authored captures
   are the current default; agent-authored ones are the new case this enables.

2. **Agent-captured docs get a mandatory owner review, and the Curator prunes on the owner's call.**
   When a doc was captured by an agent, the Curator must run a review with the owner before it's
   build-ready. The owner goes through it and says what's needed vs. what to drop. The Curator then
   edits the file accordingly: it removes rejected content, or rewrites it explicitly as "user
   rejected" / "user said no." The reason is specific — leftover agent-suggested-but-rejected
   content, if left in the file as-is, could be picked up by a downstream coding agent and actually
   implemented. Worked example: the QA agent captures a "delete agents" feature; the owner reviews
   with the Curator and says "no, we don't need this"; the Curator strips or marks that line so the
   coding agent never builds it.

This isn't specific to the QA agent (0010) — it applies to any agent-authored capture, including
0006's build/verification agent, which also files intake docs for blockers it hits. Note for the
Curator/office-hours pass: this interacts with the existing "verbatim block is sacred — never
rewritten" rule in `docs/intake/README.md`, since here the Curator is explicitly asked to edit
agent-authored content; whether the sacredness rule holds the same for agent-authored vs.
owner-authored captures is a design point to resolve, not one the Listener decides.
