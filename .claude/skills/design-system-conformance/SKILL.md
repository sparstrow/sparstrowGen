---
name: design-system-conformance
description: >-
  Turns a spec/plan section into a design spec that conforms to Sparstrowgen's
  existing DESIGN.md system — tokens, component states, responsive behavior —
  without inventing new visual vocabulary. Use before building any new or
  non-trivial screen.
metadata:
  sparstrowgen-owner: ui-ux-designer
---

# Design-system conformance

This is not a general design-principles skill — it's a checklist for staying
inside `DESIGN.md`, Sparstrowgen's one design system, rather than drifting
toward generic AI-slop patterns or a plausible-but-off aesthetic.

## The system in one paragraph

"The Developer Control Plane": quiet, hyper-focused, high information
density, keyboard-first. OKLCH semantic tokens only
(`bg-background`/`bg-card`/`border-border`/`text-foreground`/
`text-muted-foreground`) — never a hardcoded Tailwind color. Flat-by-default:
depth comes from 1px border contrast and background-lightness steps
(`bg-background` → `bg-card` → `bg-accent`), not drop shadows, except the one
named exception (`Subtle Layer Drop` on floating popovers/dropdowns/command
palettes). The One Accent Rule: accent color on ≤10% of any screen. The
Line-Length Rule: body text and message content capped at 65–75ch.

## Checklist before handing off a design spec

- [ ] Every color referenced is one of `DESIGN.md`'s named tokens — no hex,
      no Tailwind slate/cyan/etc.
- [ ] No drop shadow anywhere except a floating popover/dropdown/command
      palette (the one named exception).
- [ ] No colored side-stripe (`border-left-4`) used as a decorative accent.
- [ ] No gradient text, no `backdrop-blur` glassmorphism.
- [ ] No hero-metric template (big number + small label) for an ordinary
      dashboard stat — `DESIGN.md` calls this out by name as a Don't.
- [ ] Every `@sparstrow/ui` component named actually exists — check via the
      `shadcn` MCP (`search_items_in_registries`, `view_items_in_registries`)
      rather than assuming from memory; if none fits, say so explicitly
      instead of quietly proposing a new primitive.
- [ ] All four states specified: Populated, Empty (real copy — what to do
      next, plus the action that does it), Loading (skeleton shaped like the
      real content), Error (what failed, plain words, next action).
- [ ] Responsive behavior stated, not implied — name the breakpoints that
      matter for this screen, don't just describe desktop.
- [ ] Interactive elements have a stated focus-visible treatment
      (`DESIGN.md` requires visible keyboard focus on everything
      interactive).

## Format the handoff as

1. **Composition** — which `@sparstrow/ui` components, in what layout
   (reference an existing page's shape where one is close, rather than
   describing layout from scratch).
2. **States** — the four, per the checklist above.
3. **Copy** — anything user-facing that isn't obvious from the composition
   (empty-state text, error text, confirmation text).
4. **Interaction/motion** — only where it matters; most surfaces need none
   beyond the standard hover/focus transitions `DESIGN.md` already defines.

Hand this to `frontend-builder` (or the requester, if this agent ran
standalone) as text — never as code. Building it is a different agent's job.
