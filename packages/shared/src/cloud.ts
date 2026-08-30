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
import { SETTING_WIP_SNAPSHOT, SETTING_WIP_SNAPSHOT_KEEP, SETTING_TERMINAL_ACCESS } from "./constants";
import type { RunEventType } from "./schemas/run";

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

/** The words the UI is allowed to use about a machine. M8, FR-006 / FR-007. */
export type MachineState = "active" | "unreachable" | "draining";

/**
 * What to CALL a machine, from what it declared and when it last spoke.
 *
 * Two states plus `draining` this round. Sleep detection is D-16; when it
 * lands, a daemon declares `status = 'sleeping'` BEFORE it suspends and this
 * function gains one branch. That is the whole reason the label is computed
 * here rather than in the row that renders it.
 *
 * **Reachability is checked first, and that ordering is the decision.** A
 * machine that declared `draining` and then went quiet IS unreachable — it may
 * have finished shutting down twenty minutes ago, or it may have been unplugged
 * mid-drain, and we cannot tell which. Saying "shutting down" about it asserts
 * a cause we do not know, which is the same rule that rejected "turned off" in
 * favour of "unreachable". Reversing the order would leave a machine reading
 * "shutting down" forever.
 *
 * Built ON `isRuntimeOnline`, not instead of it: that function answers "may I
 * dispatch to this?" for three callers, and this one answers "what do I call
 * it?" for the UI. Reimplementing the comparison here would also lose the
 * deliberate `!(age >= X)` form that makes a corrupt timestamp read as offline.
 */
