# DESIGN.md — Sparstrowgen

> Documented from the live token set in `packages/ui/src/styles/globals.css` and the shadcn/ui
> component layer in `packages/ui/src/components/ui/`.

## Foundations

- **Stack**: Tailwind v4 + shadcn/ui primitives, lucide-react icons, plain-CSS keyframes
  (`spg-*`), no framer-motion.
- **Typography**: Inter Variable everywhere (single family). Fixed rem scale, tight ratio;
  `text-sm` is the working size, `text-xs` for metadata, `text-base+` reserved for headings
  and conversation prose.
- **Radius**: `--radius: 0.625rem` (lg); sm/md/xl derived.

## Color

Pure-neutral OKLCH scale (chroma 0) with dark and light themes via the `.dark` class; the
theme toggle must keep both first-class. `--primary` is near-foreground neutral, so "accent"
today is contrast, not hue. Semantic colors: `--destructive` (only hue in the system) plus
amber utilities used ad hoc for warnings/attention.

Strategy: **Restrained**. A working accent, if ever introduced, enters through `--primary`
and stays ≤10% of any surface. State tints (selection, warnings, errors) use low-alpha
overlays of the semantic color, never full saturation on inactive elements.

Two neutral layers exist and should be used deliberately:
- `--background` — content surface.
- `--sidebar` / `--muted` — rails, toolbars, panels (one step off the content surface).

## Components

- shadcn/ui vocabulary only: `Button`, `Select`, `Dialog`, `Badge`, `Textarea`, `Skeleton`,
  `Tabs`, `DropdownMenu`, `Tooltip`. Same control shapes everywhere; no invented affordances.
- Icons: lucide, `size-4` in controls, `size-3.5` in metadata rows.
- Empty states teach the surface (what it is + the primary action), never just "nothing here".

## Motion

- Plain CSS keyframes, 150–250ms, ease-out. Existing tokens: `spg-slide-in-right`,
  `spg-fade-in`, `spg-pulse` (thinking dots). Motion conveys state only.

## Chat surface (intake 0001+0002)

- Conversation is a centered reading column (`max-w-3xl`), assistant turns flat on the
  background with metadata captions; user turns in a quiet `--muted` bubble, right-aligned.
- The composer is a bordered `--radius-xl` container with the send affordance inside and
  context/model controls attached to it (borderless ghost selects), Claude-Code-desktop style.
- Session history is a quiet left rail on the `--sidebar` layer; active item marked by
  background tint, not stripes.
