---
name: design-system-conformance
description: >-
  Turns a spec/plan section into a design spec that conforms to whatever
  DESIGN.md currently says — tokens, component states, responsive behavior —
  without inventing new visual vocabulary. Use before building any new or
  non-trivial screen.
metadata:
  sparstrowgen-owner: ui-ux-designer
---

# Design-system conformance

This is not a general design-principles skill — it's the procedure for staying
inside **this project's own design doctrine** rather than drifting toward
generic AI-slop patterns or a plausible-but-off aesthetic.

## Read DESIGN.md first — it is the doctrine, this file is only the procedure

**This skill deliberately does not restate what the design system says.** It
used to, and that was a real defect: the doctrine was duplicated here, so
changing `DESIGN.md` left this skill still enforcing the old rules, silently
overriding the new doc for every agent that loaded it. A conformance checker
that hardcodes what it checks against can never be re-pointed.

So: **load `DESIGN.md` in the same turn as this skill, and check against what it
actually says today.** If you are working from a memory of the rules rather than
the current file, stop and read it.

**If `DESIGN.md` does not exist**, that is a stop, not a gap to fill — and in
this project it does not exist right now. Do not design against general design
knowledge or against what the existing code happens to do; say the doctrine is
missing and that the `design-brief` skill needs to run first.

## Checklist before handing off a design spec

The items below are doctrine-independent — they hold whatever `DESIGN.md` says.
Anything about specific colours, shadows, densities, or banned patterns comes
from `DESIGN.md` itself, not from here.

- [ ] Every colour, radius, shadow, and spacing value referenced is a named
      token from `DESIGN.md` — never a raw hex, never a framework colour class
      the doctrine doesn't sanction.
- [ ] Every rule in `DESIGN.md`'s Named Rules and Do/Don't sections is
      satisfied. Read them now rather than recalling them — they change.
- [ ] Icon usage follows `DESIGN.md`'s Iconography section: the sanctioned set,
      size, and weight, and the semantic map for which icon means what. If the
      doctrine has no icon rule, that is a gap to raise, not a licence to
      improvise.
- [ ] Motion follows `DESIGN.md`'s Motion section, including its
      `prefers-reduced-motion` behaviour.
- [ ] Every component named actually exists in the project's UI package or the
      chosen library — verify via the library's registry/MCP tools rather than
      assuming from memory. If none fits, say so explicitly instead of quietly
      proposing a new primitive.
- [ ] All four states specified: Populated, Empty (real copy — what to do next,
      plus the action that does it), Loading (skeleton shaped like the real
      content), Error (what failed, plain words, next action).
- [ ] Responsive behavior stated, not implied — name the breakpoints that
      matter for this screen, don't just describe desktop.
- [ ] Interactive elements have a stated focus-visible treatment.

## Format the handoff as

1. **Composition** — which components, in what layout (reference an existing
   page's shape where one is close, rather than describing layout from
   scratch).
2. **States** — the four, per the checklist above.
3. **Copy** — anything user-facing that isn't obvious from the composition
   (empty-state text, error text, confirmation text).
4. **Interaction/motion** — what moves, per `DESIGN.md`'s Motion section.

Hand this to `frontend-builder` (or the requester, if this agent ran
standalone) as text — never as code. Building it is a different agent's job.

## When the screen needs something the doctrine lacks

Raise it as a `DESIGN.md` change needing sign-off — never as a quiet exception
on one screen. A one-off exception is invisible to every other agent and becomes
an inconsistency nobody can trace later.
