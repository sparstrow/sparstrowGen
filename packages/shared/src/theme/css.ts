/**
 * Emits the CSS custom-property blocks for `packages/ui/src/styles/globals.css`
 * from the constants in `tokens.ts`.
 *
 * `globals.css` stays a real, readable, committed file — it is not generated at
 * build time. This function is what a test compares it against, so the two can
 * never silently disagree. Same idea as `ds.mjs check`: record, then diff.
 *
 * To regenerate after changing `tokens.ts`:
 *
 *     UPDATE_THEME_CSS=1 pnpm --filter @sparstrow/shared test
 *
 * Deliberately a snapshot-update flag rather than a standalone CLI: a `.mjs`
 * script would need `tsx` as a dependency purely to read two TypeScript files,
 * and vitest already has the loader.
 */

import { css, type Oklch } from "./colour";
import {
  BRANDS,
  BRAND_NAMES,
  IDENTITY_HUES,
  IDENTITY_CHROMA,
  IDENTITY_L,
  NEUTRALS,
  RAMP_STEPS,
  STATUS,
  STATUS_FOREGROUND,
  STATUS_NAMES,
  SURFACES,
  SURFACE_NAMES,
  SYNTAX,
  SYNTAX_ROLES,
  brandFor,
  rampFor,
  type BrandName,
  type Mode,
  type SurfaceName,
} from "./tokens";

/** Markers the test and the emitter agree on. Editing between them is futile. */
export const BLOCK_START = "/* ===== GENERATED FROM @sparstrow/shared theme — do not hand-edit ===== */";
export const BLOCK_END = "/* ===== END GENERATED ===== */";

const alpha = (l: number, a: number) => `oklch(${l} 0 0 / ${Math.round(a * 100)}%)`;

/**
 * The surface-derived half of a mode: every neutral that takes its hue and
 * chroma from the chosen surface. Written per surface class rather than from
 * five root variables, because a `var()` inside `oklch()` cannot be reused by
 * Tailwind's opacity modifier syntax — `bg-card/50` needs a resolved colour.
 */
function surfaceBlock(surface: SurfaceName, mode: Mode, indent = "  "): string {
  const ramp = rampFor(surface, mode);
  const n = NEUTRALS[mode];
  const { hue, chroma } = SURFACES[surface];
  const borderAlpha = surface === "soft" ? n.softBorderAlpha : n.borderAlpha;
  const borderBase = mode === "dark" ? 1 : 0.2;

  const lines = [
    `--background: ${css(ramp.background)};`,
    `--foreground: ${css([n.foreground, 0, 0])};`,
    `--card: ${css(ramp.card)};`,
    `--card-foreground: ${css([n.foreground, 0, 0])};`,
    `--popover: ${css(ramp.card)};`,
    `--popover-foreground: ${css([n.foreground, 0, 0])};`,
    `--muted: ${css(ramp.raised)};`,
    `--muted-foreground: ${css([n.mutedForeground, chroma, hue])};`,
    `--accent: ${css(ramp.raised)};`,
    `--accent-foreground: ${css([n.foreground, 0, 0])};`,
    `--secondary: ${css(ramp.raised)};`,
    `--secondary-foreground: ${css([n.foreground, 0, 0])};`,
    `--border: ${alpha(borderBase, borderAlpha)};`,
    `--input: ${alpha(borderBase, borderAlpha + 0.04)};`,
    `--sidebar: ${css(ramp.card)};`,
    `--sidebar-foreground: ${css([n.foreground, 0, 0])};`,
    `--sidebar-border: ${alpha(borderBase, borderAlpha)};`,
    `--sidebar-accent: ${css(ramp.raised)};`,
    `--sidebar-accent-foreground: ${css([n.foreground, 0, 0])};`,
  ];
  return lines.map((l) => indent + l).join("\n");
}

/** The brand-derived half: accent, its tint, primary, and the focus ring. */
function brandBlock(brand: BrandName, mode: Mode, indent = "  "): string {
  const value = brandFor(brand, mode);
  const [L, C, H] = value;
  const lines = [
    `--brand: ${css(value)};`,
    `--brand-foreground: ${css(mode === "dark" ? [0.16, 0, 0] : [0.985, 0, 0])};`,
    `--brand-soft: oklch(${L} ${C} ${H} / ${mode === "dark" ? 16 : 12}%);`,
    `--primary: ${css(value)};`,
    `--primary-foreground: ${css(mode === "dark" ? [0.16, 0, 0] : [0.985, 0, 0])};`,
    `--ring: ${css(value)};`,
  ];
  return lines.map((l) => indent + l).join("\n");
}

