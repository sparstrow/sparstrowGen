/**
 * The contrast floor, as a test rather than a promise.
 *
 * `G-21` was raised because `DESIGN.md` §2's published figures could not be
 * re-derived from the document, and its stated risk was that the check would
 * get skipped. A script someone has to remember will be. This runs in
 * `pnpm test`, locally and in CI, and contrast maths is pure — no browser, no
 * DOM, no fixtures.
 *
 * It replaces `design-brief/contrast-check.mjs`, which stays as the prototype
 * beside the theme board it was written against.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrast, hueGap, inGamut, over, paint, toLinearRgb, type Oklch } from "./colour";
import { emitThemeCss, extractThemeCss } from "./css";
import {
  BRAND_NAMES,
  BRAND_PUBLISHED_WORST,
  CONTRAST_FLOOR,
  IDENTITY_HUES,
  IDENTITY_MIN_STATUS_GAP,
  RAMP_STEPS,
  STATUS,
  STATUS_FOREGROUND,
  STATUS_NAMES,
  SURFACES,
  SURFACE_NAMES,
  TINT_ALPHA,
  allGrounds,
  brandFor,
  identityColour,
  rampFor,
  type Mode,
} from "./tokens";

const MODES: Mode[] = ["light", "dark"];

/** Worst contrast of one colour across every surface position in a mode. */
function worstOnGrounds(colour: Oklch, mode: Mode) {
  let worst = Number.POSITIVE_INFINITY;
  let where = "";
  for (const ground of allGrounds(mode)) {
    const ratio = contrast(paint(colour), paint(ground.colour));
    if (ratio < worst) {
      worst = ratio;
      where = ground.label;
    }
  }
  return { worst, where };
}

describe("colour maths", () => {
  it("returns linear sRGB, not gamma-encoded — a de-gamma step would double-count", () => {
    // For an achromatic colour the OKLab conversion collapses to a cube, so the
    // linear value is exactly L^3. That identity is the sharpest available
    // check that no sRGB transfer function has been applied on top: decoding
    // 0.125 as if it were gamma-encoded would give ~0.0144, not 0.125.
    for (const L of [0.2, 0.5, 0.78, 0.985]) {
      const [r, g, b] = toLinearRgb([L, 0, 0]);
      expect(r).toBeCloseTo(g, 9);
      expect(g).toBeCloseTo(b, 9);
      expect(r).toBeCloseTo(L ** 3, 6);
    }
  });

  it("reproduces a known-good WCAG pair", () => {
    // Pure black on pure white is exactly 21:1 by definition.
    expect(contrast(paint([0, 0, 0]), paint([1, 0, 0]))).toBeCloseTo(21, 4);
  });

  it("clamps out-of-gamut colours rather than reporting an impossible luminance", () => {
    const wild: Oklch = [0.78, 0.4, 145];
    expect(inGamut(toLinearRgb(wild))).toBe(false);
    for (const channel of paint(wild)) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });

  it("measures hue distance the short way round", () => {
    expect(hueGap(350, 10)).toBe(20);
    expect(hueGap(10, 350)).toBe(20);
    expect(hueGap(0, 180)).toBe(180);
  });
});

describe("DESIGN.md §2.3 — brand presets clear the floor on every ramp step", () => {
  // 5 presets x 4 surfaces x 2 modes x 3 steps. The original sweep covered only
  // background and card, and every preset failed against `raised` (DD-010).
  const combinations = BRAND_NAMES.flatMap((brand) =>
    SURFACE_NAMES.flatMap((surface) =>
      MODES.flatMap((mode) =>
        RAMP_STEPS.map((step) => ({ brand, surface, mode, step })),
      ),
    ),
  );

  it("sweeps all three ramp steps, not two", () => {
    expect(combinations).toHaveLength(120);
  });

  it.each(combinations)("$brand on $surface, $mode, $step", ({ brand, surface, mode, step }) => {
    const ratio = contrast(paint(brandFor(brand, mode)), paint(rampFor(surface, mode)[step]));
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });

  it.each(BRAND_NAMES)("%s matches the worst case §2.3 publishes", (brand) => {
    let worst = Number.POSITIVE_INFINITY;
    for (const surface of SURFACE_NAMES) {
      for (const mode of MODES) {
        for (const step of RAMP_STEPS) {
          worst = Math.min(worst, contrast(paint(brandFor(brand, mode)), paint(rampFor(surface, mode)[step])));
        }
      }
    }
    // A doctrine table nobody checks is a doctrine table that drifts.
    expect(worst).toBeCloseTo(BRAND_PUBLISHED_WORST[brand], 2);
  });
});

