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
import { PROVIDER_AUTH_ENV_KEYS, ambientProviderKeys, discoverProviderEnv } from "./provider-env.js";

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
  // Where the Claude Code CLI finds its own config. A path, not a credential,
  // and identical however the daemon was launched.
  //
  // `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` used to sit here and
  // have moved into `provider-env.ts`'s anthropic group. They choose which
  // endpoint a credential is spent against, so resolving them from a different
  // source than the credential itself is the exact mix this rewrite removes.
  "CLAUDE_CONFIG_DIR",
] as const;

/**
 * Provider auth now comes from `provider-env.ts`, NOT from `process.env`.
 *
 * It used to be a slice of this allowlist read off the daemon's own inherited
 * environment, which made a run's credentials depend on how the daemon happened
 * to be launched. From Explorer it works; from a shell exporting
 * `ANTHROPIC_BASE_URL` — every agent session sets one — the daemon forwarded
 * that proxy to each `claude` child and every turn failed auth, reported as
 * "the provider timed out" 120 seconds later. See `provider-env.ts` for the
 * full account and `G-27`'s retraction for what it cost.
 */

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

  // OS/runtime essentials still come from this process: PATH, USERPROFILE and
  // friends describe the machine, are identical however the daemon started,
  // and are not credentials.
  for (const key of RUNTIME_ENV_KEYS) {
    const value = process.env[key];
    if (value != null) env[key] = value;
  }

  // Provider credentials come from the user's persistent configuration, so a
  // run's auth does not depend on the daemon's launch context.
  const discovered = discoverProviderEnv();
  for (const [key, value] of Object.entries(discovered.values)) {
    env[key] = value;
  }

  const ambient = ambientProviderKeys(discovered);
  if (ambient.length > 0) {
    // Worth a line every spawn: this is the state in which a turn can fail for
    // reasons the machine's owner cannot see, and silence here is exactly what
    // made the original misdiagnosis possible.
    console.warn(
      `[env] provider credentials inherited from this process rather than your ` +
        `saved settings: ${ambient.join(", ")}. They depend on how the daemon was ` +
        `started and may differ from what you configured.`,
    );
  }

  for (const [key, value] of Object.entries(extraEnv)) {
    if (value != null) env[key] = value;
  }
  return env;
}
