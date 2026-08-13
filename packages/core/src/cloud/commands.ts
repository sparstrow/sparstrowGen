import {
  COMMAND_POLL_INTERVAL_MS,
  DAEMON_SETTABLE_KEYS,
  type AckRequest,
  type ClaimResponse,
  type ClaimedCommand,
  type CommandFailureReason,
  type ProjectClonePayload,
  type RunCancelPayload,
  type RunStartPayload,
  type SettingsSetPayload,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { logger } from "../logger.js";
import { runManager } from "../orchestrator/run-manager.js";
import { CloudAuthError, cloudFetch, invalidatePairingCache, isPaired } from "./client.js";
import { cloneProject } from "./bindings.js";
import { pullOnce } from "./memory-sync.js";
import { reportSettings } from "./registration.js";
import { resolveAgent } from "./resolve.js";
import { markDispatched } from "./run-reporter.js";

/**
 * M4 — the loop that turns a row in Postgres into a process on this machine.
 *
 * Polling, not a doorbell. M4 ships no Realtime subscription: the daemon still
 * cannot authenticate to Realtime, and the poll would be mandatory even if it
 * could, because the doorbell is at-most-once by construction and must never be
 * trusted for delivery. See doc/tasks/M4/README.md decision 1.
 *
 * Failure behaviour mirrors heartbeat.ts deliberately, line for line. Two loops
 * against the same control plane with different rules for the same failures is
 * how two subsystems end up disagreeing about whether a machine is paired.
 */

let timer: NodeJS.Timeout | null = null;
let stopped = false;
/** Single-flight: a poll that outruns the interval must not overlap the next. */
let inFlight = false;
/** Connectivity edge, so a laptop offline overnight logs once, not 1,200 times. */
let healthy = true;

async function poll(): Promise<void> {
  if (stopped || inFlight || !isPaired()) return;
  inFlight = true;

  try {
    const { commands } = await cloudFetch<ClaimResponse>("/commands", {
      method: "GET",
      retries: 1,
      timeoutMs: 10_000,
    });

    if (!healthy) {
      healthy = true;
      logger.info("cloud control plane reachable again");
    }

    for (const command of commands ?? []) {
      await dispatch(command);
    }
  } catch (err) {
    if (err instanceof CloudAuthError) {
      if (err.revoked) {
        logger.warn(
          "this machine's pairing was revoked — stopping the command loop. Run `sparstrow pair <code>` to reconnect.",
        );
        stopCommandLoop();
        return;
      }
      // 401 rather than 403: most often `sparstrow pair` rewrote the store
      // while core was running. Re-read before concluding anything.
      invalidatePairingCache();
      if (!isPaired()) {
        logger.warn("daemon token is no longer valid — stopping the command loop until re-paired");
        stopCommandLoop();
        return;
      }
      return;
    }

    if (healthy) {
      healthy = false;
      logger.warn(
        { detail: err instanceof Error ? err.message : String(err) },
        "could not reach the control plane for commands — retrying in the background",
      );
    }
  } finally {
    inFlight = false;
  }
}

/**
 * Execute one command and ack it.
 *
 * EVERY path acks exactly once. `createRun` throws `HttpError` for the ordinary
 * cases — a deleted agent, a project that vanished between preflight and spawn —
 * and an escaping throw would stop the loop for every other command on the
 * machine because of one bad row.
 */
async function dispatch(command: ClaimedCommand): Promise<void> {
  try {
    switch (command.kind) {
      case "run.start":
        await ackResult(command, startRun(command.payload as unknown as RunStartPayload));
        return;
      case "run.cancel":
        await ackResult(command, cancelRun(command.payload as unknown as RunCancelPayload));
        return;
      case "project.clone": {
        const result = await cloneProject(command.payload as unknown as ProjectClonePayload);
        await ackResult(command, result.ok ? { ok: true } : result);
        return;
      }
      case "settings.set":
        await ackResult(command, applySetting(command.payload as unknown as SettingsSetPayload));
        return;
      case "memory.sync":
        // M6's doorbell. The command carries no payload — this machine already
        // knows its own workspace from its own token, so the row is a wake-up,
        // not a delivery.
        //
        // Always acked `done`, deliberately, and that covers two cases people
        // read as failures. Finding nothing new is the command's MOST common
        // outcome (two pushes landing close together, or a sweep that caught up
        // moments earlier) and is plainly success. A pull that could not reach
        // the cloud is also acked done, because `pullOnce()` handles its own
        // connectivity and the periodic sweep is what guarantees delivery —
        // failing the command would put a red mark on the board for a network
        // blip already covered, and earn a redelivery that adds nothing.
        await pullOnce();
        await ack(command, { status: "done" });
        return;
      default:
        // A newer control plane can enqueue a kind this build has never heard
        // of. Failing it explicitly puts the reason on the board; ignoring it
        // would let the row be reclaimed until it silently hits the attempts
        // ceiling.
        await ack(command, {
          status: "failed",
          reason: "unknown_kind",
          error: `This machine does not understand the command "${command.kind}". It may be running an older version of core.`,
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, commandId: command.id, kind: command.kind }, "command failed");
    await ack(command, { status: "failed", reason: "spawn_failed", error: message });
  }
}

type Outcome = { ok: true } | { ok: false; failure: { reason: CommandFailureReason; error: string; detail?: string } };

async function ackResult(command: ClaimedCommand, outcome: Outcome): Promise<void> {
  if (outcome.ok) {
    await ack(command, { status: "done" });
    return;
  }
  await ack(command, {
    status: "failed",
    reason: outcome.failure.reason,
    error: outcome.failure.error,
    detail: outcome.failure.detail,
  });
}

function startRun(payload: RunStartPayload): Outcome {
  if (!payload?.runId || !payload.agentSlug) {
    return {
      ok: false,
      failure: { reason: "spawn_failed", error: "The run.start command was missing a run id or agent slug." },
    };
  }

  // A run this machine already has is a REPLAY, not a second run: the ack was
  // lost, the lease expired, and the row came back. Creating it again would run
  // the user's work twice, which is the one failure exactly-once exists to
  // prevent.
  if (runManager.getRun(payload.runId)) {
    logger.info({ runId: payload.runId }, "run already exists locally — acking the replayed command");
    return { ok: true };
  }

  const resolved = resolveAgent(payload);
  if (!resolved.ok) return resolved;

  // Registered BEFORE the run is created. The reporter filters on this set, and
  // `createRun` publishes `run.created` synchronously — register afterwards and
  // the first event is dropped, so the browser never sees the run start.
  markDispatched(payload.runId);

  runManager.createRun({
    id: payload.runId,
    agentId: resolved.value.localAgentId,
    projectId: resolved.value.localProjectId,
    prompt: payload.prompt,
    trigger: (payload.trigger as "manual") ?? "manual",
    triggerRef: payload.taskId ?? null,
    lane: (payload.lane as "foreground") ?? "foreground",
  });

  return { ok: true };
}

function cancelRun(payload: RunCancelPayload): Outcome {
  if (!payload?.runId) {
    return { ok: false, failure: { reason: "spawn_failed", error: "The run.cancel command was missing a run id." } };
  }

  try {
    runManager.cancel(payload.runId);
    return { ok: true };
  } catch {
    // Unknown here, or already finished. Both ack `done`: the command asked for
    // this run not to be executing, and it is not. Reporting failure would put
    // a red mark on the board for an outcome the user got.
    logger.info({ runId: payload.runId }, "cancel: run is not running here — acking as done");
    return { ok: true };
  }
}

/**
 * `settings.set` — the control plane writing a setting on this machine.
 *
 * The allowlist is the whole safety story, and this is its enforcement point.
 * Without it the command is a remote write into every setting this machine has,
 * including ones added later by someone who never read this comment. Same
 * lesson as M3's `POST /api/daemon/status`, in a more dangerous position.
 */
function applySetting(payload: SettingsSetPayload): Outcome {
  if (!payload?.key) {
    return { ok: false, failure: { reason: "setting_not_allowed", error: "No setting key was given." } };
  }
  if (!DAEMON_SETTABLE_KEYS.includes(payload.key)) {
    return {
      ok: false,
      failure: {
        reason: "setting_not_allowed",
        error: `"${payload.key}" cannot be set remotely.`,
      },
    };
  }

  const value = String(payload.value ?? "");
  // Same upsert the local `PUT /system/settings` route uses — one settings
  // table, one write shape, so a remotely-set value is indistinguishable from a
  // locally-set one to every reader.
  getDb()
    .insert(settings)
    .values({ key: payload.key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();

  logger.info({ key: payload.key, value }, "setting changed from the control plane");

  // Report the new value back, so the Machines card shows what this machine
  // confirmed rather than what the browser sent. Fire-and-forget: the setting
  // is already applied locally, and a failed report is corrected by the next
  // boot's registration. Awaiting it would make a network hiccup look like a
  // setting that did not take.
  void reportSettings();

  return { ok: true };
}

async function ack(command: ClaimedCommand, body: AckRequest): Promise<void> {
  try {
    await cloudFetch(`/commands/${command.id}/ack`, { body, retries: 2 });
  } catch (err) {
    // The lease is what saves this: an unacked command is reclaimed when it
    // expires. Not fatal, and not worth failing the run that already started —
    // which is exactly why `run.start` acks after creating the local row and
    // guards against replays.
    logger.warn({ err, commandId: command.id }, "could not ack a command — the lease will expire and it will be redelivered");
  }
}

/**
 * Start polling. Safe on an unpaired machine: the loop runs and does nothing
 * until a pairing appears, which is what lets `sparstrow pair` be noticed
 * without a restart.
 */
export function startCommandLoop(): void {
  if (timer) return;
  stopped = false;
  healthy = true;
  // Reset the single-flight latch, not just the stop flag. A loop stopped while
  // a poll was outstanding — a shutdown that was cancelled, a revocation
  // followed by re-pairing — leaves `inFlight` true with nothing left to clear
  // it, and every subsequent tick returns at the guard. The loop would look
  // alive and never ask for work again.
  //
  // Any genuinely outstanding poll still finishes and dispatches what it
  // claimed; the worst case here is one overlapping request, which is strictly
  // better than a loop that is permanently deaf.
  inFlight = false;

  void poll();
  timer = setInterval(() => void poll(), COMMAND_POLL_INTERVAL_MS);
  // Without unref, this keeps Node alive and turns a clean exit into a hang.
  timer.unref?.();
}

export function stopCommandLoop(): void {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
