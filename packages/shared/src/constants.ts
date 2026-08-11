export const DEFAULT_PORT = 48750;
export const API_BASE = "/api/v1";
export const WS_PATH = "/ws";
export const TERMINAL_WS_PATH = "/ws/terminal";

export const EMBEDDING_DIM = 384;
export const EMBEDDING_MODEL = "BGE-small-en-v1.5";

/** Vault subfolders — scope is derived from these paths. */
export const VAULT_DIRS = {
  global: "global",
  projects: "projects",
  agents: "agents",
  inbox: "inbox",
} as const;

export const DEFAULT_RUN_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_GLOBAL_CONCURRENCY = 4;

/** Known model choices per provider (free-text also allowed). */
export const KNOWN_MODELS: Record<string, string[]> = {
  "claude-code": ["opus", "sonnet", "haiku"],
  // P8.1: exact `agy models` display strings — verified as the tokens `--model`
  // accepts (agy v1.1.0). The parenthetical is the reasoning-effort tier.
  antigravity: [
    "Gemini 3.1 Pro (High)",
    "Gemini 3.1 Pro (Low)",
    "Gemini 3.5 Flash (High)",
    "Gemini 3.5 Flash (Medium)",
    "Gemini 3.5 Flash (Low)",
    "Claude Opus 4.6 (Thinking)",
    "Claude Sonnet 4.6 (Thinking)",
    "GPT-OSS 120B (Medium)",
  ],
  // P8 direct-API defaults; the live list comes from POST /providers/discover-models.
  "anthropic-api": [
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-haiku-4-5",
  ],
  ollama: ["llama3.1", "qwen2.5", "mistral"],
};

export const MEMORY_INJECTION_MAX_CHARS = 8000;
export const MEMORY_INJECTION_TOP_K = 8;

/**
 * P3 delegation limits — both are settings-backed with these defaults.
 * Depth bounds runaway recursion + cost (P3-Q4); the cross-team message limit is
 * the C10 circuit breaker (teams-arch's constant, made a setting per the gate).
 */
export const SETTING_DELEGATION_MAX_DEPTH = "delegation.maxDepth";
export const DEFAULT_DELEGATION_MAX_DEPTH = 3;
export const SETTING_CROSS_TEAM_MESSAGE_LIMIT = "delegation.crossTeamMessageLimit";
export const DEFAULT_CROSS_TEAM_MESSAGE_LIMIT = 3;

/**
 * P6 goal engine limits — settings-backed with these defaults.
 * Replan cap bounds adaptive replanning (cap hit → goal `blocked`, P1
 * escalation); planner-retry cap bounds the bounce-back loop within ONE
 * planning round (unusable output after retries → goal `blocked` with the
 * diagnostic); the node cap bounds plan size (assumption: plans ≤ ~20 nodes).
 */
export const SETTING_GOAL_REPLAN_LIMIT = "goal.replanLimit";
export const DEFAULT_GOAL_REPLAN_LIMIT = 3;
export const SETTING_GOAL_PLANNER_RETRY_LIMIT = "goal.plannerRetryLimit";
export const DEFAULT_GOAL_PLANNER_RETRY_LIMIT = 2;
export const GOAL_MAX_PLAN_NODES = 30;

/**
 * OQ-1 — WIP snapshots. When a run ends, core records the project's working
 * tree as a git object under `refs/sparstrow/wip/<runId>` so an agent's
 * uncommitted edits survive a crash, a cancel, or a careless `git checkout`.
 *
 * The snapshot is written with plumbing (write-tree + commit-tree + update-ref)
 * against a THROWAWAY index, so it never moves HEAD, never touches the real
 * index, never creates a branch, and is never pushed. `git status` reads
 * identically before and after.
 *
 * Default ON: the setting only pays out when something has already gone wrong,
 * and the person who most needs it is the one who never thought to enable it.
 * Off is one toggle away, and turning it off leaves existing snapshots intact.
 */
export const SETTING_WIP_SNAPSHOT = "git.wipSnapshot";
export const DEFAULT_WIP_SNAPSHOT = true;
/** Snapshots retained per repository; the oldest refs are pruned past this. */
export const SETTING_WIP_SNAPSHOT_KEEP = "git.wipSnapshotKeep";
export const DEFAULT_WIP_SNAPSHOT_KEEP = 50;
/**
 * Deliberately NOT under `refs/heads/` — a ref there is a branch: it shows in
 * `git branch`, tab-completes, and matches the default `push` refspec. Under a
 * private hierarchy it is inert unless someone goes looking for it.
 */
export const WIP_SNAPSHOT_REF_PREFIX = "refs/sparstrow/wip/";

/**
 * Both readers of the setting live here so they cannot drift. Core decides
 * whether to take a snapshot; the settings UI decides where to draw the switch.
 * If those two disagreed, the toggle would misreport its own state — the single
 * worst failure mode for a control whose whole job is to be trusted.
 */
const WIP_SNAPSHOT_OFF_WORDS = ["off", "false", "0", "no"];

export function isWipSnapshotEnabled(raw: string | null | undefined): boolean {
  if (raw == null) return DEFAULT_WIP_SNAPSHOT;
  // Only an explicit falsey word disables it: a malformed value must not
  // silently switch off a data-protection feature.
  return !WIP_SNAPSHOT_OFF_WORDS.includes(raw.trim().toLowerCase());
}

export function resolveWipSnapshotKeep(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIP_SNAPSHOT_KEEP;
}
