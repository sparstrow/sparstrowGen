import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { DEFAULT_PORT, DEFAULT_VAULT_PATH } from "@sparstrow/shared";

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = findRepoRoot(here);

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  tmpDir: string;
  logDir: string;
  /**
   * EC2 (P7): where core-only secrets (the GitHub PAT) live — an ENCRYPTED file
   * OUTSIDE dataDir, because the DB/settings/token in dataDir sit in files any
   * Bash/Read-capable agent could open. Defaults to ~/.sparstrow (never under
   * dataDir); override with SPARSTROW_SECRETS_DIR. Never handed to an agent.
   */
  secretsDir: string;
  /** Where generated per-agent SKILL.md projections are written on disk. */
  agentsDir: string;
  vaultPath: string;
  claudePath: string;
  /** P8.1 Antigravity CLI binary (`agy`). Override with SPARSTROW_ANTIGRAVITY_PATH. */
  antigravityPath: string;
  /** git binary for read-only project state (P4). Override with SPARSTROW_GIT_PATH. */
  gitPath: string;
  /** P8 direct-API base URLs (overridable for tests / self-hosting / proxies). */
  anthropicApiBase: string;
  ollamaHost: string;
  /** Bundled stdio MCP server agents call for memory/task/message tools. */
  memoryMcpPath: string;
  /** Bundled CLI for agents without MCP support (antigravity). */
  memoryCliPath: string;
  modelCacheDir: string;
  /** Per-install secret required on /api + /ws (closes the no-auth RCE). */
  apiToken: string;
  /** Git author/committer email for agent commits; the per-agent NAME is
   *  derived at spawn so commits are attributable to a specific agent.
   *  Override with SPARSTROW_AGENT_EMAIL. */
  agentEmail: string;
}

/**
 * Per-install API token. Created once under the data dir with exclusive-create
 * (`wx`) so the core and the vite dev proxy never race to write different
 * tokens. Override with SPARSTROW_TOKEN. The auth hook validates it; the server
 * injects it into the served UI; the vite dev proxy reads the same file.
 */
function loadOrCreateToken(dataDir: string): string {
  const envToken = process.env.SPARSTROW_TOKEN;
  if (envToken && envToken.length >= 16) return envToken;
  const tokenPath = path.join(dataDir, ".api-token");
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const fd = fs.openSync(tokenPath, "wx", 0o600);
    const token = crypto.randomBytes(32).toString("hex");
    fs.writeSync(fd, token);
    fs.closeSync(fd);
    return token;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    return fs.readFileSync(tokenPath, "utf8").trim();
  }
}

function resolveConfig(): AppConfig {
  const dataDir = process.env.SPARSTROW_DATA_DIR ?? path.join(repoRoot, "data");
  const vaultPath = process.env.SPARSTROW_VAULT ?? DEFAULT_VAULT_PATH;
  return {
    port: Number(process.env.SPARSTROW_PORT ?? DEFAULT_PORT),
    host: process.env.SPARSTROW_HOST ?? "127.0.0.1",
    dataDir,
    dbPath: path.join(dataDir, "sparstrow.db"),
    tmpDir: path.join(dataDir, "tmp"),
    logDir: path.join(dataDir, "logs"),
    agentsDir: path.join(dataDir, "agents"),
    secretsDir: process.env.SPARSTROW_SECRETS_DIR ?? path.join(os.homedir(), ".sparstrow"),
    vaultPath,
    claudePath: process.env.SPARSTROW_CLAUDE_PATH ?? "claude",
    antigravityPath: process.env.SPARSTROW_ANTIGRAVITY_PATH ?? "agy",
    gitPath: process.env.SPARSTROW_GIT_PATH ?? "git",
    anthropicApiBase: (process.env.SPARSTROW_ANTHROPIC_API_BASE ?? "https://api.anthropic.com").replace(/\/+$/, ""),
    ollamaHost: (process.env.SPARSTROW_OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/+$/, ""),
    memoryMcpPath:
      process.env.SPARSTROW_MEMORY_MCP ??
      path.join(repoRoot, "packages", "memory-mcp", "dist", "index.cjs"),
    memoryCliPath:
      process.env.SPARSTROW_MEMORY_CLI ??
      path.join(repoRoot, "packages", "memory-cli", "dist", "index.cjs"),
    modelCacheDir: path.join(dataDir, "models"),
    apiToken: loadOrCreateToken(dataDir),
    agentEmail: process.env.SPARSTROW_AGENT_EMAIL ?? "agent@sparstrow.com",
  };
}

export const config: AppConfig = resolveConfig();

export function ensureDirs(): void {
  for (const dir of [config.dataDir, config.tmpDir, config.logDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
