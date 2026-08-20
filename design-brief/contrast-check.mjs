// Contrast check for DESIGN.md §2 — sweeps every brand preset against every
// step of every surface ramp, in both modes, and verifies §2.3's table.
//
//   node design-brief/contrast-check.mjs        exits 1 on any failure
//
// Zero dependencies, Node 18+. This is the PROTOTYPE, sitting beside
// theme-board.html where the theming work was designed. The shipping version is
// a unit test over constants in @sparstrow/shared — see phase D2.1 of
// doc/plans/2026-08-19-parametric-theming.md. Do not wire CI to this file.
//
// WHY THIS EXISTS. §2.3's first published figures could not be re-derived from
// the document (doc/KnownGaps.md G-21). Two assumptions were missing:
//
//   1. Linear sRGB is CLAMPED to [0,1] before relative luminance. Several
//      preset x surface pairs land marginally outside gamut; unclamped they
//      compute a luminance no display can show.
//   2. The sweep covered --background and --card only. --accent, the raised
//      third step, was never measured — and all five presets failed against it
//      in light mode, 4.12 to 4.46.
//
// Assumption 1 is now stated in §2.3. Assumption 2 was a real defect: the
// light-mode lightnesses below are 0.017-0.022 lower than the first set, which
// is what clears --accent. Both changes were accepted by the owner 2026-08-19.

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

const paint = (L, C, H) => clampToGamut(toLinearSrgb(L, C, H));

// ---------- the system, transcribed from DESIGN.md §2.2 / §2.3 ----------

/** [hue, chroma, light-mode L]. Dark-mode L is 0.78 for every preset. */
const PRESETS = {
  Amber: [70, 0.15, 0.528],
  Violet: [285, 0.18, 0.538],
  Blue: [250, 0.16, 0.52],
  Teal: [190, 0.12, 0.496],
  Rose: [15, 0.16, 0.542],
};

/** [hue, chroma]. */
const SURFACES = {
  Paper: [85, 0.01],
  Slate: [250, 0.011],
  Soft: [280, 0.007],
  Mono: [0, 0],
};

const DARK_BRAND_L = 0.78;
const FLOOR = 4.5;

/** §2.3's published worst case per preset. The check is that these are real. */
const PUBLISHED = { Amber: 4.51, Violet: 4.51, Blue: 4.52, Teal: 4.5, Rose: 4.51 };

/**
 * The three-step neutral ramp per surface and mode. Soft is the documented
 * exception (§2.2) — it lifts the dark ramp and brightens the light one.
 * `card` is a pure neutral in light mode in both variants, hence the flag.
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

// ---------- sweep ----------

const rows = [];
for (const [preset, [bh, bc, lightL]] of Object.entries(PRESETS)) {
  for (const [surface, [sh, sc]] of Object.entries(SURFACES)) {
    for (const mode of ["light", "dark"]) {
      const raw = toLinearSrgb(mode === "light" ? lightL : DARK_BRAND_L, bc, bh);
      const brand = clampToGamut(raw);
      for (const [step, L, neutral] of ramp(surface, mode)) {
        rows.push({
          preset, surface, mode, step,
          ratio: contrast(brand, toLinearSrgb(L, neutral ? 0 : sc, neutral ? 0 : sh)),
          clamped: !inGamut(raw),
        });
      }
    }
  }
}

let ok = true;

// 1. the floor
const failures = rows.filter((r) => r.ratio < FLOOR);
console.log(`Contrast floor — ${rows.length} combinations, floor ${FLOOR}:1\n`);
if (failures.length === 0) {
  console.log("  all clear");
} else {
  ok = false;
  for (const r of failures.sort((a, b) => a.ratio - b.ratio)) {
    console.log(`  FAIL  ${`${r.preset}/${r.surface}/${r.mode}/${r.step}`.padEnd(32)} ${r.ratio.toFixed(2)}`);
  }
}

// 2. §2.3's table is not decorative — check every published figure
console.log("\n§2.3 published worst case per preset\n");
for (const preset of Object.keys(PRESETS)) {
  const worst = rows
    .filter((r) => r.preset === preset)
    .reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const match = Math.abs(worst.ratio - PUBLISHED[preset]) < 0.005;
  if (!match) ok = false;
  console.log(
    `  ${preset.padEnd(7)} published ${PUBLISHED[preset].toFixed(2)}   measured ${worst.ratio.toFixed(2)}` +
      `   ${match ? "match" : "MISMATCH"}   at ${worst.mode}/${worst.surface}/${worst.step}`
  );
}

// 3. how much of the sweep needed the clamp — the assumption that was unstated
const clamped = new Set(rows.filter((r) => r.clamped).map((r) => `${r.preset}/${r.surface}/${r.mode}`));
console.log(`\n${clamped.size} preset x surface x mode combinations land out of gamut and are clamped.`);
console.log("Dark mode uses one lightness for every preset and passes throughout.");

// =====================================================================
// The fixed colours — status (§2.4) and actor identity (§2.5)
// =====================================================================
//
// These are not themeable, so they have to clear the floor on EVERY surface,
// not just the shipping one. Values derived by
// design-brief/status-identity-solve.mjs; this is the check that keeps them
// honest. Two of the status values were recalibrated on 2026-08-19 for the
// same reason the brand presets were — see DD-010.

const STATUS = {
  success:  { dark: [0.78, 0.16, 155], light: [0.498, 0.15, 155] },
  warning:  { dark: [0.80, 0.14, 75],  light: [0.42, 0.12, 70] },
  approval: { dark: [0.78, 0.15, 310], light: [0.47, 0.14, 310] },
  danger:   { dark: [0.70, 0.19, 22],  light: [0.548, 0.226, 27] },
  info:     { dark: [0.78, 0.12, 255], light: [0.42, 0.13, 255] },
};

/** Text on a solid status fill. Flips with the mode — §2.4. */
const ON_SOLID = { dark: [0.16, 0, 0], light: [0.985, 0, 0] };

