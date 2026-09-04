import { execFileSync } from "node:child_process";

/**
 * Where a provider CLI's credentials come from when we spawn one.
 *
 * ## The bug this exists to remove
 *
 * `agentChildEnv` used to read these keys straight off `process.env`, which
 * means the credentials handed to `claude` depended on **how the daemon
 * happened to be launched**. Launched from Explorer it inherits the user's
 * persistent environment and works. Launched from a shell that exports
 * `ANTHROPIC_BASE_URL` — every Claude Code agent session sets one — the daemon
 * forwards that proxy URL to every `claude` child, and each of them fails
 * authentication for a reason that has nothing to do with the user's setup.
 *
 * That failure is close to undiagnosable from the outside: the CLI retries a
 * 401 ten times over ~186 s, `TURN_TIMEOUT_MS` kills it at 120 s, and the owner
 * is told "the provider timed out". It cost this project a wrong diagnosis
 * published to `main` — see the retraction in `G-27`.
 *
 * ## What replaces it
 *
 * On Windows, read the **persistent** environment (the registry, `HKCU` and
 * `HKLM`) instead of this process's inherited copy. That is the same value the
 * user configured once and that every Explorer-launched app sees, so the
 * daemon's provider credentials stop depending on its own launch context.
 *
 * This is also `OQ-11`'s "models should be auto-discovered from Windows
 * environment variables" arriving at the same place from the other direction:
 * discovery and correctness want the same source of truth.
 *
 * Multica reaches the same outcome differently — it inherits `os.Environ()` and
 * layers a per-agent `CustomEnv` from its agent settings UI over the top, with a
 * blocklist protecting daemon-internal keys. Per-agent overrides are the better
 * long-term shape and are worth having; this is the half that stops the silent
 * breakage, and it does not preclude the other half.
 */

/**
 * Provider auth / endpoint configuration.
 *
 * The ONE deliberate exception to "no `*_KEY`/`*_TOKEN` reaches an agent": a
 * run's own model credential is the run's to use. The list is explicit and
 * closed — an arbitrary `AWS_SECRET_ACCESS_KEY` or the app's `SPARSTROW_TOKEN`
 * is not here, so it is stripped. Widening it is the only sanctioned way to
 * pass a new secret to agents, and it is reviewable in one place.
 */
/**
 * Provider auth / endpoint configuration, **grouped by provider**.
 *
 * The grouping is not cosmetic, and it is the part that actually fixes the bug.
 * These keys are not independent: `ANTHROPIC_BASE_URL` decides *where*
 * `CLAUDE_CODE_OAUTH_TOKEN` is spent. Resolving them key-by-key lets a token
 * from the user's saved settings be combined with an endpoint from whatever
 * shell launched the daemon, which is a credential pointed at the wrong server
 * — a guaranteed 401 assembled out of two individually-reasonable values.
 *
 * Measured on the owner's machine, and this is exactly what had been happening:
 *
 * ```
 * persistent scope : CLAUDE_CODE_OAUTH_TOKEN = sk-ant-oat01...   (works)
 * agent's shell    : ANTHROPIC_BASE_URL = https://api.anth...  and NO token
 * ```
 *
 * So a group resolves **entirely from one source or the other**, never a mix.
 */
export const PROVIDER_ENV_GROUPS = {
  anthropic: [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "AWS_REGION", // Bedrock routing for the above; a region id, not a credential
  ],
  google: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY"],
  ollama: ["OLLAMA_HOST"],
} as const satisfies Record<string, readonly string[]>;

/**
 * The flat closed list. The ONE deliberate exception to "no `*_KEY`/`*_TOKEN`
 * reaches an agent": a run's own model credential is the run's to use. An
 * arbitrary `AWS_SECRET_ACCESS_KEY` or the app's `SPARSTROW_TOKEN` is not here,
 * so it is stripped. Widening this is the only sanctioned way to pass a new
 * secret to agents, and it stays reviewable in one place.
 */
export const PROVIDER_AUTH_ENV_KEYS: readonly string[] =
  Object.values(PROVIDER_ENV_GROUPS).flat();

