import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  vaultPath: string;
  claudePath: string;
  geminiPath: string;
  /** Bundled stdio MCP server agents call for memory/task/message tools. */
  memoryMcpPath: string;
  /** Bundled CLI for agents without MCP support (gemini). */
  memoryCliPath: string;
  modelCacheDir: string;
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
    vaultPath,
    claudePath: process.env.SPARSTROW_CLAUDE_PATH ?? "claude",
    geminiPath: process.env.SPARSTROW_GEMINI_PATH ?? "gemini",
    memoryMcpPath:
      process.env.SPARSTROW_MEMORY_MCP ??
      path.join(repoRoot, "packages", "memory-mcp", "dist", "index.cjs"),
    memoryCliPath:
      process.env.SPARSTROW_MEMORY_CLI ??
      path.join(repoRoot, "packages", "memory-cli", "dist", "index.cjs"),
    modelCacheDir: path.join(dataDir, "models"),
  };
}

export const config: AppConfig = resolveConfig();

export function ensureDirs(): void {
  for (const dir of [config.dataDir, config.tmpDir, config.logDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
