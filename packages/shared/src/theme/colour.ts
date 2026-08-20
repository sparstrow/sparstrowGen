/**
 * OKLCH → WCAG contrast, in the exact form `DESIGN.md` §2.3 names as the
 * measurement basis. Every number the doctrine publishes comes from here.
 *
 * The two steps that are easy to skip, and that made §2.3's first figures
 * unreproducible (`DD-010`):
 *
 *  1. Linear sRGB is **clamped to [0, 1]** before relative luminance. Several
 *     preset × surface pairs land marginally outside gamut; unclamped they
 *     compute a luminance no display can show.
 *  2. There is no de-gamma step. The OKLab conversion already yields *linear*
 *     sRGB, so applying the usual `((v+0.055)/1.055)^2.4` on top double-counts
 *     it and inflates every ratio.
 */

/** A colour as the doctrine writes it: `oklch(L C H)`. */
export type Oklch = readonly [L: number, C: number, H: number];

/** Linear-light sRGB, each channel nominally 0–1 but possibly out of gamut. */
export type LinearRgb = readonly [r: number, g: number, b: number];

/**
 * OKLCH → linear sRGB, via OKLab. Björn Ottosson's matrices.
 * Returned **unclamped**, so callers can tell in-gamut from out.
 */
export function toLinearRgb([L, C, H]: Oklch): LinearRgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Whether a colour is displayable without clamping. */
export function inGamut(rgb: LinearRgb): boolean {
  return rgb.every((v) => v >= -1e-9 && v <= 1 + 1e-9);
}

/** Step 1 above. Skipping it produces figures no display can reproduce. */
export function clampToGamut(rgb: LinearRgb): LinearRgb {
  return [
    Math.min(1, Math.max(0, rgb[0])),
    Math.min(1, Math.max(0, rgb[1])),
    Math.min(1, Math.max(0, rgb[2])),
  ];
}

/** OKLCH straight to a displayable linear colour — the usual entry point. */
export function paint(colour: Oklch): LinearRgb {
  return clampToGamut(toLinearRgb(colour));
}

/** WCAG 2.x relative luminance. Input is already linear — see step 2 above. */
export function luminance(rgb: LinearRgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** WCAG 2.x contrast ratio. Order-independent. */
export function contrast(a: LinearRgb, b: LinearRgb): number {
  const x = luminance(a);
  const y = luminance(b);
  const hi = Math.max(x, y);
  const lo = Math.min(x, y);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite `fg` over `bg` at `alpha`, in linear light — how a `/15` tint
 * actually lands. `DD-013` turns on this: the intuition that a tint barely
 * moves the ground is wrong, and it is wrongest over a *light* ground.
 */
export function over(fg: LinearRgb, bg: LinearRgb, alpha: number): LinearRgb {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

/** Shortest angular distance between two hues, in degrees. Always 0–180. */
export function hueGap(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

/** Format for CSS. Trailing zeros are trimmed so output matches the doctrine. */
export function css([L, C, H]: Oklch): string {
  const n = (v: number) => String(+v.toFixed(4));
  return `oklch(${n(L)} ${n(C)} ${n(H)})`;
}
