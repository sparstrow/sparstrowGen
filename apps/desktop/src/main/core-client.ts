import fs from "node:fs";
import path from "node:path";

/**
 * Minimal authed HTTP client for the core, used by the shell (tray, updater).
 * The per-install token lives at <dataDir>/.api-token — written by core on
 * first boot; the shell reads the same file (SPARSTROW_TOKEN wins if set).
 */

const CORE_URL = process.env.SPARSTROW_CORE_URL ?? "http://127.0.0.1:48750";

let cachedToken: string | null = null;

export function coreUrl(): string {
  return CORE_URL;
}

export function readApiToken(dataDir: string): string | null {
  const env = process.env.SPARSTROW_TOKEN;
  if (env && env.length >= 16) return env;
  if (cachedToken) return cachedToken;
  try {
    cachedToken = fs.readFileSync(path.join(dataDir, ".api-token"), "utf8").trim() || null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

let tokenDataDir: string | null = null;

/** Called once at startup with the resolved data dir (packaged or repo). */
export function configureCoreClient(dataDir: string): void {
  tokenDataDir = dataDir;
}

export async function coreFetch(
  apiPath: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = tokenDataDir ? readApiToken(tokenDataDir) : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${CORE_URL}/api/v1${apiPath}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 5000),
  });
}