describe("DESIGN.md §2.4 — status colours are fixed, so they face every surface", () => {
  const cases = STATUS_NAMES.flatMap((status) => MODES.map((mode) => ({ status, mode })));

  it.each(cases)("$status, $mode, on any surface position", ({ status, mode }) => {
    const { worst, where } = worstOnGrounds(STATUS[status][mode], mode);
    expect(worst, `worst at ${where}`).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });

  it.each(cases)("$status, $mode, as a solid fill with text on top", ({ status, mode }) => {
    // The neutral flips with the mode: dark status values are light and light
    // ones are dark, so one shared foreground fails a mode outright (DD-012).
    const ratio = contrast(paint(STATUS_FOREGROUND[mode]), paint(STATUS[status][mode]));
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });

  it("keeps approval separable from every other status by hue", () => {
    // Approval exists because "blocked" and "awaiting a human" are triaged
    // differently and must be tellable apart across a room.
    for (const other of STATUS_NAMES) {
      if (other === "approval") continue;
      for (const mode of MODES) {
        expect(hueGap(STATUS.approval[mode][2], STATUS[other][mode][2])).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

describe("DESIGN.md §2.5 — Identity Is Not Status", () => {
  const statusHues = [...new Set(STATUS_NAMES.flatMap((s) => MODES.map((m) => STATUS[s][m][2])))];

  it.each(IDENTITY_HUES)("hue %i sits clear of every status hue", (hue) => {
    for (const statusHue of statusHues) {
      expect(hueGap(hue, statusHue)).toBeGreaterThanOrEqual(IDENTITY_MIN_STATUS_GAP);
    }
  });

  it("keeps the six identities far apart from each other", () => {
    // This is the property the palette exists for. It is also the one a
    // brand-distance constraint would have destroyed, dropping it to 15.
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < IDENTITY_HUES.length; i++) {
      for (let j = i + 1; j < IDENTITY_HUES.length; j++) {
        closest = Math.min(closest, hueGap(IDENTITY_HUES[i]!, IDENTITY_HUES[j]!));
      }
    }
    expect(closest).toBeGreaterThanOrEqual(45);
  });

  const marks = IDENTITY_HUES.flatMap((_, i) => MODES.map((mode) => ({ i, mode })));

  it.each(marks)("identity $i mark is legible in $mode on every surface", ({ i, mode }) => {
    const { worst, where } = worstOnGrounds(identityColour(mode, i), mode);
    expect(worst, `worst at ${where}`).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });

  it("records why the chip is a neutral fill rather than an identity tint", () => {
    // §2.5 originally specified a tint plus the colour's own foreground. This
    // asserts the measurement that killed that form, so nobody reintroduces it
    // believing it was only ever a style preference (DD-013).
    //
    // Note the ground: worst case is the LIGHTEST dark surface, not the
    // darkest, because a tint lifts a light ground further.
    const mark = paint(identityColour("dark", 2));
    const lightestDarkGround = paint(rampFor("soft", "dark").raised);
    const onOwnTint = contrast(mark, over(mark, lightestDarkGround, TINT_ALPHA));
    expect(onOwnTint).toBeLessThan(CONTRAST_FLOOR);

    // ...while the shipped form clears it comfortably.
    expect(contrast(mark, lightestDarkGround)).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });
});

describe("globals.css is generated from these constants", () => {
  const globalsPath = fileURLToPath(
    new URL("../../../ui/src/styles/globals.css", import.meta.url),
  );

  it("has not drifted from the emitter", () => {
    const source = readFileSync(globalsPath, "utf8");
    const committed = extractThemeCss(source);
    expect(
      committed,
      "generated block markers missing from globals.css — see packages/shared/src/theme/css.ts",
    ).not.toBeNull();

    const fresh = emitThemeCss();

    // Regenerating is a snapshot update, not a build step, so it runs through
    // the same tool as the assertion:
    //
    //   UPDATE_THEME_CSS=1 pnpm --filter @sparstrow/shared test
    //
    // A standalone CLI would need `tsx` purely to read two TypeScript files.
    if (process.env.UPDATE_THEME_CSS && committed !== fresh) {
      writeFileSync(globalsPath, source.replace(committed!, fresh));
    }

    // If this fails, the CSS was hand-edited. Change tokens.ts and re-emit.
    expect(extractThemeCss(readFileSync(globalsPath, "utf8"))!.trim()).toBe(fresh.trim());
  });

  it("resolves every surface and brand class it claims to offer", () => {
    const css = emitThemeCss();
    for (const surface of SURFACE_NAMES) {
      expect(css).toContain(`:root.surface-${surface}`);
      expect(css).toContain(`.dark.surface-${surface}`);
    }
    for (const brand of BRAND_NAMES) {
      expect(css).toContain(`:root.theme-${brand}`);
      expect(css).toContain(`.dark.theme-${brand}`);
    }
  });

  it("never emits a hardcoded hex", () => {
    // Every colour is OKLCH. A hex here means a value escaped the derivation.
    expect(emitThemeCss()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("names every surface in SURFACES", () => {
    expect(Object.keys(SURFACES).sort()).toEqual([...SURFACE_NAMES].sort());
  });
});
