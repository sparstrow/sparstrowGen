---
id: 0010
category: new-concept
secondary_modes: []
status: captured
project: factory
surface: Agents / new QA-user agent + skill (dogfoods the whole app)
date: 2026-07-16
links: { related: "docs/intake/0011-agent-authored-capture-safety-2026-07-16.md" }
resolution:
---

## What I brought (verbatim)

Currently I'm running the app, and I'm finding a lot of feedback and a lot of changes. Most of
the application doesn't have the CRUD operations. We can create most of the features, like agents
and projects, but we can't really delete them. There is a lot of feedback that needs to be
captured, which my original expectation is not fully covering.

I was wondering if there is already an agent team or verification team, or at least a user team
that goes in and uses the app, finds the missing features, and adds an intake doc on it. I'm not
sure. I think this is a new concept.

**On what the QA agent documents:** The QA agent should document the missing features or additions
that it finds out about — anything that it finds meaningful and that should be needed, removed, or
updated.

**On how it's triggered:** For now, it will be like a slash command or a skill file which we can
ask the agent to start up and run on it. In the future, I will set up some scheduled tasks and
routines for it to follow or to run and check the app.

**On how it behaves — a curious user that knows what it's doing:** For now, it should be like a
curious user. It needs to click on everything and note what's missing — even user interface, not
just CRUD actions. Also user interface, user designs: how it is made and how it can be useful for
users if some of the design features can be added in that phase, like navigation and everything.

It should be like a curious user, but it should know what it's doing. If it's trying to create an
agent and test out each of the ways it can create an agent and how it is being tied around the app
navigation, it needs to know the process. It doesn't click the Create Agent button, and then a
pop-up shows up, that's fine, and then it closes it and moves on to pipeline test. It should, when
it is trying to test something, test end-to-end on that feature itself.

## What the Listener understood

A new agent (invoked now via a slash command / skill; later via scheduled routines) that dogfoods
the running Sparstrowgen app like a curious-but-knowledgeable user: it explores every surface,
tests each feature end-to-end (e.g. every way to create an agent and how it ties into navigation,
not a shallow click-and-move-on), and files an intake doc for anything meaningful it finds missing,
worth removing, or worth updating. Its scope is not only CRUD gaps (the immediate example: you can
create agents/projects but can't delete them) but also UI/UX/design — how the design is built and
which design/navigation additions would be useful to users. It feeds the factory's own intake pool.

Its captures are agent-authored, so they must go through the mandatory owner-review-and-prune
mechanism captured separately in [0011](0011-agent-authored-capture-safety-2026-07-16.md) before
they're build-ready. This concept is a companion to the 0006 build/verification agent: 0006 *builds*
the gym app (finding build-blockers), this one *uses* the app (finding usability/feature/design
gaps) — two lenses on the same product. Overlap with 0006's blocker-reporting is for the Curator
to sort.
