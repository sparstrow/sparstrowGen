// Derives the colour values DESIGN.md §2.4 and §2.5 specify but never gave:
// the APPROVAL status, and the six ACTOR IDENTITY hues. Also re-measures the
// four status colours §2.4 already publishes, against the whole ramp.
//
//   node design-brief/status-identity-solve.mjs
//
// This is the missing half of doc/KnownGaps.md G-21. §2.4 says approval is
// "hue 310, values owed"; §2.5 states a 20-degree separation rule and names no
// hues at all. Both were left unmeasured on purpose rather than published from
// an unvalidated model, and this script is what stops them being guessed.
//
// Zero dependencies, Node 18+. Once its output is in the doctrine,
// design-brief/contrast-check.mjs verifies it on every run and phase D2.1
// promotes both into pnpm test. Do not wire CI to this file — it is a solver.
//
// Measurement basis is DESIGN.md §2.3's: OKLCH -> OKLab -> linear sRGB,
// CLAMPED to [0,1], then WCAG 2.x relative luminance.

// ---------- colour ----------

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
const clamp = (rgb) => rgb.map((v) => Math.min(1, Math.max(0, v)));
const paint = (L, C, H) => clamp(toLinearSrgb(L, C, H));
const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Alpha compositing in linear light — how a /15 tint actually lands. */
const over = (fg, bg, alpha) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
/** Shortest angular distance between two hues, in degrees. */
const hueGap = (a, b) => {
  const d = ((a - b) % 360 + 360) % 360;
  return Math.min(d, 360 - d);
};

// ---------- the surfaces a fixed colour has to survive ----------

const SURFACES = { Paper: [85, 0.01], Slate: [250, 0.011], Soft: [280, 0.007], Mono: [0, 0] };
const STEPS = ["bg", "card", "raised"];

const ramp = (surface, mode) => {
  const soft = surface === "Soft";
  if (mode === "dark") return soft ? [0.19, 0.228, 0.268] : [0.145, 0.195, 0.245];
  return soft ? [0.965, 0.995, 0.935] : [0.985, 1, 0.955];
};

/** Every ground a fixed (non-themeable) colour can land on, in one mode. */
function grounds(mode) {
  const out = [];
  for (const [name, [sh, sc]] of Object.entries(SURFACES)) {
    ramp(name, mode).forEach((L, i) => {
      // light-mode `card` is a pure neutral in both ramp variants
      const neutral = mode === "light" && i === 1;
      out.push({
        label: `${name}/${STEPS[i]}`,
        rgb: paint(L, neutral ? 0 : sc, neutral ? 0 : sh),
      });
    });
  }
  return out;
}

const FLOOR = 4.5;
const TINT_ALPHA = 0.15;

/** Worst contrast of a colour across every ground in a mode. */
function worstOnGrounds(L, C, H, mode, { tinted = false } = {}) {
  const fg = paint(L, C, H);
  let worst = Infinity, where = "";
  for (const g of grounds(mode)) {
    const bg = tinted ? over(fg, g.rgb, TINT_ALPHA) : g.rgb;
    const v = contrast(fg, bg);
    if (v < worst) { worst = v; where = g.label; }
  }
  return { worst, where };
}

/**
 * Search for the (L, C) closest to a family target that still clears the floor
 * on every ground. Preference order is deliberate: legibility is the gate,
 * then staying in the family's shape — a status colour that passes by going
 * grey has failed differently.
 */
function solve(hue, mode, { targetL, targetC, lo, hi, minC = 0.07, maxC = 0.26 }) {
  const passing = [];
  for (let L = lo; L <= hi + 1e-9; L += 0.002) {
    for (let C = maxC; C >= minC - 1e-9; C -= 0.002) {
      const { worst } = worstOnGrounds(L, C, hue, mode);
      if (worst >= FLOOR) passing.push({ L: +L.toFixed(3), C: +C.toFixed(3), worst });
    }
  }
  if (!passing.length) return null;
  const cost = (p) => Math.abs(p.L - targetL) * 2 + Math.abs(p.C - targetC);
  passing.sort((a, b) => cost(a) - cost(b));
  return passing[0];
}

