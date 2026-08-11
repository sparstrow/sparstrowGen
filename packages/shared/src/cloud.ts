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

// Extensionless, like every other intra-package import here. The package is
// `moduleResolution: Bundler`, and Next consumes this directory as TypeScript
// source — a `./constants.js` specifier typechecks fine and then fails to
// resolve at bundle time, which is a runtime 500 no typecheck will ever catch.
import { SETTING_WIP_SNAPSHOT, SETTING_WIP_SNAPSHOT_KEEP } from "./constants";

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
  /**
   * The machine's CURRENT values for the settings it accepts remotely
   * (`DAEMON_SETTABLE_KEYS`). Reported at boot and again whenever a
   * `settings.set` is applied, so the Machines card renders what the daemon
   * confirmed rather than what the browser hoped.
   *
   * This is also what makes a locally-flipped switch visible in the hosted UI:
   * the value is read from the machine's own settings table, so it does not
   * matter whether it was last changed from here or from the local Settings
   * card. M4, closing G-6.
   */
  settings?: Record<string, string>;
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

// ═══════════════════════════════════════════════════════════════════════════
// M4 — the command spine.
//
// A command is a durable Postgres row with claim/lease/ack, not a message. The
// daemon polls for its own; the cloud never pushes. Everything below is the
// contract `packages/core` and `apps/web` share so they cannot disagree about
// a field name at 3am.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * How often a paired daemon asks for work.
 *
 * M4 has no Realtime doorbell — the daemon still cannot authenticate to
 * Realtime, and the poll would be mandatory even if it could, because a
 * doorbell is at-most-once by construction and must never be trusted for
 * delivery. See doc/tasks/M4/README.md decision 1.
 *
 * The cost of 3s is one user-visible delay between pressing Run and seeing the
 * run start. The cost of the poll itself is one indexed lookup that returns
 * nothing almost every time.
 */
export const COMMAND_POLL_INTERVAL_MS = 3_000;

/**
 * How long a claim is held before another poll may take it back.
 *
 * This covers the HANDOFF — claim, create the local row, ack — and nothing
 * more. It is emphatically not the length of a run: a command is acked when the
 * work is accepted, not when it finishes, so a 40-minute run holds no lease.
 * Ack-on-completion would force lease renewal, and a missed renewal would
 * redispatch a run that is still executing.
 */
export const COMMAND_LEASE_MS = 60_000;

/** Commands the daemon claims and executes. */
export type CommandKind = "run.start" | "run.cancel" | "project.clone" | "settings.set";

/**
 * Ids AND slugs travel together, deliberately.
 *
 * The daemon resolves a cloud agent to a local one by SLUG, because the two
 * sides have independent ids and no definition sync (D-9); the id is what it
 * then links against so the next dispatch is one indexed lookup. Sending only
 * the id would cost a second round trip on the dispatch path for data the
 * enqueuer already had in hand.
 */
export interface RunStartPayload {
  /** Generated by the cloud. The daemon's local run adopts this id verbatim. */
  runId: string;
  agentId: string;
  agentSlug: string;
  projectId: string | null;
  projectSlug: string | null;
  taskId: string | null;
  prompt: string;
  trigger: string;
  lane: string;
}

export interface RunCancelPayload {
  runId: string;
}

export interface ProjectClonePayload {
  projectId: string;
  projectSlug: string;
  /** From `projects.gitRemote`. The daemon refuses the command without it. */
  gitRemote: string;
  /** Absolute path on the target machine, chosen by the user in the browser. */
  localPath: string;
}

export interface SettingsSetPayload {
  key: string;
  value: string;
}

/**
 * Settings the control plane may write on a machine.
 *
 * An allowlist, not a filter list. `settings.set` is a remote write into a
 * daemon's local database, and the M3 lesson that produced the `status`
 * allowlist applies here in a far more dangerous position: without this, a
 * command could set ANY setting a machine has, including ones added later by
 * someone who never read this comment.
 *
 * Enforced in three places, on purpose — the route, the daemon, and the UI's
 * rendering. The daemon's copy is the one that matters; the others are for a
 * better error and a correct control.
 */
export const DAEMON_SETTABLE_KEYS: readonly string[] = [
  SETTING_WIP_SNAPSHOT,
  SETTING_WIP_SNAPSHOT_KEEP,
];

/** A command as handed to the daemon by the claim endpoint. */
export interface ClaimedCommand {
  id: string;
  kind: CommandKind;
  payload: Record<string, unknown>;
  attempts: number;
  leaseExpiresAt: string | null;
  createdAt: string;
}

export interface ClaimResponse {
  /** Always an array. Empty is the common case and is not an error. */
  commands: ClaimedCommand[];
}

/**
 * Why a command could not be executed, as a stable token.
 *
 * The daemon reports the reason; the ROUTE decides what it means for the board.
 * That split is deliberate — a daemon able to set task statuses directly could
 * mark every task in a workspace done.
 */
export type CommandFailureReason =
  | "project_not_available"
  | "agent_not_available"
  | "agent_disabled"
  | "spawn_failed"
  | "clone_failed"
  | "setting_not_allowed"
  | "unknown_kind";

export interface AckRequest {
  status: "done" | "failed";
  reason?: CommandFailureReason;
  /** Human-readable detail. Never the run's prompt, which is user content. */
  error?: string;
  /**
   * For `project_not_available`: the path that was checked, so the UI's relink
   * action can pre-fill it instead of asking the user to remember.
   */
  detail?: string;
}

/**
 * A run row transition, reported by the machine executing it.
 *
 * M4 reports the run ROW only. Transcript events are M5, and keeping them apart
 * is what makes this phase falsifiable: if a run reaches `succeeded` in the
 * cloud, the spine works.
 *
 * Applied monotonically server-side — the daemon retries after a network
 * failure, so the same `running` can arrive twice, and a delayed `running` must
 * never overwrite a `succeeded` that already landed.
 */
export interface RunStatusReport {
  status: "running" | "succeeded" | "failed" | "cancelled" | "timeout";
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
  resultText?: string | null;
  costUsd?: number | null;
  numTurns?: number | null;
  durationMs?: number | null;
  untrusted?: boolean;
}

/** One project as it exists on this machine's disk. */
export interface ProjectBinding {
  projectSlug: string;
  localPath: string;
  state: "bound" | "missing" | "cloning" | "error";
  detail?: string | null;
}

export interface BindingReportRequest {
  bindings: ProjectBinding[];
}

/**
 * Why an enqueue was refused, surfaced to the BROWSER by `/api/v1`.
 *
 * Distinct from `DaemonErrorReason`, which is the daemon's. These map 1:1 to
 * the SQLSTATEs `start_run` raises, and the UI switches on them to offer the
 * right action: "no machine is online" and "this machine doesn't have that
 * project" lead to completely different next steps, and one error for both
 * would be useless.
 */
export type EnqueueFailureReason =
  | "agent_not_found"
  | "agent_disabled"
  | "no_runtime_available"
  | "project_not_available"
  | "project_not_found"
  | "run_not_found"
  | "no_agent_assigned";

/** SQLSTATE → reason token. The contract is defined in 009_command_spine.sql. */
export const ENQUEUE_ERRCODE_REASONS: Record<string, EnqueueFailureReason> = {
  SPG10: "agent_not_found",
  SPG11: "agent_disabled",
  SPG12: "no_runtime_available",
  SPG13: "project_not_available",
  SPG14: "project_not_found",
  SPG15: "run_not_found",
};