/** Where a discovered value came from. Reported, never guessed at later. */
export type ProviderEnvSource = "persistent" | "process" | "none";

export interface DiscoveredProviderEnv {
  values: Record<string, string>;
  /** Per key, so Settings and the logs can say where a credential came from. */
  sources: Record<string, ProviderEnvSource>;
}

/**
 * Read one registry environment scope.
 *
 * `reg query` rather than a native module: this runs a handful of times per
 * process, and adding a native dependency to the daemon is the specific thing
 * this repo is trying to stop doing (`G-64`). Returns `{}` on any failure —
 * a machine with no user environment block is normal, not an error.
 */
function readRegistryEnv(root: string, path: string): Record<string, string> {
  let raw: string;
  try {
    raw = execFileSync("reg", ["query", `${root}\\${path}`], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
      // A machine with no environment block under this key is ordinary, and
      // `reg` announces it on stderr. Inheriting that would print
      // "ERROR: The system was unable to find the specified registry key"
      // into the daemon log on every start, which is how a log stops being
      // read. The empty result below is the real answer.
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return {};
  }

  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    // "    NAME    REG_SZ    value" — the value may itself contain runs of
    // spaces, so split on the type field rather than on whitespace.
    const m = /^\s{4,}(\S(?:.*?\S)?)\s{4,}REG_(?:EXPAND_)?SZ\s{4,}(.*)$/.exec(line);
    if (!m?.[1]) continue;
    const value = (m[2] ?? "").trim();
    if (value) out[m[1]] = value;
  }
  return out;
}

let cached: DiscoveredProviderEnv | null = null;

/**
 * The provider credentials to hand a spawned CLI.
 *
 * Cached for the life of the process. A user who changes a persistent variable
 * has to restart the app, which is the same requirement Windows itself imposes
 * on every already-running process, so caching costs nothing real.
 */
export function discoverProviderEnv(): DiscoveredProviderEnv {
  if (cached) return cached;

  // Machine scope first so the user's own value wins on conflict — the same
  // precedence Windows applies when building a process environment.
  const persistent =
    process.platform === "win32"
      ? {
          ...readRegistryEnv(
            "HKLM",
            "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
          ),
          ...readRegistryEnv("HKCU", "Environment"),
        }
      : {};

  const values: Record<string, string> = {};
  const sources: Record<string, ProviderEnvSource> = {};

  for (const keys of Object.values(PROVIDER_ENV_GROUPS)) {
    // If the user configured ANY key of this provider persistently, that is the
    // configuration they intend, and the whole group comes from there. An
    // ambient value for a sibling key is discarded rather than merged — see the
    // note on PROVIDER_ENV_GROUPS for the failure that causes.
    const configuredPersistently = keys.some((k) => persistent[k]);

    for (const key of keys) {
      if (configuredPersistently) {
        const value = persistent[key];
        if (value) {
          values[key] = value;
          sources[key] = "persistent";
        } else {
          // Deliberately NOT falling back. A sibling key from another source is
          // how a good token ends up aimed at the wrong endpoint.
          sources[key] = "none";
        }
        continue;
      }

      /**
       * Nothing persistent for this provider, so an inherited value is the only
       * candidate. Kept because there is no registry on macOS or Linux, and a
       * developer running `make up` with a key exported is a real workflow.
       * The hazard was never inheritance itself — it was inheritance nobody
       * could see, so this is recorded and warned about at spawn time.
       */
      const inherited = process.env[key];
      if (inherited) {
        values[key] = inherited;
        sources[key] = "process";
      } else {
        sources[key] = "none";
      }
    }
  }

  cached = { values, sources };
  return cached;
}

/** Test seam. Never call from application code. */
export function resetProviderEnvCache(): void {
  cached = null;
}

/**
 * The keys whose value came from this process's own environment rather than the
 * user's persistent configuration — i.e. the ones that depend on how the daemon
 * was launched, and would differ if the user had started it themselves.
 */
export function ambientProviderKeys(discovered = discoverProviderEnv()): string[] {
  return Object.entries(discovered.sources)
    .filter(([, source]) => source === "process")
    .map(([key]) => key);
}