const fmt = ([L, C, H]) => `oklch(${L} ${C} ${H})`;
const line = (s) => console.log(s);

// =====================================================================
// 1. Re-measure §2.4's four published status colours
// =====================================================================

const PUBLISHED_STATUS = {
  success: { hue: 155, dark: [0.78, 0.16], light: [0.52, 0.15] },
  warning: { hue: 75, hueLight: 70, dark: [0.8, 0.14], light: [0.42, 0.12] },
  danger: { hue: 22, hueLight: 27, dark: [0.7, 0.19], light: [0.58, 0.25] },
  info: { hue: 255, dark: [0.78, 0.12], light: [0.42, 0.13] },
};

line("1. §2.4's four published status colours, measured against all three ramp steps\n");
const statusFixes = {};
for (const [name, spec] of Object.entries(PUBLISHED_STATUS)) {
  for (const mode of ["light", "dark"]) {
    const hue = mode === "light" ? spec.hueLight ?? spec.hue : spec.hue;
    const [L, C] = spec[mode];
    const { worst, where } = worstOnGrounds(L, C, hue, mode);
    const ok = worst >= FLOOR;
    line(
      `  ${(name + "/" + mode).padEnd(15)} ${fmt([L, C, hue]).padEnd(24)}` +
        `${worst.toFixed(2)}  ${ok ? "ok" : "UNDER FLOOR"}${ok ? "" : "  worst at " + where}`
    );
    if (!ok) {
      const fix = solve(hue, mode, {
        targetL: L, targetC: C,
        lo: mode === "dark" ? 0.6 : 0.34, hi: mode === "dark" ? 0.88 : 0.62,
        minC: Math.min(C, 0.1), maxC: Math.max(C, 0.26),
      });
      const after = worstOnGrounds(fix.L, fix.C, hue, mode);
      statusFixes[`${name}/${mode}`] = { hue, from: [L, C], to: [fix.L, fix.C], worst: after.worst };
      line(`  ${" ".repeat(15)} -> ${fmt([fix.L, fix.C, hue]).padEnd(24)}${after.worst.toFixed(2)}  fixed`);
    }
  }
}
line(
  Object.keys(statusFixes).length
    ? `\n  ${Object.keys(statusFixes).length} of 8 were under the floor. Same defect class as DD-010:\n` +
      "  the raised step was never in the sweep.\n"
    : "\n  all eight clear the floor as published.\n"
);

// =====================================================================
// 2. Approval — hue 310, values owed
// =====================================================================

line("2. Approval at hue 310\n");
const APPROVAL_HUE = 310;
const approval = {};
for (const mode of ["dark", "light"]) {
  // family targets, read off the four above: bright and saturated in dark,
  // mid-dark and slightly calmer in light.
  const s = solve(APPROVAL_HUE, mode, {
    targetL: mode === "dark" ? 0.78 : 0.47,
    targetC: mode === "dark" ? 0.15 : 0.14,
    lo: mode === "dark" ? 0.6 : 0.34,
    hi: mode === "dark" ? 0.88 : 0.62,
  });
  const { worst, where } = worstOnGrounds(s.L, s.C, APPROVAL_HUE, mode);
  approval[mode] = [s.L, s.C, APPROVAL_HUE];
  line(`  ${mode.padEnd(6)} ${fmt(approval[mode]).padEnd(24)}${worst.toFixed(2)}  worst at ${where}`);
}

line("\n  text on a solid approval fill (the Badge case):");
const approvalFg = {};
for (const mode of ["dark", "light"]) {
  const solid = paint(...approval[mode]);
  const candidates = [["oklch(0.985 0 0)", [0.985, 0, 0]], ["oklch(0.16 0 0)", [0.16, 0, 0]]];
  const scored = candidates
    .map(([label, v]) => ({ label, v, ratio: contrast(paint(...v), solid) }))
    .sort((a, b) => b.ratio - a.ratio);
  approvalFg[mode] = scored[0];
  for (const c of scored) line(`    ${mode.padEnd(6)} ${c.label.padEnd(18)} ${c.ratio.toFixed(2)} ${c.ratio >= FLOOR ? "ok" : "fail"}`);
}

