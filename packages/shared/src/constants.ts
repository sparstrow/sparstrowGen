export const DEFAULT_PORT = 48750;
export const API_BASE = "/api/v1";
export const WS_PATH = "/ws";
export const TERMINAL_WS_PATH = "/ws/terminal";

export const DEFAULT_VAULT_PATH = "C:\\Sparstrow\\memory";

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
