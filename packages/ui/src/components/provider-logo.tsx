import { siAnthropic, siClaudecode, siDeepseek, siGooglegemini, siMistralai, siOllama, siQwen } from "simple-icons";
import type { SimpleIcon } from "simple-icons";
import { cn } from "@/lib/utils";

/**
 * Capability string -> brand mark. Sourced from `simple-icons` (CC0 1.0
 * Universal), never copied from a competitor's own vendored copies of the
 * same marks — see `design-system/DECISIONS.md` DD-016 for the full sourcing
 * reasoning and DD-017 for why each mark keeps its real hex rather than
 * rendering monochrome.
 *
 * A default export, not a hook into `@sparstrow/shared` — `ProviderLogo`
 * takes this map as an overridable prop (below) so the component itself
 * stays generic per DD-015's test ("would this make sense in a different
 * product"), even though the keys here happen to be Sparstrowgen's own
 * capability vocabulary.
 *
 * `antigravity` has no entry: no safe mark exists to source (too new for
 * simple-icons, and no other CC0/permissively-licensed source was found).
 * `ProviderLogo` falls back to a neutral placeholder glyph for it and for
 * any capability string with no entry here.
 */
export const DEFAULT_PROVIDER_ICONS: Record<string, { label: string; icon: SimpleIcon }> = {
  "claude-code": { label: "Claude Code", icon: siClaudecode },
  "anthropic-api": { label: "Anthropic API", icon: siAnthropic },
  ollama: { label: "Ollama", icon: siOllama },
  qwen: { label: "Qwen", icon: siQwen },
  deepseek: { label: "DeepSeek", icon: siDeepseek },
  gemini: { label: "Gemini", icon: siGooglegemini },
  mistral: { label: "Mistral", icon: siMistralai },
};

/**
 * A provider's brand mark on a small fixed-white chip. The chip — not the
 * app's own `--accent`/`--secondary` surface — is what makes every mark's
 * real hex legible regardless of the app's theme: two of the marks above
 * (Anthropic, Ollama) are near-black and would vanish on a dark tile
 * otherwise. DD-017 has the full reasoning, including why this is a
 * structural workaround rather than per-hex contrast verification.
 */
export function ProviderLogo({
  capability,
  size = 14,
  className,
  icons = DEFAULT_PROVIDER_ICONS,
}: {
  capability: string;
  size?: number;
  className?: string;
  icons?: Record<string, { label: string; icon: SimpleIcon }>;
}) {
  const entry = icons[capability];
  const chip = size + 6;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md bg-white", className)}
      style={{ width: chip, height: chip }}
      title={entry?.label ?? capability}
      aria-hidden="true"
    >
      {entry ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={`#${entry.icon.hex}`}>
          <path d={entry.icon.path} />
        </svg>
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-muted-foreground"
        >
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      )}
    </span>
  );
}

/** The label a capability string renders as, falling back to the raw string
 *  for anything `DEFAULT_PROVIDER_ICONS` doesn't know about. */
export function providerLabel(capability: string, icons = DEFAULT_PROVIDER_ICONS): string {
  return icons[capability]?.label ?? capability;
}