line("\n  hue separation from the other four statuses (why 310 was chosen):");
for (const [name, spec] of Object.entries(PUBLISHED_STATUS)) {
  const gaps = [spec.hue, spec.hueLight ?? spec.hue].map((h) => hueGap(APPROVAL_HUE, h));
  line(`    vs ${name.padEnd(8)} ${Math.min(...gaps)}°`);
}

// =====================================================================
// 3. Actor identity — six hues, none within 20° of a status hue
// =====================================================================

line("\n3. Actor identity — the Identity Is Not Status rule, solved\n");

const IDENTITY_MIN_GAP = 20;
const statusHues = [...new Set(
  Object.values(PUBLISHED_STATUS).flatMap((s) => [s.hue, s.hueLight ?? s.hue]).concat([APPROVAL_HUE])
)].sort((a, b) => a - b);

const legal = [];
for (let h = 0; h < 360; h++) {
  if (statusHues.every((s) => hueGap(h, s) >= IDENTITY_MIN_GAP)) legal.push(h);
}
const bands = [];
for (const h of legal) {
  const last = bands[bands.length - 1];
  if (last && h === last[1] + 1) last[1] = h;
  else bands.push([h, h]);
}
line(`  status hues:  ${statusHues.join(", ")}`);
line(`  ${legal.length} of 360 hues legal, in ${bands.length} bands: ${bands.map(([a, b]) => `${a}-${b}`).join(", ")}`);

/** Pick 6 legal hues maximising the smallest pairwise gap. */
function pickSix() {
  let best = null;
  for (const start of legal) {
    const chosen = [start];
    while (chosen.length < 6) {
      let pick = null, gap = -1;
      for (const h of legal) {
        if (chosen.includes(h)) continue;
        const g = Math.min(...chosen.map((c) => hueGap(h, c)));
        if (g > gap) { gap = g; pick = h; }
      }
      chosen.push(pick);
    }
    let min = Infinity;
    for (let i = 0; i < chosen.length; i++)
      for (let j = i + 1; j < chosen.length; j++) min = Math.min(min, hueGap(chosen[i], chosen[j]));
    if (!best || min > best.min) best = { hues: chosen.slice().sort((a, b) => a - b), min };
  }
  return best;
}
const picked = pickSix();
line(`  chosen:       ${picked.hues.join(", ")}   (closest pair ${picked.min}° apart)`);

// Sanity: none of them collides with a brand preset badly enough to read as
// the accent. Not required by §2.5, but worth knowing.
const BRAND_HUES = { Amber: 70, Violet: 285, Blue: 250, Teal: 190, Rose: 15 };
const brandNear = picked.hues
  .map((h) => {
    const [n, bh] = Object.entries(BRAND_HUES).reduce(
      (a, [n2, b]) => (hueGap(h, b) < a[1] ? [n2, hueGap(h, b)] : a), ["", 999]
    );
    return `${h}->${n} ${bh}°`;
  })
  .join("  ");
line(`  nearest brand preset per hue: ${brandNear}`);

line("\n  values — measured as text on every surface, in both modes:\n");
const identity = { light: [], dark: [] };
for (const mode of ["dark", "light"]) {
  for (const H of picked.hues) {
    const s = solve(H, mode, {
      targetL: mode === "dark" ? 0.78 : 0.48,
      targetC: mode === "dark" ? 0.13 : 0.13,
      lo: mode === "dark" ? 0.6 : 0.34,
      hi: mode === "dark" ? 0.88 : 0.62,
    });
    identity[mode].push([s.L, s.C, H]);
    const plain = worstOnGrounds(s.L, s.C, H, mode);
    const tinted = worstOnGrounds(s.L, s.C, H, mode, { tinted: true });
    line(
      `    ${mode.padEnd(5)} h${String(H).padStart(3)}  ${fmt([s.L, s.C, H]).padEnd(24)}` +
        `on surface ${plain.worst.toFixed(2)}   on its own /15 tint ${tinted.worst.toFixed(2)}`
    );
  }
}

