# T-D1-01 — status colour token sweep

| | |
|---|---|
| **Tag** | `[C]` — touches 23 files across `packages/ui` and `apps/web`, several of which other work also edits. Interleavable, but one worker at a time on those files |
| **Serves** | **foundational** — makes `DESIGN.md` §12's token rule true, which is a precondition for the parametric theming `G-19` describes |
| **Depends on** | — |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Replace every hardcoded Tailwind palette class in `packages/ui/src` and
`apps/web/src` with the semantic status token that already exists, so a colour
means the same thing in every theme and each call site stops maintaining its own
light/dark pair by hand.

228 uses across 23 files, found by the first `slop-audit` run on 2026-08-19.
~208 are mechanical. The ~20 that are not go to `OQ-3` and block only their own
checklist items.

## Decisions already made

**The mapping.** Derived from how each colour is actually used at its call
sites, not from the hue:

| Palette class | Becomes | Because |
|---|---|---|
| `amber-*` (93) | `warning` | Every site is *needs attention* / *blocked* — `attention-queue.tsx:51`, `node-shell.tsx:30` (`attention:`), `blocked-project-actions.tsx:109`. It is **not** the brand accent, despite the hue matching it |
| `emerald-*` (44) | `success` | Online, passed, connected — `app-shell.tsx:254` (`connected ?`), `pr-queue.tsx` |
| `sky-*` (35) | `info` | Informational badges and counts |
| `red-*` (31) | `destructive` | Failure and error states |
| `indigo-*` (4) | `info` | One site: `update-banner.tsx:112`, a product announcement banner |
| `blue-*` (1) | `info` | `run-transcript.tsx:177`, the streaming/live indicator |

**Opacity modifiers carry over unchanged.** `bg-amber-500/5` → `bg-warning/5`,
`border-amber-500/30` → `border-warning/30`. Same visual weight, one class.

**Light/dark pairs collapse to one class.** The tokens are already defined per
mode, so `text-amber-700 dark:text-amber-300` → `text-warning-foreground`. Do
not keep the `dark:` variant — leaving it re-introduces the hand-maintained pair
this task exists to remove.

**Match the existing right answer.** `text-destructive`,
`border-destructive/30`, and `bg-destructive/5` are already used correctly in
`chat-bits.tsx:113`, `attention-queue.tsx:117`, and `agent-form.tsx:442`. Copy
those shapes rather than inventing a convention.

**`-foreground` is for text on the tinted surface**, not a second fill. Read the
token pairs in `globals.css:20-27` before the first replacement; guessing which
half goes on text is the one way to get a legible-looking but wrong result.

## Traps

- **Amber is the brand hue and also the warning colour.** Do not "simplify" an
  amber status class to a brand token. `DESIGN.md` §2 forbids the brand accent
  carrying meaning — status must survive the user changing their accent.
- **`actor-avatar.tsx` is not drift.** Its six hues are hashed from the actor
  name so one agent is one colour everywhere. Sweeping it makes every avatar
  identical. Leave it alone — see `OQ-3`.
- **`node-shell.tsx` has both an `attention:` and an `approval:` variant.** The
  first is mechanical (amber → warning); the second is blocked on `OQ-3`. Same
  file, two different outcomes.
- **`app-shell.tsx` exists twice** — `packages/ui/src/components/layout/` and
  `apps/web/src/components/layout/`. They drift from each other. Change both,
  and diff them afterwards.

## Checklist

- [ ] Read `globals.css:20-27` (light), `54-61` (dark), `88-95` (Tailwind map)
      so the token pairs are known before the first edit
- [ ] **amber → warning**, 17 files: `actor-avatar` *(skip — OQ-3)*,
      `attention-queue`, `blocked-project-actions`, `canvas/node-shell`,
      `layout/app-shell`, `pipelines/editable-step-node`, and pages
      `agent-create`, `goal-detail`, `imports`, `memory`, `pipelines`,
      `project-detail`, `run-detail`, `schedule`, `tasks`, `teams`,
      `terminals`, plus `apps/web` `layout/app-shell`
- [ ] **emerald → success**, 15 files: `attention-queue`, `canvas/node-shell`,
      `layout/app-shell`, `pr-queue`, `team/manager-chat-panel`, and pages
      `agents`, `goal-detail`, `imports`, `pipelines`, `project-detail`,
      `schedule`, `tasks`, `team-detail`, `terminals`, plus `apps/web`
      `layout/app-shell`
- [ ] **sky → info**, 7 files: `attention-queue`, and pages `goal-detail`,
      `project-detail`, `projects`, `tasks`, `team-detail`, `teams`
- [ ] **red → destructive**, 6 files: `canvas/node-shell`, `layout/app-shell`,
      `run-transcript`, and pages `imports`, `tasks`, `terminals`, plus
      `apps/web` `layout/app-shell`
- [ ] **indigo → info**: `update-banner.tsx:112` (all four occurrences,
      including the `[&_.banner-action]:` variants)
- [ ] **blue → info**: `run-transcript.tsx:177`
- [ ] Every `dark:` variant that existed only to pair a light palette value is
      removed, not carried over
- [ ] **Approval → its own status.** `attention-queue.tsx:230,234,242` and
      `canvas/node-shell.tsx:31,43` move to an `approval` token at hue 310, per
      `DESIGN.md` §2.4. Add the token pair to `globals.css` in the same shape as
      the other four status tokens — both modes, plus the `--color-approval`
      Tailwind mapping — before replacing any call site
- [ ] **Actor identity → its own role.** `actor-avatar.tsx:4-11` and
      `tasks.tsx:54-57` become identity tokens per `DESIGN.md` §2.5. The hashing
      stays exactly as it is; only the six hues become tokens. **Do not reuse the
      current emerald/amber/rose** — §2.5's Identity Is Not Status rule requires
      every identity hue to sit ≥20° from a status hue, which those three
      violate today
- [ ] Verification below, all four steps

## Verification

1. **The class is gone.** This returns only the sites `OQ-3` parked:

   ```bash
   grep -rnE "\b(bg|text|border|ring|from|to)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}" packages/ui/src apps/web/src --include=*.tsx
   ```

2. **It still reads correctly.** Open the app and walk a surface carrying each
   state — a blocked run (warning), a connected machine (success), a failed
   import (destructive), the update banner (info) — in **both modes**. A token
   swap that typechecks and renders grey is the expected failure here.

3. **`pnpm typecheck` and `pnpm build` clean.**

4. **Re-run the audit.** `slop-killer` over `packages/ui/src` and
   `apps/web/src`; the palette-class drift finding should be gone, with only the
   `OQ-3` sites remaining and named as parked.

## Result

<!-- Fill in on completion: what was actually run, what was skipped and why,
     and whether any KnownGaps entry opened or closed. -->
