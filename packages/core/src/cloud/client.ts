import { DAEMON_API_BASE } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { randomBytes } from "node:crypto";
import {
  SECRET_CLOUD_ACCESS_TOKEN,
  SECRET_CLOUD_MACHINE_ID,
  SECRET_CLOUD_RUNTIMES,
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

/** Which runtime represents this machine in one of its owner's workspaces. */
export interface RuntimeBinding {
  runtimeId: string;
  workspaceId: string;
}

export interface ConnectionState {
  token: string;
  machineId: string;
  /** One entry per workspace the owner belongs to, as of the last claim. */
  runtimes: RuntimeBinding[];
}

/**
 * In-process cache of the connection, so a 30s heartbeat is not decrypting a
 * file every time. `null` means "not loaded yet"; a loaded-but-absent
 * connection is `loaded === true` with `cached === null`.
 */
let cached: ConnectionState | null = null;
let loaded = false;

function parseRuntimes(raw: string | null): RuntimeBinding[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RuntimeBinding =>
        !!r && typeof r.runtimeId === "string" && typeof r.workspaceId === "string",
    );
  } catch {
    // A corrupt map is recoverable: the next claim rewrites it. Treating it as
    // empty means this machine reports itself as connected-but-unplaced rather
    // than refusing to start.
    return [];
  }
}

function load(): ConnectionState | null {
  if (loaded) return cached;
  const token = getSecret(SECRET_CLOUD_ACCESS_TOKEN);
  const machineId = getSecret(SECRET_CLOUD_MACHINE_ID);
  // Both, or nothing. A token with no machine id is a half-written connection
  // that would authenticate but never identify itself.
  //
  // The runtime map is deliberately NOT part of that test: an empty map is a
  // real, legitimate state (claimed, but the owner's first workspace has not
  // been bootstrapped yet), and treating it as unconnected would make the
  // machine re-run setup for a situation that resolves itself on the next
  // claim.
  cached =
    token && machineId
      ? { token, machineId, runtimes: parseRuntimes(getSecret(SECRET_CLOUD_RUNTIMES)) }
      : null;
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

/**
 * This computer's stable id, minted on first use and then never changed.
 *
 * Generated here rather than by the server so that signing out and back in —
 * or moving the machine to another account — lands on the same `machines` row
 * instead of leaving a duplicate computer behind in the owner's list every
 * time. Survives `clearConnection` for exactly that reason.
 */
export function getOrCreateMachineId(): string {
  const existing = getSecret(SECRET_CLOUD_MACHINE_ID);
  if (existing) return existing;
  const id = `mach_${randomBytes(16).toString("hex")}`;
  setSecret(SECRET_CLOUD_MACHINE_ID, id);
  return id;
}

export function getMachineId(): string | null {
  return load()?.machineId ?? getSecret(SECRET_CLOUD_MACHINE_ID);
}

/** Every workspace this machine currently serves. */
export function getRuntimes(): RuntimeBinding[] {
  return load()?.runtimes ?? [];
}

/**
 * The runtime to use when a caller has not named a workspace.
 *
 * Most of core's cloud loops predate this machine serving more than one
 * workspace and still ask for "the" runtime. Rather than have them silently
 * address nothing, they address the first binding — which is the only one on a
 * single-workspace machine, i.e. every machine until the owner creates a
 * second workspace.
 */
export function getRuntimeId(): string | null {
  return load()?.runtimes[0]?.runtimeId ?? null;
}

export function getWorkspaceId(): string | null {
  return load()?.runtimes[0]?.workspaceId ?? null;
}

/** The runtime representing this machine in one specific workspace. */
export function runtimeForWorkspace(workspaceId: string): string | null {
  return load()?.runtimes.find((r) => r.workspaceId === workspaceId)?.runtimeId ?? null;
}

export function saveConnection(state: ConnectionState): void {
  setSecret(SECRET_CLOUD_ACCESS_TOKEN, state.token);
  setSecret(SECRET_CLOUD_MACHINE_ID, state.machineId);
  setSecret(SECRET_CLOUD_RUNTIMES, JSON.stringify(state.runtimes));
  cached = state;
  loaded = true;
}

/** Update the runtime map after a claim, keeping the existing credential. */
export function saveRuntimes(runtimes: RuntimeBinding[]): void {
  setSecret(SECRET_CLOUD_RUNTIMES, JSON.stringify(runtimes));
  const current = load();
  if (current) {
    cached = { ...current, runtimes };
    loaded = true;
  }
}

/**
 * Forget the credential. The machine id is deliberately kept — see
 * `getOrCreateMachineId`.
 */
export function clearConnection(): void {
  deleteSecret(SECRET_CLOUD_ACCESS_TOKEN);
  deleteSecret(SECRET_CLOUD_RUNTIMES);
  invalidatePairingCache();
}

export interface CloudFetchOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Omit the bearer token — only /connect, whose credential is the attempt id. */
  anonymous?: boolean;
  /**
   * Which runtime this request is about, i.e. which workspace it concerns.
   *
   * Defaults to the machine's first binding, which is the only one until the
   * owner creates a second workspace. Routes that are about the MACHINE rather
   * than a workspace (`/claim`) pass `null` explicitly — sending a runtime
   * header there would be meaningless, and on the very first claim there is no
   * runtime to send yet.
   */
  runtimeId?: string | null;
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
    runtimeId,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    baseUrl = config.cloudUrl,
  } = options;

  let token: string | null = null;
  // `undefined` means "use the default binding"; an explicit `null` means "this
  // request is about the machine, not a workspace". The two must stay
  // distinguishable, which is why this is not `runtimeId ?? getRuntimeId()`.
  let scopedRuntime: string | null = null;
  if (!anonymous) {
    const connection = load();
    if (!connection) {
      throw new CloudAuthError("This computer is not connected to an account.", false);
    }
    token = connection.token;
    scopedRuntime = runtimeId === undefined ? (connection.runtimes[0]?.runtimeId ?? null) : runtimeId;
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
          ...(scopedRuntime ? { "x-sparstrow-runtime": scopedRuntime } : {}),
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
        await messageFrom(
          response,
          revoked ? "This computer's access was revoked." : "The access token was rejected.",
        ),
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
