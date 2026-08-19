// Contrast sweep for DESIGN.md §2 — the reproduction that closed G-21's
// "cannot be reproduced from the document" finding.
//
//   node design-brief/contrast-check.mjs
//
// Zero dependencies, Node 18+. This is the PROTOTYPE, sitting beside
// theme-board.html where the theming work was designed. The shipping version is
// a unit test over constants in @sparstrow/shared — see phase D2.1 of
// doc/plans/2026-08-19-parametric-theming.md. Do not wire CI to this file.
//
// Two assumptions were missing from DESIGN.md §2 and are what made the
// published figures unreproducible. Both are implemented below and flagged:
//
//   1. Linear sRGB is CLAMPED to [0,1] before relative luminance. Several
//      preset x surface pairs land marginally outside gamut; unclamped they
//      compute a luminance no display can show.
//   2. The published "40 combinations" swept --background and --card only.
//      --accent, the raised third step, was not measured. It is here, and
//      that is where the 20 failures are.

// ---------- colour ----------

/** OKLCH -> linear sRGB (Björn Ottosson's OKLab matrices). Unclamped. */
const toLinearSrgb = (L, C, H) => {
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
};

const inGamut = (rgb) => rgb.every((v) => v >= -1e-9 && v <= 1 + 1e-9);

/** Assumption 1. Without this the published figures do not reproduce. */
const clampToGamut = (rgb) => rgb.map((v) => Math.min(1, Math.max(0, v)));

/** WCAG 2.x relative luminance. Inputs are already linear, so no de-gamma. */
const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// ---------- the system, transcribed from DESIGN.md §2.2 / §2.3 ----------

/** [hue, chroma, light-mode L]. Dark-mode L is 0.78 for every preset. */
const PRESETS = {
  Amber: [70, 0.15, 0.55],
  Violet: [285, 0.18, 0.555],
  Blue: [250, 0.16, 0.54],
  Teal: [190, 0.12, 0.515],
  Rose: [15, 0.16, 0.56],
};

/** [hue, chroma]. */
const SURFACES = {
  Paper: [85, 0.01],
  Slate: [250, 0.011],
  Soft: [280, 0.007],
  Mono: [0, 0],
};

const DARK_BRAND_L = 0.78;

/** §2.3's published worst case, for the reproduction assertion. */
const PUBLISHED = { Amber: 4.5, Violet: 4.58, Blue: 4.55, Teal: 4.56, Rose: 4.57 };

/**
 * The three-step neutral ramp per surface and mode. Soft is the documented
 * exception (§2.2) — it lifts the dark ramp and brightens the light one.
 * `card` is a pure neutral in light mode in both variants, hence chroma 0.
 */
const ramp = (surface, mode) => {
  const soft = surface === "Soft";
  if (mode === "dark") {
    return soft
      ? [["background", 0.19], ["card", 0.228], ["accent", 0.268]]
      : [["background", 0.145], ["card", 0.195], ["accent", 0.245]];
  }
  return soft
    ? [["background", 0.965], ["card", 0.995, true], ["accent", 0.935]]
    : [["background", 0.985], ["card", 1, true], ["accent", 0.955]];
};

const FLOOR = 4.5;

// ---------- sweep ----------

const measure = ({ includeAccent }) => {
  const rows = [];
  for (const [preset, [bh, bc, lightL]] of Object.entries(PRESETS)) {
    for (const [surface, [sh, sc]] of Object.entries(SURFACES)) {
      for (const mode of ["light", "dark"]) {
        const raw = toLinearSrgb(mode === "light" ? lightL : DARK_BRAND_L, bc, bh);
        const brand = clampToGamut(raw);
        for (const [step, L, neutral] of ramp(surface, mode)) {
          if (step === "accent" && !includeAccent) continue;
          const bg = toLinearSrgb(L, neutral ? 0 : sc, neutral ? 0 : sh);
          rows.push({
            preset, surface, mode, step,
            ratio: contrast(brand, bg),
            clamped: !inGamut(raw),
          });
        }
      }
    }
  }
  return rows;
};

const worstPerPreset = (rows) => {
  const out = {};
  for (const r of rows) if (!out[r.preset] || r.ratio < out[r.preset].ratio) out[r.preset] = r;
  return out;
};

// ---------- 1. reproduce §2.3 ----------

console.log("§2.3 reproduction — clamped, --background and --card only\n");
const published = worstPerPreset(measure({ includeAccent: false }));
let reproduced = true;
for (const [preset, r] of Object.entries(published)) {
  const match = Math.abs(r.ratio - PUBLISHED[preset]) < 0.005;
  if (!match) reproduced = false;
  console.log(
    `  ${preset.padEnd(7)} published ${PUBLISHED[preset].toFixed(2)}   measured ${r.ratio.toFixed(2)}` +
      `   ${match ? "match" : "MISMATCH"}   worst: ${r.mode}/${r.surface}/${r.step}`
  );
}
console.log(`\n  ${reproduced ? "All five reproduce exactly. G-21's method is confirmed." : "DOES NOT REPRODUCE."}`);

// ---------- 2. the full sweep, including --accent ----------

const full = measure({ includeAccent: true });
const failures = full.filter((r) => r.ratio < FLOOR);

console.log(`\nFull sweep — all three ramp steps: ${full.length} combinations, ${failures.length} below ${FLOOR}\n`);
for (const r of failures.sort((a, b) => a.ratio - b.ratio)) {
  console.log(`  ${`${r.preset}/${r.surface}/${r.mode}/${r.step}`.padEnd(32)} ${r.ratio.toFixed(2)}`);
}

// ---------- 3. what would clear it ----------

console.log("\nLight-mode lightness needed to clear the floor on every step\n");
for (const [preset, [bh, bc, current]] of Object.entries(PRESETS)) {
  let chosen = null;
  for (let L = current; L > 0.3; L -= 0.001) {
    const brand = clampToGamut(toLinearSrgb(L, bc, bh));
    let worst = Infinity;
    for (const [surface, [sh, sc]] of Object.entries(SURFACES)) {
      for (const [, bgL, neutral] of ramp(surface, "light")) {
        worst = Math.min(worst, contrast(brand, toLinearSrgb(bgL, neutral ? 0 : sc, neutral ? 0 : sh)));
      }
    }
    if (worst >= FLOOR) { chosen = [L, worst]; break; }
  }
  console.log(
    `  ${preset.padEnd(7)} ${current.toFixed(3)} -> ${chosen[0].toFixed(3)}` +
      `   (worst becomes ${chosen[1].toFixed(2)}, a drop of ${(current - chosen[0]).toFixed(3)})`
  );
}

console.log("\nDark mode passes everywhere and is untouched by the above.");
