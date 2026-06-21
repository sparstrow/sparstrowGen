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
  "gemini-cli": ["gemini-2.5-pro", "gemini-2.5-flash"],
};

export const MEMORY_INJECTION_MAX_CHARS = 8000;
export const MEMORY_INJECTION_TOP_K = 8;
