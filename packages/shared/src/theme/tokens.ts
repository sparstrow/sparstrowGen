/**
 * The theming contract of `DESIGN.md` §2, as data.
 *
 * **This file is the source of truth for every colour in the app.**
 * `packages/ui/src/styles/globals.css` is generated from it by
 * `scripts/emit-theme-css.mjs`, and `theme.test.ts` fails if the committed CSS
 * and these constants disagree — the same recorded-fingerprint idea
 * `ds.mjs check` uses for the design system.
 *
 * Two hand-maintained copies of a colour table is the defect `G-19` described
 * one level up: 72 literal `oklch()` values with no relationship the code
 * enforced between a token's light and dark form. Add a value here, never
 * there.
 */

import type { Oklch } from "./colour";

// ---------------------------------------------------------------------------
// §2.2 Surfaces — four characters, each with a light and dark expression
// ---------------------------------------------------------------------------

export const SURFACE_NAMES = ["paper", "slate", "soft", "mono"] as const;
export type SurfaceName = (typeof SURFACE_NAMES)[number];

/**
 * Surface sets the *character of the neutral ramp* — hue and chroma only.
 * Chroma is deliberately tiny: §2.3 measured that shifting a surface hue is
 * imperceptible at these levels, so surface controls warmth, not separation.
 */
export const SURFACES: Record<SurfaceName, { hue: number; chroma: number; label: string }> = {
  paper: { hue: 85, chroma: 0.01, label: "Paper" },
  slate: { hue: 250, chroma: 0.011, label: "Slate" },
  soft: { hue: 280, chroma: 0.007, label: "Soft" },
  mono: { hue: 0, chroma: 0, label: "Mono" },
};

export const DEFAULT_SURFACE: SurfaceName = "paper";

/**
 * The three-step neutral ramp, as lightnesses. `soft` is §2.2's documented
 * exception — it lifts the dark ramp and brightens the light one, which is the
 * whole point of it.
 *
 * `cardIsNeutral` marks the one position that drops surface chroma entirely:
 * light-mode `--card` is pure white in every surface. Miss it and every
 * measurement against `--card` is slightly wrong.
 */
export const RAMPS = {
  dark: {
    standard: { background: 0.145, card: 0.195, raised: 0.245 },
    soft: { background: 0.19, card: 0.228, raised: 0.268 },
  },
  light: {
    standard: { background: 0.985, card: 1, raised: 0.955 },
    soft: { background: 0.965, card: 0.995, raised: 0.935 },
  },
} as const;

export type Mode = "light" | "dark";
export type RampStep = "background" | "card" | "raised";
export const RAMP_STEPS: readonly RampStep[] = ["background", "card", "raised"];

/** Light-mode `--card` is a pure neutral — see `RAMPS`. */
export const CARD_IS_NEUTRAL_IN_LIGHT = true;

/** Foreground and border, which do not take surface chroma the same way. */
export const NEUTRALS = {
  dark: { foreground: 0.97, mutedForeground: 0.68, borderAlpha: 0.11, softBorderAlpha: 0.08 },
  light: { foreground: 0.19, mutedForeground: 0.48, borderAlpha: 0.12, softBorderAlpha: 0.12 },
} as const;

// ---------------------------------------------------------------------------
// §2.3 Brand presets — lightness is calibrated per hue
// ---------------------------------------------------------------------------

export const BRAND_NAMES = ["amber", "violet", "blue", "teal", "rose"] as const;
export type BrandName = (typeof BRAND_NAMES)[number];

/**
 * Dark mode uses one lightness for every hue. Light mode cannot: relative
 * luminance is dominated by the green channel, so equal OKLCH lightness does
 * not mean equal contrast (`DD-004`).
 *
 * `lightL` is 0.017–0.022 lower than the first published set. The original was
 * measured against `background` and `card` only and failed against `raised` in
 * light mode for every preset (`DD-010`).
 */
export const BRAND_DARK_L = 0.78;

export const BRANDS: Record<BrandName, { hue: number; chroma: number; lightL: number; label: string }> = {
  amber: { hue: 70, chroma: 0.15, lightL: 0.528, label: "Amber" },
  violet: { hue: 285, chroma: 0.18, lightL: 0.538, label: "Violet" },
  blue: { hue: 250, chroma: 0.16, lightL: 0.52, label: "Blue" },
  teal: { hue: 190, chroma: 0.12, lightL: 0.496, label: "Teal" },
  rose: { hue: 15, chroma: 0.16, lightL: 0.542, label: "Rose" },
};

export const DEFAULT_BRAND: BrandName = "amber";

/** §2.3's published worst case per preset. The test asserts these are real. */
export const BRAND_PUBLISHED_WORST: Record<BrandName, number> = {
  amber: 4.51,
  violet: 4.51,
  blue: 4.52,
  teal: 4.5,
  rose: 4.51,
};

// ---------------------------------------------------------------------------
// §2.4 Status colours — fixed, in every theme
// ---------------------------------------------------------------------------

export const STATUS_NAMES = ["success", "warning", "approval", "danger", "info"] as const;
export type StatusName = (typeof STATUS_NAMES)[number];

/**
 * **A status token holds the colour, not a pale tint of it** (`DD-012`). Used
 * as `text-warning`, `bg-warning/5`, `border-warning/30`, and as a solid fill
 * with `text-warning-foreground` on top.
 *
 * The codebase previously carried two conventions at once, and the tint one
 * would have made `bg-amber-500/5` → `bg-warning/5` invisible in light mode.
 */
