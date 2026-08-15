import { DAEMON_API_BASE } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import {
  SECRET_CLOUD_DAEMON_TOKEN,
  SECRET_CLOUD_RUNTIME_ID,
  SECRET_CLOUD_WORKSPACE_ID,
  deleteSecret,
  getSecret,
  setSecret,
} from "../secrets/secret-store.js";

/**
 * M3 — the only place core makes an authenticated request to the control
 * plane, and the only place the daemon token is read.
 *
 * Unpaired is a NORMAL state, not an error. A machine nobody has paired yet
 * boots, serves its own API, and runs agents exactly as it did before M3
 * existed. Nothing here may reject into core's startup path: the cloud is a
 * capability this daemon gained, not a dependency it acquired.
 *
 * The token is never logged, at any level, including in error paths.
 */

/** 401/403 from the control plane. Separated so callers can stop, not retry. */
export class CloudAuthError extends Error {
  /** True when the owner revoked this pairing (403) rather than it being wrong (401). */
  readonly revoked: boolean;
  constructor(message: string, revoked: boolean) {
    super(message);
    this.name = "CloudAuthError";
    this.revoked = revoked;
  }
}

/** Any non-auth failure: unreachable host, timeout, 5xx after retries, 4xx. */
export class CloudRequestError extends Error {
  readonly status: number | null;
  readonly reason: string | null;
  constructor(message: string, status: number | null, reason: string | null = null) {
    super(message);
    this.name = "CloudRequestError";
    this.status = status;
    this.reason = reason;
  }
}

export interface PairingState {
  token: string;
  runtimeId: string;
  workspaceId: string;
}

/**
 * In-process cache of the pairing, so a 30s heartbeat is not decrypting a file
 * every time. `null` means "not loaded yet"; a loaded-but-absent pairing is
 * represented by `loaded === true` with `cached === null`.
 */
let cached: PairingState | null = null;
let loaded = false;

function load(): PairingState | null {
  if (loaded) return cached;
  const token = getSecret(SECRET_CLOUD_DAEMON_TOKEN);
  const runtimeId = getSecret(SECRET_CLOUD_RUNTIME_ID);
  const workspaceId = getSecret(SECRET_CLOUD_WORKSPACE_ID);
  // All three or nothing. A token with no runtime id is a half-written pairing
  // that would authenticate but never identify itself; treating it as unpaired
  // makes `sparstrow pair` the fix instead of a confusing partial state.
  cached = token && runtimeId && workspaceId ? { token, runtimeId, workspaceId } : null;
  loaded = true;
  return cached;
}

/** Drop the in-memory copy so the next call re-reads the encrypted store. */
export function invalidatePairingCache(): void {
  cached = null;
  loaded = false;
}

export function isPaired(): boolean {
  return load() !== null;
}

export function getRuntimeId(): string | null {
  return load()?.runtimeId ?? null;
}

export function getWorkspaceId(): string | null {
  return load()?.workspaceId ?? null;
}

export function savePairing(state: PairingState): void {
  setSecret(SECRET_CLOUD_DAEMON_TOKEN, state.token);
  setSecret(SECRET_CLOUD_RUNTIME_ID, state.runtimeId);
  setSecret(SECRET_CLOUD_WORKSPACE_ID, state.workspaceId);
  cached = state;
  loaded = true;
}

export function clearPairing(): void {
  deleteSecret(SECRET_CLOUD_DAEMON_TOKEN);
  deleteSecret(SECRET_CLOUD_RUNTIME_ID);
  deleteSecret(SECRET_CLOUD_WORKSPACE_ID);
  invalidatePairingCache();
}

export interface CloudFetchOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Omit the bearer token — only /pair, whose credential is the pairing code. */
  anonymous?: boolean;
  timeoutMs?: number;
  /** Attempts after the first. 5xx and network errors only; never 4xx. */
  retries?: number;
  baseUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One authenticated request to the control plane.
 *
 * Retries bounded and only where retrying can help: a network error or a 5xx.
 * A 4xx is the server saying "this request is wrong", and repeating it wastes
 * time; a 403 in particular means the owner revoked this machine, so retrying
 * turns a deliberate revocation into a request loop against the control plane.
 */
export async function cloudFetch<T>(path: string, options: CloudFetchOptions = {}): Promise<T> {
  const {
    method = "POST",
    body,
    anonymous = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    baseUrl = config.cloudUrl,
  } = options;

  let token: string | null = null;
  if (!anonymous) {
    const pairing = load();
    if (!pairing) {
      throw new CloudAuthError("This machine is not paired to a workspace.", false);
    }
    token = pairing.token;
  }

  const url = `${baseUrl}${DAEMON_API_BASE}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Network-level: unreachable, DNS, or the timeout above firing. Expected
      // on a laptop; the caller decides whether to care.
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      const revoked = response.status === 403;
      // A rejected token in memory is worse than no token: after re-pairing,
      // a stale cache would keep presenting the dead one forever.
      invalidatePairingCache();
      throw new CloudAuthError(
        await messageFrom(response, revoked ? "This machine's pairing was revoked." : "The daemon token was rejected."),
        revoked,
      );
    }

    if (response.status >= 500) {
      lastError = new CloudRequestError(`Control plane returned ${response.status}.`, response.status);
      continue;
    }

    if (!response.ok) {
      const { message, reason } = await detailFrom(response);
      throw new CloudRequestError(message, response.status, reason);
    }

    return (await response.json()) as T;
  }

  throw new CloudRequestError(
    `Could not reach the control plane at ${baseUrl}: ${lastError?.message ?? "unknown error"}`,
    lastError instanceof CloudRequestError ? lastError.status : null,
  );
}

async function detailFrom(response: Response): Promise<{ message: string; reason: string | null }> {
  try {
    const parsed = (await response.json()) as { error?: string; reason?: string };
    return {
      message: parsed?.error || `Control plane returned ${response.status}.`,
      reason: parsed?.reason ?? null,
    };
  } catch {
    return { message: `Control plane returned ${response.status}.`, reason: null };
  }
}

async function messageFrom(response: Response, fallback: string): Promise<string> {
  const { message } = await detailFrom(response);
  return message || fallback;
}

/**
 * Log a state transition, not every attempt.
 *
 * A laptop offline overnight produces one line here, not a thousand. Callers
 * hold the boolean; this only decides what to say when it flips.
 */
export function logConnectivityTransition(nowHealthy: boolean, detail?: string): void {
  if (nowHealthy) {
    logger.info("cloud control plane reachable again");
  } else {
    logger.warn({ detail }, "cloud control plane unreachable — retrying in the background");
  }
}