export function machineState(
  status: string | null | undefined,
  lastHeartbeat: string | Date | null | undefined,
  now: number = Date.now(),
): MachineState {
  if (!isRuntimeOnline(lastHeartbeat, now)) return "unreachable";
  if (status === "draining") return "draining";
  return "active";
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

/**
 * Commands the daemon claims and executes.
 *
 * `memory.sync` is M6's doorbell and carries NO payload — the pulling daemon
 * already knows its own workspace from its own token, so the command is a
 * wake-up, not a delivery. See the M6 block at the bottom of this file.
 */
export type CommandKind =
  | "run.start"
  | "run.cancel"
  | "project.clone"
  | "settings.set"
  | "memory.sync"
  | "chat.turn"
  | "providers.discover_models";

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

/** T-CS3-03 (Band 26). `providers.discover_models` carries no more than
 *  which provider to check -- the daemon already knows its own workspace
 *  from its own token, same framing as `memory.sync`'s doorbell. */
export interface ProviderDiscoverModelsPayload {
  provider: string;
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
  SETTING_TERMINAL_ACCESS,
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
  workspaceTools?: {
    allowedTools: string[];
    disallowedTools: string[];
  };
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

// ─── M5 — transcripts ──────────────────────────────────────────────────────────

/**
 * The dual path, and why the daemon never touches Realtime.
 *
 * A batch goes to `POST /api/daemon/runs/:id/events`, which writes it durably
 * and then fans the SAME batch out as a Realtime broadcast. The route already
 * holds the service role and has already resolved the workspace from the bearer
 * token, so broadcasting from there costs one request; broadcasting from the
 * daemon would cost a second authentication model for it — a custom
 * `runtime_id` JWT, a minting endpoint, a refresh timer, and
 * `realtime.messages` policies for a principal with no `auth.uid()`.
 *
 * See doc/tasks/M5/README.md decision 1, and D-10 for the doorbell that
 * decision leaves parked.
 */

/** Events per batch before the pusher flushes. */
export const TRANSCRIPT_BATCH_MAX_EVENTS = 25;

/** Longest a partial batch waits for company. */
export const TRANSCRIPT_BATCH_INTERVAL_MS = 1_000;

/**
 * Byte ceiling on a batch — the limit the other two do not imply.
 *
 * The plan measured `tool_result` payloads at 4.9 KB average and 16.9 KB max and
 * concluded they sit under the 256 KB Realtime cap. True per event, false per
 * batch: sixteen large results is a 276 KB broadcast that Realtime rejects, and
 * the natural way to write a batching loop counts events.
 *
 * Half the cap rather than all of it, because the envelope, the JSON escaping of
 * payloads that are already JSON, and base64 inside tool results all inflate the
 * wire size above the sum of what was measured locally.
 */
export const TRANSCRIPT_BATCH_MAX_BYTES = 128 * 1024;

/**
 * How often the daemon sweeps `cloud_event_cursors` for backlog, independent of
 * any live event arriving.
 *
 * This is the trigger that makes recovery reliable rather than merely
 * plausible: startup and the failing→reachable transition catch the common
 * cases, but this is the one with no precondition to miss — it costs one
 * indexed query against a table bounded to `TRANSCRIPT_BACKLOG_MAX_RUNS` rows.
 */
export const TRANSCRIPT_BACKFILL_SWEEP_MS = 60_000;

/**
 * How many runs' worth of unconfirmed transcript may sit in the backlog at
 * once, oldest evicted first.
 *
 * A cursor row is not deleted when a run ends — only when it is BOTH terminal
 * and fully pushed — so an offline machine, or one whose network stays down,
 * accumulates one row per run that produced events. Unbounded, that backlog
 * never shrinks; this is the ceiling, not a target to run near.
 */
export const TRANSCRIPT_BACKLOG_MAX_RUNS = 200;

/**
 * How long a run may sit unconfirmed before its backlog is discarded outright.
 *
 * Two weeks: past this, the cloud `runs` row this backlog was destined for has
 * almost certainly already been swept or is no longer meaningfully actionable,
 * and holding the events any longer only delays admitting the transcript is
 * incomplete.
 */
export const TRANSCRIPT_BACKLOG_MAX_AGE_DAYS = 14;

/** One transcript event, as the daemon sends it. */
export interface RunEventPush {
  seq: number;
  /** ISO 8601. Passed through verbatim — see the route's note on timezones. */
  ts: string;
  type: RunEventType;
  payload: unknown;
}

export interface RunEventBatch {
  events: RunEventPush[];
}

export interface RunEventBatchResponse {
  /**
   * Highest `seq` now durable in the cloud for this run, decided by the SERVER.
   *
   * The daemon advances its cursor to this and never to what it sent. A request
   * that times out after the server committed is indistinguishable from one
   * that never arrived, and a cursor advanced on send is how a transcript
   * acquires a permanent hole.
   */
  storedThroughSeq: number;
  /** Rows this request inserted. A pure replay stores 0 and is not an error. */
  stored: number;
  duplicates: number;
}

/** Why a batch was refused, as a stable token. */
export type TranscriptRejection =
  | "empty_batch"
  | "batch_too_large"
  | "invalid_seq"
  | "duplicate_seq"
  | "invalid_type"
  | "invalid_ts"
  | "malformed";

/**
 * The Realtime topic a run's live deltas are broadcast on.
 *
 * The workspace id is in the topic so the subscribe policy is a membership check
 * with no join — the same shape as every M1 policy, which is why it is easy to
 * be sure it is right. A run id alone would force the policy to join `runs`, and
 * a workspace-wide topic would deliver every run's transcript to every open tab.
 *
 * The id in the topic is not what grants access. The RLS policy on
 * `realtime.messages` is (`010_transcript_broadcast.sql`); a non-member who
 * guesses the topic is refused at subscribe.
 */
export function runTranscriptTopic(workspaceId: string, runId: string): string {
  return `run:${workspaceId}:${runId}`;
}

/** The broadcast event name carried inside that topic. */
export const TRANSCRIPT_BROADCAST_EVENT = "events";

/**
 * What a subscriber receives.
 *
 * `oversized` names events too large to broadcast — they ARE stored, and the
 * client refetches them rather than concluding the transcript ended. A gap the
 * client knows about is recoverable; one it does not is a transcript that
 * silently stops.
 */
export interface TranscriptBroadcast {
  runId: string;
  events: RunEventPush[];
  oversized?: number[];
}

// ─── M6 — memory sync ──────────────────────────────────────────────────────────
//
// A note written on one paired machine appears, as ordinary markdown in the
// vault, on every other machine in the workspace. Postgres is the hub notes
// pass THROUGH; every daemon still reads its own local index at query time.
//
// No vector ever crosses this wire. Cloud `memory_notes` has no vector column
// at all — each machine embeds the pulled markdown itself with its own bundled
// 384-dim model. See doc/tasks/M6/README.md decision 3.

/**
 * How long a burst of local note writes is coalesced before one push.
 *
 * An autosaving raw editor fires `writeNoteRaw` repeatedly against the same
 * note; without this every keystroke-adjacent save is its own request carrying
 * content that is obsolete by the time it lands.
 */
export const MEMORY_SYNC_DEBOUNCE_MS = 2_000;

/**
 * How often BOTH memory sweeps run — push's reconciliation and pull's
 * incremental catch-up.
 *
 * One constant for both on purpose. They are the same guarantee pointed in
 * opposite directions ("the debounce/doorbell is the fast path, the sweep is
 * the correctness path"), and two numbers here would drift into two different
 * answers to "how stale can a machine be?"
 */
export const MEMORY_SYNC_SWEEP_MS = 5 * 60_000;

/** Notes per pull page. The cursor makes more pages free; this bounds one response. */
export const MEMORY_PULL_PAGE_SIZE = 200;

/**
 * Notes per push request.
 *
 * Below the pull page size deliberately: a push carries full note bodies from
 * a machine that may have just come back from a week offline, while a pull page
 * is read from an index built for exactly that scan.
 */
export const MEMORY_PUSH_MAX_NOTES = 50;

/**
 * One note, as it travels between machines.
 *
 * ─── `content` is the WHOLE FILE, frontmatter included ───────────────────────
 *
 * Not the body. This is the single most consequential field decision in M6,
 * and the reason is `contentHash`: locally it is `sha256` of the entire file as
 * written to disk (`vault.ts`, both `writeNote` and `writeNoteRaw`), and the
 * conflict rule short-circuits on hash equality BEFORE it ever looks at a
 * clock.
 *
 * Send the body alone and the receiving machine has to re-render frontmatter to
 * reconstruct a file. Its YAML key order, quoting and line endings will not
 * match the origin machine's byte for byte, so its recomputed `contentHash`
 * differs from the one it just pulled — the note reads as locally edited, gets
 * pushed back, and the two machines trade writes forever. Shipping the exact
 * bytes makes the hash mean the same thing on every machine by construction.
 *
 * The structured fields below travel ALONGSIDE those bytes rather than instead
 * of them: they are what makes the cloud row queryable, and they let a pulling
 * machine fill its `memory_notes` row without re-parsing what the origin
 * already parsed. The file remains the source of truth; if the two ever
 * disagree, `scanVault()` re-derives from the file and wins.
 */
export interface MemoryNoteSyncPayload {
  /** Minted once, by the machine that created the note. Verbatim everywhere after. */
  id: string;
  /** Vault-relative, forward slashes. Also verbatim — never re-slugified on pull. */
  path: string;
  scope: "global" | "project" | "agent";
  projectSlug: string | null;
  agentSlug: string | null;
  title: string;
  tags: string[];
  source: string;
  type: string;
  /** The complete `.md` file, frontmatter and all. See the note above. */
  content: string;
  /** EH6. Travels so a note quarantined on one machine stays quarantined on all. */
  quarantined: boolean;
  archivedAt: string | null;
  supersededBy: string | null;
  /** `sha256(content)`. The same value on every machine holding this note. */
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryPushRequest {
  notes: MemoryNoteSyncPayload[];
}

export interface MemoryPushResult {
  id: string;
  /**
   * True when the cloud now holds THIS machine's version — including the
   * hash-equal case, where nothing was written because nothing differed. False
   * means only one thing: last-write-wins went the other way.
   */
  applied: boolean;
  /**
   * Present when `applied` is false — the cloud's winning row, so the daemon
   * reconciles on the spot instead of waiting out a pull sweep to discover it
   * lost.
   */
  current?: MemoryNoteSyncPayload;
}

export interface MemoryPushResponse {
  results: MemoryPushResult[];
}

export interface MemoryPullResponse {
  notes: MemoryNoteSyncPayload[];
  /**
   * Where to resume, decided by the SERVER from the last row it actually
   * returned — never computed by the caller from what it thinks it received.
   * Same rule as `storedThroughSeq` above, for the same reason: a cursor
   * advanced past a row that never arrived is a permanent hole.
   *
   * `null` means caught up.
   */
  nextCursor: MemoryPullCursor | null;
}

/**
 * A tuple, not a bare timestamp.
 *
 * `updatedAt` alone is not unique — two notes written in the same millisecond
 * share it, and a `> updatedAt` cursor would skip whichever of them sorted
 * second. `(updatedAt, id)` is total, and matches
 * `idx_memory_notes_sync (workspace_id, updated_at)` closely enough that the
 * scan stays indexed.
 */
export interface MemoryPullCursor {
  updatedAt: string;
  id: string;
}

// ─── M12 — chat turn dispatch ──────────────────────────────────────────────────

/**
 * Ids AND slugs travel together, deliberately — same reasoning as
 * `RunStartPayload`. The daemon resolves an agent/project to its local copy
 * BY SLUG (D-9: no definition sync between the cloud's ids and a daemon's own),
 * and then uses the id it was handed to report back which one was actually used.
 */
export interface ChatTurnStartPayload {
  turnId: string;
  sessionId: string;
  sessionKind: "free" | "project" | "agent";
  projectId: string | null;
  projectSlug: string | null;
  agentId: string | null;
  agentSlug: string | null;
  /** null = inherit the session's (free/project) or the agent's configured default. */
  provider: string | null;
  model: string | null;
  attempt: number;
  /**
   * The last ~50 messages, oldest first, INCLUDING the user message this
   * turn is answering. A daemon has no local copy of a cloud session's
   * history to read instead — see `016_chat_turn_transcript.sql`. The
   * daemon does its own count/byte windowing on top of this with the
   * existing local `buildTranscriptPrompt`; this is deliberately a superset,
   * not the final prompt window.
   */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /**
   * CS5 (Band 26, T-CS5-03) — files attached to the turn's user message,
   * looked up from `chat_message_attachments` at dispatch time
   * (`private.assign_or_park_chat_turn`, `026_chat_attachments_dispatch.sql`).
   *
   * Deliberately NO signed URL here, correcting the plan's own approximate
   * framing: a parked turn can wait indefinitely for a runtime to come
   * online (`private.rescan_waiting_chat_turns`, re-invoked on every daemon
   * poll, not just at send time), and a short-lived signed URL minted once
   * at the ORIGINAL dispatch attempt would already have expired by the time
   * a later rescan actually assigns it. The daemon mints its own short-lived
   * signed URL on demand, immediately before downloading — see
   * `packages/core/src/cloud/chat-turn.ts`'s attachment step and the new
   * `POST /api/daemon/chat/attachments/sign` route.
   */
  attachments: Array<{ storagePath: string; filename: string }>;
}

/**
 * Why a turn is parked instead of dispatched, surfaced to the browser.
 *
 * Mirrors `EnqueueFailureReason`'s job for `runs`, but chat never raises for
 * these — `enqueue_chat_turn` always succeeds and records one of these on the
 * row instead, because losing the owner's typed message is worse than a
 * bounded wait. See doc/plans/2026-08-23-chat-message-sending.md DD-3.
 */
export type ChatTurnWaitingReason = "no_runtime_paired" | "all_runtimes_offline" | "project_not_available";

/** SQLSTATE → reason token, for `enqueue_chat_turn` / `retry_chat_turn`. Continues
 *  `ENQUEUE_ERRCODE_REASONS`' numbering; the contract is defined in the chat
 *  dispatch migration (see doc/tasks/M12/T-M12-01). */
export type ChatTurnEnqueueFailureReason =
  | "turn_in_progress"
  | "session_not_found"
  | "turn_not_found"
  | "turn_not_retryable";

export const CHAT_TURN_ENQUEUE_ERRCODE_REASONS: Record<string, ChatTurnEnqueueFailureReason> = {
  SPG16: "turn_in_progress",
  SPG17: "session_not_found",
  SPG18: "turn_not_found",
  SPG19: "turn_not_retryable",
};

/**
 * How long a parked (`waiting`) turn may sit before it expires, set ONCE at
 * creation and never pushed out by a later recompute.
 *
 * 24 hours, not the 10 minutes this plan originally proposed — reasoned from
 * "sent before bed, machine turned on in the morning." Ten minutes would
 * defeat the spec's US2.2 promise ("the reply arrives automatically once a
 * machine picks it up") for anyone who steps away from the keyboard. A plain
 * constant with no migration cost to change; flagged for owner confirmation
 * in doc/tasks/M12/T-M12-01's Result section, not treated as silently closed.
 *
 * This value exists in SQL too (the migration that enqueues/assigns turns)
 * and the two must change together — see that task's Traps.
 */
export const CHAT_TURN_WAIT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A turn's daemon died mid-reply and posted nothing further. No sweeper reads
 * this — it is derived at read time, same discipline as `isRuntimeOnline`
 * (M3 decision 4), because a machine that dies writes nothing and a stored
 * `in_progress` stays `in_progress` forever otherwise.
 */
export const CHAT_TURN_STALE_MS = 60_000;

/** True only for an `in_progress` turn with no ingest call inside `CHAT_TURN_STALE_MS`. */
export function isChatTurnStale(
  turn: { status: string; updatedAt: string | Date },
  now: number = Date.now(),
): boolean {
  if (turn.status !== "in_progress") return false;
  const updated = turn.updatedAt instanceof Date ? turn.updatedAt : new Date(turn.updatedAt);
  const age = now - updated.getTime();
  // Same NaN-safe form as isRuntimeOnline: a corrupt timestamp must read as
  // stale (fail safe toward "something is wrong"), not as fresh.
  return Number.isNaN(age) || age >= CHAT_TURN_STALE_MS;
}

/**
 * Daemon → cloud ingest, mirroring `RunEventPush`/`RunEventBatch`'s shape —
 * but note the semantics differ. `replyText` is ALWAYS the full accumulated
 * reply as of `seq`, never a delta, because a chat turn has no replayable
 * event trace to reassemble — only a growing block of plain text. This is
 * what makes ingest trivially idempotent under a replayed or reordered batch:
 * one `seq` comparison, no gap handling. See doc/tasks/M12/T-M12-01.
 */
export interface ChatTurnEventPush {
  seq: number;
  /** Full text so far, not a delta. */
  replyText: string;
}

export interface ChatTurnEventBatch {
  events: ChatTurnEventPush[];
}

/**
 * AM1 (band 27, T-AM1-03) — a file the agent handed back during this turn,
 * already uploaded to `chat-attachments` by the time this is posted (see
 * `chat-turn.ts`'s upload step). Same shape as `ChatTurnStartPayload.attachments`,
 * mirrored rather than shared: that type is what the OWNER sent in, this is
 * what the AGENT produced, and the two are expected to diverge (plan
 * Decision 2 — provenance comes from the bound message's `role`, not a type).
 */
export interface ChatTurnProducedFile {
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** The terminal call — `POST /api/daemon/chat/turns/:id/result`. */
export interface ChatTurnResultPayload {
  seq: number;
  replyText: string;
  status: "succeeded" | "failed";
  error?: string | null;
  /**
   * AM1 (T-AM1-03). Optional, not `.default([])`'d — this is a plain
   * interface, not zod. `parseChatResult` treats a missing key as `[]`, so an
   * older daemon's payload (deployed independently of the web app) keeps
   * working unchanged.
   */
  produced?: ChatTurnProducedFile[];
}

/**
 * The Realtime topic a chat turn's live deltas are broadcast on — per
 * SESSION, not per turn, so a subscriber opened once for a session sees every
 * turn sent in it without re-subscribing between them. Same reasoning as
 * `runTranscriptTopic`; the RLS policy on `realtime.messages` this must match
 * is `015_chat_broadcast.sql`, not this function — a non-member who guesses
 * the topic is refused at subscribe, same as the run topic.
 */
export function chatTurnTopic(workspaceId: string, sessionId: string): string {
  return `chat:${workspaceId}:${sessionId}`;
}

/** The broadcast event name carried inside that topic. */
export const CHAT_TURN_BROADCAST_EVENT = "turn";

/**
 * What a subscriber receives — mirrors `TranscriptBroadcast`'s shape
 * deliberately (an `events` array, chunked the same way by `planBroadcast`)
 * rather than a single snapshot, so a batch of several deltas still renders
 * progressively instead of jumping straight to its final text. `status`
 * describes the turn as of this message; only the terminal call sets it to
 * `succeeded`/`failed`, and only then is `error` meaningful.
 */
export interface ChatTurnBroadcast {
  turnId: string;
  events: ChatTurnEventPush[];
  status: "running" | "succeeded" | "failed";
  error?: string | null;
}

// ─── M16 — the terminal channel ─────────────────────────────────────────────
//
// Two topic families rather than one. Control is per machine because a
// browser needs to ask "what sessions exist" before any session exists to
// have a topic of its own; a session's bytes are per session because a
// machine may run up to `MAX_TERMINAL_SESSIONS` of them at once and nothing
// should have to filter one session's output out of another's.
//
// Message shapes for both live in `./schemas/terminal.ts` — this file owns
// only the topic strings, the event names carried inside them, and the
// numeric limits, mirroring how `runTranscriptTopic`/`chatTurnTopic` split
// from `../schemas/run.ts`/`./schemas/chat.ts` above.

/**
 * Control: requests from a browser, replies from the machine.
 *
 * Per machine, not per browser — two tabs issuing `terminal.list` at once
 * both receive both replies, and each request's `requestId` is how a tab
 * finds its own. Shaped exactly like `runTranscriptTopic`/`chatTurnTopic` so
 * the policy in `018_terminal_channels.sql` is the same
 * `split_part(realtime.topic(), ':', 2)` membership test with no join.
 *
 * The id in the topic is not what grants access — the RLS policy is. A
 * non-member who guesses the topic is refused at subscribe, same as the run
 * and chat topics.
 */
export function machineControlTopic(workspaceId: string, runtimeId: string): string {
  return `machine:${workspaceId}:${runtimeId}`;
}

/**
 * One session's bytes, both directions. Policies: `018_terminal_channels.sql`
 * (the browser's half) and `019_daemon_realtime_identity.sql` (the machine's).
 *
 * **The runtime id is in here for the daemon's policy, not the browser's**
 * (`T-DI-01`, plan decision `DI-2`). A session id is machine-local and `D-26`
 * means no cloud row exists to join it against, so without the runtime id the
 * machine-side `output` policy could only check *"is the sender a daemon in
 * this workspace"* — letting one of the owner's machines publish onto another
 * of their machines' session topics. With it, `019` checks the pair
 * `(workspace, runtime)` against `private.current_daemon_scope()` and a machine
 * is confined to its own sessions.
 *
 * The workspace id stays FIRST so the browser policies remain a membership test
 * with no join — `DD-3`'s reason, unchanged. Positions are load-bearing:
 * `split_part(topic, ':', 2)` is the workspace and `':', 3` the runtime in both
 * policy files.
 */
export function terminalSessionTopic(workspaceId: string, runtimeId: string, sessionId: string): string {
  return `terminal:${workspaceId}:${runtimeId}:${sessionId}`;
}

/** Browser → machine, on the control topic. Client-sendable. */
export const MACHINE_REQUEST_EVENT = "request";
/** Machine → browser, on the control topic. NOT client-sendable — `018_terminal_channels.sql` denies it. */
export const MACHINE_REPLY_EVENT = "reply";
/** Browser → machine, on a session topic. Client-sendable. */
export const TERMINAL_INPUT_EVENT = "input";
/** Machine → browser, on a session topic. NOT client-sendable — `018_terminal_channels.sql` denies it. */
export const TERMINAL_OUTPUT_EVENT = "output";

/** How many terminal sessions one machine may hold open at once. */
export const MAX_TERMINAL_SESSIONS = 10;

/** Longest a machine batches PTY output before broadcasting it. */
export const TERMINAL_OUTPUT_FLUSH_MS = 30;

/** Bytes of PTY output that force an early flush, ahead of the interval above. */
export const TERMINAL_OUTPUT_FLUSH_BYTES = 8 * 1024;

/**
 * Ceiling on one broadcast message. Half the Realtime cap, same reasoning as
 * `TRANSCRIPT_BATCH_MAX_BYTES`: the envelope and JSON escaping of what is
 * already near-binary terminal output inflate the wire size above the flush
 * threshold above.
 */
export const TERMINAL_OUTPUT_MAX_BYTES = 64 * 1024;

/** Sustained input rate a session is throttled to once it exceeds it. */
export const TERMINAL_THROTTLE_BYTES_PER_SEC = 256 * 1024;

/** How long input must stay under the throttle before it is lifted. */
export const TERMINAL_THROTTLE_SUSTAIN_MS = 3_000;

/**
 * The one wire signal a throttled session carries — literal text written
 * into the output stream (`manager.ts`'s `engageThrottle`), not a separate
 * event; DD-8 never gave the throttle its own message shape. Shared so
 * `terminals.tsx` (`T-M17-02`) can detect it to drive a banner without
 * keeping its own copy of the exact string to drift against the one that
 * actually gets sent.
 */
export const TERMINAL_THROTTLE_NOTICE =
  "\r\n[output throttled — rate limit reached, resuming automatically]\r\n";

/**
 * How long a control request waits for a reply before the page gives up on
 * the machine and says so — FR-014's timeout, mirroring
 * `COMMAND_POLL_INTERVAL_MS`'s job of naming a wait the UI must not exceed
 * silently.
 */
export const MACHINE_REQUEST_TIMEOUT_MS = 10_000;

// DAEMON_REALTIME_TOKEN_TTL_S was here (M16, DD-2). REMOVED by `T-DI-04`.
//
// It named the lifetime of a credential this app minted and signed itself. It
// no longer mints one: `/api/daemon/realtime/token` returns a real Supabase
// session, so Supabase decides the TTL and the only honest source for it is the
// `expiresAt` that endpoint returns. Core reads that and nothing else
// (`realtime.ts`'s `scheduleRefresh`).
//
// Deleted rather than re-documented as a "refresh floor": a constant that no
// longer describes anything real is exactly what a later reader schedules
// against by mistake.

/**
 * Everything a paired machine needs to open its own Realtime connection,
 * from the one endpoint that mints it — `POST /api/daemon/realtime/token`.
 *
 * Found while building `T-M16-04`, amending `T-M16-02`'s shipped shape: core
 * has never talked to Supabase directly before this — it only ever calls
 * `/api/daemon/*` on the Next app — so it has no separately configured
 * Supabase URL or anon key to combine with the token. Both are already
 * public values (the anon key ships to every browser), so returning them
 * here costs zero new machine-side configuration and zero new secrets.
 */
export interface RealtimeCredential {
  token: string;
  /** ISO string. For the daemon's refresh timer — never decode the JWT to find this. */
  expiresAt: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}
