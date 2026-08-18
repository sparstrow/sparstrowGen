# DESIGN.md — retired, pending regeneration

> **This project has no active design doctrine right now. Do not design or build
> UI against this file.**

The previous contents of this file were **retired on 2026-08-17** by the owner's
decision. They were generic output from a general-purpose design tool, not a
doctrine anyone chose for this product — and because agents follow a doctrine
faithfully whether or not anyone agreed to it, that generic direction was being
executed correctly across every screen and producing an app the owner did not
want.

The specific symptom that surfaced it: the Machines prototype came out flat and
lifeless. The cause was not the prototype. It was this file's line 93, which
instructed every agent to prefer typography "rather than decorative icons," plus
a One Accent Rule capping accent colour at 10% of any screen. Both were obeyed
exactly. Neither was ever chosen.

The old contents remain in git history if any of it is worth recovering.

## What happens next

1. Run the **`design-brief`** skill (`.claude/skills/design-brief/`). It
   interviews the owner — showing rendered options rather than asking abstract
   questions — and writes a real, project-specific doctrine in this file's
   place.
2. Run **`design-system`** to turn that doctrine into a browsable system and
   `index.html`.
3. Prototypes (`interactive-prototype`) and production UI
   (`frontend-component-build`) come after, never before.

## If you are an agent and you landed here

You were sent here by `AGENTS.md`, an agent definition, or another skill,
expecting design rules. There aren't any yet — and that is a deliberate state,
not a missing file.

**Do not invent them, and do not fall back on general design knowledge.** An
invented rule becomes the de-facto standard by the third screen that copies it,
which is precisely how this file's retired contents came to govern the app.

Say the doctrine is being regenerated, and that UI work should wait for
`design-brief` to run — or ask the owner whether to run it now.

## Known consequences of this gap

- `design-system/` was built in mirror mode partly against the retired doctrine.
  Its `tokens/typography.css` and `tokens/spacing.css` carry values sourced from
  the old prose, and `guidelines/` cards cite it. These need revisiting once the
  new doctrine lands — see `design-system/CHANGELOG.md`.
- `design-system/tokens/spacing.css` declares `--transition-base: 140ms ease`,
  which **does not exist in the real stylesheet** and was invented during the
  mirror pass. The app's four real animations (`spg-slide-in-right`,
  `spg-fade-in`, `spg-pulse`, `spg-turn-in`, in
  `packages/ui/src/styles/globals.css`) are documented nowhere. The new
  doctrine's Motion section should be built from those.
