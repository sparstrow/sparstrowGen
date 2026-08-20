# T-D2-02 — globals.css derives instead of transcribing

| | |
|---|---|
| **Tag** | `[S]` — one file, high blast radius: it repaints every screen |
| **Serves** | **US-T1** — the owner opens the app and it is warm rather than neutral |
| **Depends on** | `T-D2-01` |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-19 |

## Objective

Replace 72 hand-maintained `oklch()` literals with a generated block, and expose
the four surfaces and five brand presets as root classes.

## What was built

`globals.css` now holds one marked region, emitted from
`packages/shared/src/theme/tokens.ts`, and nothing else chromatic. Everything
hand-written stays: the Tailwind map (extended), the base layer, the react-flow
overrides, the keyframes, the hljs class rules.

```
<html class="dark surface-slate theme-teal">
```

With no classes at all, `:root` is light Paper/Amber and `.dark` is dark
Paper/Amber, so the app themes correctly without anyone adding anything.

## Decisions made while building

**Per-class blocks, not five root variables.** The theme board proves the
derivation works with `oklch(0.145 var(--sc) var(--sh))`, but a `var()` inside
`oklch()` cannot be used by Tailwind's opacity modifier — `bg-card/50` needs a
resolved colour. So the emitter writes each surface and brand as its own block.
More CSS, and nobody maintains it by hand.

## Verification

- `pnpm build` — 6/6 packages.
- Verified live in the browser: adding `surface-slate` moves `--background` from
  hue 85 to 250 and leaves `--brand` alone; adding `theme-teal` moves `--brand`
  from hue 70 to 190 and leaves the neutrals alone; removing both restores the
  defaults exactly.

## Result

**The build caught a defect a typecheck never would.** Tailwind's CSS parser
opens a string on an apostrophe *inside a comment*, so a comment added the day
before failed the build with `Unterminated string` pointing at a line of
English. The same restructure had also truncated that comment mid-sentence,
losing its closing `*/`. Both fixed, and the file now says in its own preamble
why it contains no apostrophes.

**Light mode gained a surface ramp it never had.** `background`, `card`, and
`popover` were all `oklch(1 0 0)` — the finding `design-system-v2` opened with.
Deriving them produced `0.985 / 1.0 / 0.955` without anyone deciding to fix it.
