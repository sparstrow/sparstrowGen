# Sparstrowgen Design System

**Product:** Sparstrowgen — an autonomous AI agent platform and developer
control plane. Multi-node agent runtimes, task pipelines, GOAP goal planning,
and RAG memory.

**Mode: `mirror`.** The app's real code is the source of truth and this system
documents it. Every component card here depicts a component that already exists
in `@sparstrow/ui`; nothing is authored here to be built later. When the real
code changes, `check` says so.

## How to consume this

1. Link `styles.css` in your `<head>` — it `@import`s the three token files.
2. Dark mode is a **`.dark` class on the root element**, not a media query.
   `:root` is the light theme. The app runs dark. (Cards here also accept
   `[data-theme="dark"]` so the viewer's toggle reaches them.)
3. Use `var(--token)` for every colour, radius, and spacing value. A hex literal
   in application code is a bug — it will not follow the theme.
4. In the app itself, import components from `@sparstrow/ui`. Never copy a card's
   HTML into production; the cards are depictions built for this page.

## Sources

| What | Where |
|---|---|
| Colour + radius tokens | `packages/ui/src/styles/globals.css` |
| Components | `packages/ui/src/components/ui/` (26 primitives) |
| Written design intent | `DESIGN.md` (repo root) |
| Product/stack facts | `.sparstrowgen/blueprint.yaml` |

Type and spacing tokens are the one exception to "pure mirror": `DESIGN.md`
specifies a scale in prose that has no CSS counterpart in the app, which uses
Tailwind size classes instead. They are recorded in `tokens/` as documentation
of intent and flagged here so nobody mistakes them for live variables.

## Product context

| Area | Key surfaces |
|---|---|
| Dashboard | Run activity, machine health |
| Agents | Agent registry, creator, SKILL.md viewer, teams |
| Runs | Run list, run detail, live transcripts |
| Machines | Pairing, status, runtime config |
| Memory | Notes, semantic search |
| Projects | Project registry, directives |
| Knowledge Center | User-facing product docs |

Two databases sit behind these: a Postgres/Supabase cloud control plane
(identity, machines, board, runs) and per-machine local SQLite for execution and
the memory index. That split shapes the UI more than it looks — anything showing
memory search results is reading a *local* index over the network boundary, so
loading and unreachable states are first-class, not edge cases.

## Content fundamentals

- **Tone** — direct, technical, no filler. The reader is an engineer watching
  agents run.
- **Casing** — sentence case on UI labels (`New agent`, `Open run`), title case
  on module names (`Machines`, `Memory`), UPPERCASE for section headers in rails
  and table columns.
- **Numbers** — `tabular-nums` anywhere figures are compared down a column.
- **IDs** — monospace, prefixed: `rt_9f2c1a`, `run_04b8`, `agt_…`. Never
  reformat or truncate an ID without a copy affordance.
- **Durations** — `2m 14s`, not `134s`. **Timestamps** — relative under an hour
  (`40s ago`), absolute beyond (`2026-08-17 14:02`).
- **No emoji.** Status is colour + text, never a pictogram.
- **Counts** — a badge beside the page title (`Machines 12`), not `12 machines found`.

## Visual foundations

Full detail in the cards below; this is the greppable summary.

**Colour.** Two themes, `.dark` class-toggled, light is `:root`. Everything is
OKLCH at chroma 0 except four semantic statuses and destructive. Primary
**inverts** between themes — near-black in light, near-white in dark — so a
primary button is the lightest thing on a dark screen. Accent covers ≤10% of any
screen (the One Accent Rule); status is where that budget goes.

| Semantic | Hue | Use |
|---|---|---|
| `success` | 155 | Completed, active, done |
| `info` | 250 | Running, syncing, dispatched |
| `warning` | 70–80 | Queued too long, unreachable, nearing a limit |
| `destructive` | 22–27 | Failed, blocked, expired |

**Type.** Inter Variable for UI, monospace for IDs and figures. Six steps:
18/700 page title · 15/600 section · 14/400 body (capped 65–75ch) · 12/400 meta
· 11/600 uppercase labels · mono 12 for codes. Hierarchy is scale and weight
only — never colour, never accent stripes.

**Spacing.** 4px grid. Card padding 20px, section padding 24px.

**Radius.** All derived from `--radius: 0.625rem`: 6 chips · 8 inputs/buttons ·
10 cards/panels · 14 modals · 999 pills.

**Elevation.** Flat by default. One shadow (`--shadow-popover`), only for
genuinely floating layers — dropdowns, popovers, command palettes. A shadowed
card is a defect.

**Motion.** 140ms `ease` for interaction, 150–200ms for entrance. No spring, no
bounce. `prefers-reduced-motion` honoured everywhere.

**Never:** hardcoded Tailwind colours (`bg-slate-950`), gradient text,
`backdrop-blur` glassmorphism, coloured left-border stripes, the hero-metric
template for ordinary stats, or a custom primitive where `@sparstrow/ui` has one.

## Maintaining this

```bash
# after changing globals.css or a component
node .claude/skills/design-system/scripts/ds.mjs check --root design-system

# after updating the affected cards and usage notes to match
node .claude/skills/design-system/scripts/ds.mjs sync  --root design-system

# regenerate index.html
node .claude/skills/design-system/scripts/ds.mjs build --root design-system

# view it (open index.html directly, or serve so prototypes can load lib/ data)
node .claude/skills/design-system/scripts/ds.mjs serve --root design-system --port 4321
```

`check` exits 1 on drift, so it drops straight into CI. Run `sync` only *after*
the cards are actually updated — running it first converts a real warning into
silence.

## File index

```
design-system/
├── index.html                  GENERATED — do not hand-edit
├── system.json                 manifest: mode, sources, token + component fingerprints
├── README.md                   this file
├── CHANGELOG.md                newest first
├── styles.css                  @import entry point
├── tokens/
│   ├── colors.css              mirrored from globals.css, both themes
│   ├── typography.css          DESIGN.md scale as tokens (intent, not yet live)
│   └── spacing.css             radius mirrored; spacing/shadow from DESIGN.md
├── guidelines/
│   ├── surfaces.card.html      surface stack + text hierarchy
│   ├── status-colors.card.html four semantic statuses
│   ├── type-scale.card.html    six type steps
│   ├── radius.card.html        five derived radius steps
│   ├── elevation.card.html     flat-by-default, the one shadow
│   └── motion.card.html        transitions + keyframes, replayable
├── components/
│   ├── buttons/                Button — 6 variants, 4 sizes
│   ├── badges/                 Badge — 7 variants, semantic mapping
│   ├── forms/                  Input — field assembly and states
│   └── surfaces/               Card — the flat surface
├── designs/                    prototypes (.dc.html) + preview cards
└── lib/                        shared seed data for prototypes
```

## Coverage

4 of 26 primitives are carded so far — the four that carry the most design
decisions. The rest exist in `@sparstrow/ui` and are not yet documented here;
absence from this page means undocumented, **not** unavailable. Add one with:

```bash
node .claude/skills/design-system/scripts/ds.mjs add --root design-system \
  --kind component --name Dialog --group overlays \
  --source packages/ui/src/components/ui/dialog.tsx
```

Registering with `--source` is what puts it under drift detection; a card added
without it is invisible to `check`, and `check` will tell you so.