export const STATUS: Record<StatusName, Record<Mode, Oklch>> = {
  success: { dark: [0.78, 0.16, 155], light: [0.498, 0.15, 155] },
  warning: { dark: [0.8, 0.14, 75], light: [0.42, 0.12, 70] },
  approval: { dark: [0.78, 0.15, 310], light: [0.47, 0.14, 310] },
  danger: { dark: [0.7, 0.19, 22], light: [0.548, 0.226, 27] },
  info: { dark: [0.78, 0.12, 255], light: [0.42, 0.13, 255] },
};

/**
 * The neutral that goes on a solid status fill. **It flips with the mode**, and
 * that is not a stylistic choice: dark-mode status values sit at L 0.70–0.80
 * and light-mode ones at L 0.42–0.55, so a single foreground fails one mode
 * outright (`DD-012`).
 */
export const STATUS_FOREGROUND: Record<Mode, Oklch> = {
  dark: [0.16, 0, 0],
  light: [0.985, 0, 0],
};

// ---------------------------------------------------------------------------
// §2.5 Actor identity — a palette, not a status
// ---------------------------------------------------------------------------

/**
 * Six hues, ≥20° from every status hue (Identity Is Not Status) and chosen for
 * the **largest possible separation from each other** — 50° apart. Mutual
 * distinguishability is the one thing this palette exists for.
 *
 * Deliberately *not* constrained away from the brand hues: `identity-5` is
 * Violet's hue exactly. Adding that constraint was measured and collapses the
 * six to within 15° of each other (`DD-013`).
 */
export const IDENTITY_HUES = [50, 135, 185, 235, 285, 335] as const;
export const IDENTITY_MIN_STATUS_GAP = 20;

export const IDENTITY_L: Record<Mode, number> = { dark: 0.78, light: 0.48 };
export const IDENTITY_CHROMA = 0.13;

/**
 * The chip form: a **neutral fill** from the surface's own raised step, with
 * the identity colour on the mark and a ring at this alpha. §2.5 originally
 * specified an identity tint plus an identity mark; measured, that form reaches
 * only 3.91 in dark mode (`DD-013`).
 */
export const IDENTITY_RING_ALPHA = 0.4;

export function identityColour(mode: Mode, index: number): Oklch {
  const hue = IDENTITY_HUES[index % IDENTITY_HUES.length]!;
  return [IDENTITY_L[mode], IDENTITY_CHROMA, hue];
}

// ---------------------------------------------------------------------------
// §2.6 Code syntax — the fifth role, and never themed
// ---------------------------------------------------------------------------

/**
 * Literal on purpose, and excluded from every derivation above. A user's
 * surface or accent choice does not reach these (`DD-011`, answering `OQ-4`):
 * tinting them with the surface costs about a third of the perceptual
 * separation between the six, and mapping them onto the status and brand roles
 * costs about half and makes a green string literal read as *online*.
 */
export const SYNTAX_ROLES = ["comment", "keyword", "string", "number", "title", "attr"] as const;
export type SyntaxRole = (typeof SYNTAX_ROLES)[number];

export const SYNTAX: Record<SyntaxRole, Record<Mode, Oklch>> = {
  comment: { light: [0.55, 0.01, 250], dark: [0.62, 0.01, 250] },
  keyword: { light: [0.45, 0.13, 300], dark: [0.75, 0.1, 300] },
  string: { light: [0.45, 0.09, 150], dark: [0.76, 0.09, 150] },
  number: { light: [0.5, 0.12, 50], dark: [0.78, 0.1, 50] },
  title: { light: [0.42, 0.1, 250], dark: [0.78, 0.08, 250] },
  attr: { light: [0.45, 0.08, 220], dark: [0.75, 0.07, 220] },
};

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------

/** §2.5's Named rule — Contrast Floor. Not a target; a gate. */
export const CONTRAST_FLOOR = 4.5;

/** The alpha a tint is drawn at, where a tint is used at all. */
export const TINT_ALPHA = 0.15;

// ---------------------------------------------------------------------------
// Derivation — the whole point of the file
// ---------------------------------------------------------------------------

/** The neutral ramp for one surface in one mode, as OKLCH triples. */
export function rampFor(surface: SurfaceName, mode: Mode): Record<RampStep, Oklch> {
  const { hue, chroma } = SURFACES[surface];
  const steps = RAMPS[mode][surface === "soft" ? "soft" : "standard"];
  const neutralCard = mode === "light" && CARD_IS_NEUTRAL_IN_LIGHT;
  return {
    background: [steps.background, chroma, hue],
    card: neutralCard ? [steps.card, 0, 0] : [steps.card, chroma, hue],
    raised: [steps.raised, chroma, hue],
  };
}

/** The brand accent for one preset in one mode. */
export function brandFor(brand: BrandName, mode: Mode): Oklch {
  const { hue, chroma, lightL } = BRANDS[brand];
  return [mode === "dark" ? BRAND_DARK_L : lightL, chroma, hue];
}

/**
 * Every ground a **fixed** colour can land on: 4 surfaces × 3 steps. Status and
 * identity are not themeable, so they have to clear the floor on all of them,
 * not just on the shipping surface.
 */
export function allGrounds(mode: Mode): { label: string; colour: Oklch }[] {
  const out: { label: string; colour: Oklch }[] = [];
  for (const surface of SURFACE_NAMES) {
    const ramp = rampFor(surface, mode);
    for (const step of RAMP_STEPS) {
      out.push({ label: `${SURFACES[surface].label}/${step}`, colour: ramp[step] });
    }
  }
  return out;
}
