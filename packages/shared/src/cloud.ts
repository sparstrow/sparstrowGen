/**
 * M3 — the contract between a daemon and the cloud control plane.
 *
 * This file exists so `packages/core` and `apps/web` cannot disagree. The
 * heartbeat constants are the sharp case: if the daemon beats every 30s and the
 * web app decides "stale" means 20s, every machine in the fleet flickers
 * offline between beats and nothing in either codebase looks wrong on its own.
 *
 * A daemon is NOT a Supabase user. It has no `auth.uid()`, so every RLS policy
 * denies it, and it never talks to PostgREST — it calls `/api/daemon/*` on the
 * Next app with a bearer token. See doc/tasks/M3/README.md decision 1.
 */

/** How often a paired daemon posts a heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * How long since the last heartbeat before a runtime reads as offline.
 *
 * Three intervals. Two would flap a machine offline on a single dropped
 * request, which on a laptop happens routinely; three tolerates one loss plus
 * scheduling jitter and still notices a dead machine inside two minutes.
 *
 * Liveness is ALWAYS derived from this, never read from `runtimes.status` — a
 * machine that dies writes nothing, so a stored `online` stays `online`
 * forever. See doc/tasks/M3/README.md decision 4.
 */
export const HEARTBEAT_STALE_AFTER_MS = 90_000;

/** Path prefix for the daemon surface, distinct from the browser's `/api/v1`. */
export const DAEMON_API_BASE = "/api/daemon";

/** True when a runtime's last heartbeat is recent enough to call it online. */
export function isRuntimeOnline(
  lastHeartbeat: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastHeartbeat) return false;
  const beat = lastHeartbeat instanceof Date ? lastHeartbeat : new Date(lastHeartbeat);
  const age = now - beat.getTime();
  // NaN from an unparseable timestamp must read as offline, not online.
  // `!(age < X)` rather than `age >= X` because every comparison with NaN is
  // false -- the naive form would silently report a machine with a corrupt
  // timestamp as online.
  return !Number.isNaN(age) && !(age >= HEARTBEAT_STALE_AFTER_MS);
}

/** What a machine reports about itself. Sent at pairing and on every boot. */
export interface RuntimeIdentity {
  /** Owner-facing label. Defaults to the hostname; never overwritten once set. */
  name?: string | null;
  hostname: string;
  /** `process.platform` — win32 / darwin / linux. */
  os: string;
  isElectron: boolean;
  /**
   * Providers this machine can ACTUALLY run, not the ones the build knows
   * about. `listProviders()` returns the static registry and will happily
   * claim Claude Code on a host with no binary; M4 dispatches on this field,
   * so a false claim becomes a run that dies at spawn. See T-M3-05.
   */
  capabilities: string[];
  coreVersion?: string | null;
}

export interface PairRequest extends RuntimeIdentity {
  code: string;
}

/** The token is returned exactly once, here. It is never stored in plaintext. */
export interface PairResponse {
  token: string;
  runtimeId: string;
  workspaceId: string;
}

export type RegisterRequest = RuntimeIdentity;

export interface HeartbeatResponse {
  /** The DATABASE's clock, not the daemon's. */
  serverTime: string;
  staleAfterMs: number;
}

export interface DaemonIdentity {
  runtimeId: string;
  workspaceId: string;
  name: string;
  status: string;
  lastHeartbeat: string | null;
  online: boolean;
}

/**
 * Why a daemon request failed, as a stable token rather than prose.
 *
 * The CLI branches on these (T-M3-04 needs distinct messages for a typo, a
 * reused code and an expired one), and matching on message text breaks the
 * first time someone improves the wording.
 *
 * `unknown_code` / `code_already_used` / `code_expired` map 1:1 to the
 * SQLSTATEs `redeem_pairing_code` raises: SPG01 / SPG02 / SPG03.
 */
export type DaemonErrorReason =
  | "unknown_code"
  | "code_already_used"
  | "code_expired"
  | "invalid_request"
  | "unauthenticated"
  | "revoked"
  | "server_error";

export interface DaemonErrorResponse {
  reason: DaemonErrorReason;
  /** Human-readable, safe to print. Never contains the token. */
  error: string;
}