const IDENTITY_HUES = [50, 135, 185, 235, 285, 335];
const IDENTITY = {
  dark: IDENTITY_HUES.map((h) => [0.78, 0.13, h]),
  light: IDENTITY_HUES.map((h) => [0.48, 0.13, h]),
};

const IDENTITY_MIN_STATUS_GAP = 20;

const hueGap = (a, b) => {
  const d = ((a - b) % 360 + 360) % 360;
  return Math.min(d, 360 - d);
};

/** Every ground a fixed colour can land on, in one mode: 4 surfaces x 3 steps. */
function grounds(mode) {
  const out = [];
  for (const [name, [sh, sc]] of Object.entries(SURFACES)) {
    ramp(name, mode).forEach(([step, L, neutral]) => {
      out.push({ label: `${name}/${step}`, rgb: clampToGamut(toLinearSrgb(L, neutral ? 0 : sc, neutral ? 0 : sh)) });
    });
  }
  return out;
}

function worstOnGrounds(value, mode) {
  const fg = clampToGamut(toLinearSrgb(...value));
  let worst = Infinity, where = "";
  for (const g of grounds(mode)) {
    const v = contrast(fg, g.rgb);
    if (v < worst) { worst = v; where = g.label; }
  }
  return { worst, where };
}

console.log("\n§2.4 status colours — fixed, so measured on every surface\n");
for (const [name, byMode] of Object.entries(STATUS)) {
  for (const mode of ["light", "dark"]) {
    const { worst, where } = worstOnGrounds(byMode[mode], mode);
    if (worst < FLOOR) ok = false;
    console.log(
      `  ${(name + "/" + mode).padEnd(16)} ${worst.toFixed(2)}` +
        `  ${worst >= FLOOR ? "ok" : "FAIL at " + where}`
    );
  }
}

console.log("\n  text on a solid status fill\n");
for (const mode of ["light", "dark"]) {
  let worst = Infinity, which = "";
  for (const [name, byMode] of Object.entries(STATUS)) {
    const v = contrast(
      clampToGamut(toLinearSrgb(...ON_SOLID[mode])),
      clampToGamut(toLinearSrgb(...byMode[mode]))
    );
    if (v < worst) { worst = v; which = name; }
  }
  if (worst < FLOOR) ok = false;
  console.log(`  ${mode.padEnd(6)} ${worst.toFixed(2)}  ${worst >= FLOOR ? "ok" : "FAIL"}  worst on ${which}`);
}

console.log("\n§2.5 actor identity — Identity Is Not Status, and legible on every surface\n");

// the 20-degree rule, against every status hue in either mode
const statusHues = [...new Set(
  Object.values(STATUS).flatMap((m) => [m.light[2], m.dark[2]])
)];
let gapOk = true;
for (const h of IDENTITY_HUES) {
  const closest = statusHues.reduce((a, s) => (hueGap(h, s) < a[1] ? [s, hueGap(h, s)] : a), [0, 999]);
  if (closest[1] < IDENTITY_MIN_STATUS_GAP) { gapOk = false; ok = false; }
  console.log(
    `  hue ${String(h).padStart(3)}  nearest status hue ${String(closest[0]).padStart(3)} at ${String(closest[1]).padStart(3)}°` +
      `  ${closest[1] >= IDENTITY_MIN_STATUS_GAP ? "ok" : "TOO CLOSE"}`
  );
}

// mutual separation — the property identity exists for
let minPair = Infinity;
for (let i = 0; i < IDENTITY_HUES.length; i++)
  for (let j = i + 1; j < IDENTITY_HUES.length; j++)
    minPair = Math.min(minPair, hueGap(IDENTITY_HUES[i], IDENTITY_HUES[j]));
console.log(`\n  closest two identities: ${minPair}° apart`);

for (const mode of ["light", "dark"]) {
  const worst = IDENTITY[mode].reduce((a, v) => {
    const w = worstOnGrounds(v, mode);
    return w.worst < a.worst ? { ...w, hue: v[2] } : a;
  }, { worst: Infinity, where: "", hue: 0 });
  if (worst.worst < FLOOR) ok = false;
  console.log(
    `  ${mode.padEnd(6)} worst mark on any surface ${worst.worst.toFixed(2)}` +
      `  ${worst.worst >= FLOOR ? "ok" : "FAIL"}  (hue ${worst.hue} at ${worst.where})`
  );
}
console.log(
  "\n  The mark is measured on the surface, not on a tint of its own hue —\n" +
  "  §2.5 explains why that form was rejected (it tops out at 3.91 in dark)."
);

console.log(ok ? "\nOK\n" : "\nFAILED\n");
process.exit(ok ? 0 : 1);