/** Status and identity: fixed in every theme, so emitted once per mode. */
function fixedBlock(mode: Mode, indent = "  "): string {
  const lines: string[] = [];
  for (const name of STATUS_NAMES) {
    lines.push(`--${name}: ${css(STATUS[name][mode])};`);
    lines.push(`--${name}-foreground: ${css(STATUS_FOREGROUND[mode])};`);
  }
  IDENTITY_HUES.forEach((hue, i) => {
    lines.push(`--identity-${i + 1}: ${css([IDENTITY_L[mode], IDENTITY_CHROMA, hue] as Oklch)};`);
  });
  for (const role of SYNTAX_ROLES) {
    lines.push(`--hl-${role}: ${css(SYNTAX[role][mode])};`);
  }
  return lines.map((l) => indent + l).join("\n");
}

/**
 * `--destructive` is kept as an alias of `--danger` because 87 call sites and
 * every shadcn primitive spell it that way. Renaming them is churn with no
 * reader benefit; the doctrine's word is "danger", the code's is "destructive",
 * and this is the one line that reconciles them.
 */
function aliasBlock(mode: Mode, indent = "  "): string {
  return [
    `--destructive: ${css(STATUS.danger[mode])};`,
    `--destructive-foreground: ${css(STATUS_FOREGROUND[mode])};`,
  ]
    .map((l) => indent + l)
    .join("\n");
}

/** The full generated region, exactly as it must appear in `globals.css`. */
export function emitThemeCss(): string {
  const out: string[] = [BLOCK_START];

  out.push("");
  out.push("/* Light is the base. The app ships dark, so `.dark` is the practical");
  out.push("   default even though the cascade treats it as the override. */");

  for (const mode of ["light", "dark"] as Mode[]) {
    const root = mode === "light" ? ":root" : ".dark";

    // default surface + default brand, so the app themes correctly with no class
    out.push("");
    out.push(`${root} {`);
    out.push(surfaceBlock("paper", mode));
    out.push(brandBlock("amber", mode));
    out.push(fixedBlock(mode));
    out.push(aliasBlock(mode));
    out.push("}");

    // one class per surface, one per brand — a class swap re-themes everything
    for (const surface of SURFACE_NAMES) {
      const sel = mode === "light" ? `:root.surface-${surface}` : `.dark.surface-${surface}`;
      out.push("");
      out.push(`${sel} {`);
      out.push(surfaceBlock(surface, mode));
      out.push("}");
    }
    for (const brand of BRAND_NAMES) {
      const sel = mode === "light" ? `:root.theme-${brand}` : `.dark.theme-${brand}`;
      out.push("");
      out.push(`${sel} {`);
      out.push(brandBlock(brand, mode));
      out.push("}");
    }
  }

  out.push("");
  out.push(BLOCK_END);
  return out.join("\n");
}

/** Pull the generated region out of a `globals.css` body, for the diff test. */
export function extractThemeCss(source: string): string | null {
  const start = source.indexOf(BLOCK_START);
  const end = source.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return null;
  return source.slice(start, end + BLOCK_END.length);
}

/** Tailwind's `@theme inline` mapping, so `bg-warning/5` resolves. */
export function emitTailwindMap(): string[] {
  const names = [
    "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
    "primary", "primary-foreground", "secondary", "secondary-foreground",
    "muted", "muted-foreground", "accent", "accent-foreground",
    "brand", "brand-foreground", "brand-soft",
    ...STATUS_NAMES.flatMap((s) => [s, `${s}-foreground`]),
    "destructive", "destructive-foreground",
    ...IDENTITY_HUES.map((_, i) => `identity-${i + 1}`),
    "border", "input", "ring",
    "sidebar", "sidebar-foreground", "sidebar-border", "sidebar-accent", "sidebar-accent-foreground",
  ];
  return names.map((n) => `  --color-${n}: var(--${n});`);
}

export { RAMP_STEPS };