// The tint column above is the finding, not a detail: §2.5 specifies "a tint
// plus its own foreground", and that form does not clear the floor. Establish
// where the ceiling actually is, so the conclusion is about arithmetic rather
// than about an unlucky hue.
//
// Note which ground is worst here. Contrast against a colour's own tint is
// WORST over the LIGHTEST ground in the mode, because the tint lifts a dark
// ground less than a light one. Measuring over the darkest ground flatters the
// result by about a full point — an easy mistake, made once while writing this.
line("\n  §2.5's specified form — a tint plus the colour's OWN foreground:\n");
const worstDarkGround = grounds("dark").reduce((a, g) =>
  (luminance(g.rgb) > luminance(a.rgb) ? g : a));
const tintOf = paint(0.78, 0.13, 185);
for (const [label, c] of [
  ["identity mark itself", [0.78, 0.13, 185]],
  ["brightest usable chroma", [0.88, 0.09, 185]],
  ["--foreground (neutral)", [0.97, 0, 0]],
]) {
  const fg = paint(...c);
  const v = contrast(fg, over(tintOf, worstDarkGround.rgb, TINT_ALPHA));
  line(`    ${label.padEnd(26)} ${v.toFixed(2)} ${v >= FLOOR ? "ok" : "UNDER"}` +
    `   on an identity /15 tint over ${worstDarkGround.label}`);
}
line("\n  So the tint is not the problem — colouring the MARK as well as the fill");
line("  is. A neutral mark on an identity tint clears the floor easily, but then");
line("  the fill is the only identity signal, and a 15% tint of one hue is hard");
line("  to tell from another at avatar size.");

// The form this repo ships instead: a neutral fill from the surface's own
// raised step, with identity carried by the mark and a ring. Both encodings
// survive, and the number that has to hold is just the identity colour on a
// surface step — already solved above.
line("\n  The form shipped instead — neutral fill, identity mark plus ring:\n");
for (const mode of ["dark", "light"]) {
  const worst = identity[mode].reduce((a, v) => {
    const w = worstOnGrounds(v[0], v[1], v[2], mode).worst;
    return w < a.w ? { w, h: v[2] } : a;
  }, { w: Infinity, h: 0 });
  line(`    ${mode.padEnd(5)} worst identity mark on any surface step: ` +
    `${worst.w.toFixed(2)} ${worst.w >= FLOOR ? "ok" : "UNDER"}  (hue ${worst.h})`);
}

// =====================================================================
// 4. Copy-paste blocks
// =====================================================================

line("\n\n4. For DESIGN.md §2.4\n");
for (const [k, v] of Object.entries(statusFixes)) {
  line(`  ${k.padEnd(15)} ${fmt([...v.from, v.hue])} -> ${fmt([...v.to, v.hue])}   ${v.worst.toFixed(2)}`);
}
line(`  approval/dark   ${fmt(approval.dark)}`);
line(`  approval/light  ${fmt(approval.light)}`);

line("\n   For DESIGN.md §2.5\n");
picked.hues.forEach((h, i) => {
  line(`  identity-${i + 1}  hue ${String(h).padStart(3)}   dark ${fmt(identity.dark[i])}   light ${fmt(identity.light[i])}`);
});

line("\n5. For globals.css\n");
line(":root {");
line(`  --approval: ${fmt(approval.light)};`);
line(`  --approval-foreground: ${approvalFg.light.label};`);
identity.light.forEach((v, i) => line(`  --identity-${i + 1}: ${fmt(v)};`));
line("}\n.dark {");
line(`  --approval: ${fmt(approval.dark)};`);
line(`  --approval-foreground: ${approvalFg.dark.label};`);
identity.dark.forEach((v, i) => line(`  --identity-${i + 1}: ${fmt(v)};`));
line("}");
