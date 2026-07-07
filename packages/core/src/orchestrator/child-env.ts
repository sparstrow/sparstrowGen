/**
 * EC2 (P7) — the explicit-allowlist child env every AGENT spawn uses. This is the
 * root-cause fix for the legacy `{ ...process.env, ...spec.env }` spread at the
 * three agent spawn sites (run-manager, one-shot, terminal/manager): a headless
 * agent is Bash/Read-capable, so spreading the parent env handed it every ambient
 * secret in core's process — the app's own `SPARSTROW_TOKEN` (full-API bearer),
 * the GitHub PAT, deploy `*_TOKEN`/`*_KEY`s — a one-line exfiltration channel.
 *
 * We build the child env from a curated allowlist instead. The graph engine has
 * its own tighter `graphChildEnv` (a static binary needs almost nothing); agents
 * run node/`claude`/`git`, so they need more OS + config surface — but still an
 * ENUMERATED set, never a spread. A key absent from both lists below never
 * reaches an agent. `SPARSTROW_*` is deliberately excluded wholesale: whatever a
 * run legitimately needs (SPARSTROW_RUN_ID, SPARSTROW_API, the per-agent git
 * identity) is passed explicitly through `extraEnv`, which wins over the base.
 */

/**
 * OS / language-runtime essentials — always forwarded when present. These let
 * node, the provider CLI, git and a shell start and find their own config
 * (claude reads ~/.claude via HOME/USERPROFILE; git needs PATH). None is a
 * secret; each is safe to hand any local process the user already runs.
 */
const RUNTIME_ENV_KEYS = [
  // Cross-platform
  "PATH",
  "Path", // Windows sometimes casing-normalizes to this before node re-maps it
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "COLORTERM",
  // POSIX home/user/shell
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  // Windows home/user/system
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "USERNAME",
  "USERDOMAIN",
  "APPDATA",
  "LOCALAPPDATA",
  "SYSTEMROOT",
  "SystemRoot",
  "windir",
  "SYSTEMDRIVE",
  "COMSPEC",
  "ComSpec",
  "PATHEXT",
  "TEMP",
  "TMP",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_ARCHITEW6432",
  "PROGRAMFILES",
  "PROGRAMDATA",
  // Claude Code CLI honours these for locating/selecting its own config; they
  // are switches/paths, not credentials.
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
] as const;

/**
 * Provider auth / endpoint config — forwarded when present so an agent can still
 * authenticate its own model. These are the ONE deliberate exception to "no
 * `*_KEY`/`*_TOKEN` reaches an agent": a run's own model credential is the run's
 * to use (and is commonly config-file auth via `claude login`, in which case
 * none of these is even set). The list is explicit and closed — an arbitrary
 * `AWS_SECRET_ACCESS_KEY` or the app's `SPARSTROW_TOKEN` is NOT here, so it is
 * stripped. Widening this list is the only sanctioned way to pass a new secret
 * to agents, and it is reviewable in one place.
 */
const PROVIDER_AUTH_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "AWS_REGION", // Bedrock routing (region id, not a credential)
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENAI_API_KEY",
  "OLLAMA_HOST",
] as const;

/** The union of keys that may be copied from the parent process into a child. */
export const AGENT_ENV_ALLOWLIST: readonly string[] = [
  ...RUNTIME_ENV_KEYS,
  ...PROVIDER_AUTH_ENV_KEYS,
];

/**
 * Build a child-process env for an agent spawn from the allowlist plus the
 * caller's explicit `extraEnv` (SPARSTROW_RUN_ID / SPARSTROW_API / git identity).
 * `extraEnv` always wins over an allowlisted parent value. Never spreads
 * `process.env`.
 */
export function agentChildEnv(
  extraEnv: Record<string, string | undefined> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of AGENT_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value != null) env[key] = value;
  }
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value != null) env[key] = value;
  }
  return env;
}
