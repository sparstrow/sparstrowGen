import { HEARTBEAT_INTERVAL_MS } from "@sparstrow/shared";
import { logger } from "../logger.js";
import {
  CloudAuthError,
  CloudRequestError,
  cloudFetch,
  getRuntimes,
  invalidatePairingCache,
  isPaired,
} from "./client.js";
import { reclaimAfterUnknownRuntime } from "./claim.js";

/**
 * M3 — "I am still here."
 *
 * The cloud never learns that a machine died; it only notices that beats
 * stopped. That asymmetry is the whole design: `runtimes.status` is for states
 * a daemon DECLARES about itself (`draining` at shutdown), and liveness is
 * derived from `last_heartbeat` age by whoever is reading. A machine that
 * crashes writes nothing, so a stored `online` would stay `online` forever.
 */

let timer: NodeJS.Timeout | null = null;
/** Tracks the connectivity edge so a laptop offline overnight logs once, not 1,000 times. */
let healthy = true;
let stopped = false;

async function beat(): Promise<void> {
  if (stopped || !isPaired()) return;

  const runtimes = getRuntimes();
  if (runtimes.length === 0) {
    // Connected but placed nowhere — a brand-new account whose first workspace
    // has not been bootstrapped. Re-claiming is the only thing that can change
    // that, and it is cheap at heartbeat cadence.
    await reclaimAfterUnknownRuntime();
    return;
  }

  // One beat per workspace. `runtimes.status` and `last_heartbeat` live on the
  // per-workspace runtime row, so a machine that beat only into its first
  // workspace would show as online there and unreachable in every other —
  // which is exactly the bug a person with a personal and a work workspace
  // would hit on day one.
  const results = await Promise.allSettled(
    runtimes.map((binding) =>
      cloudFetch("/heartbeat", { retries: 1, timeoutMs: 10_000, runtimeId: binding.runtimeId }),
    ),
  );

  const authFailure = results.find(
    (r): r is PromiseRejectedResult =>
      r.status === "rejected" && r.reason instanceof CloudAuthError,
  );

  if (authFailure) {
    const err = authFailure.reason as CloudAuthError;
    if (err.revoked) {
      // The owner did this deliberately. Retrying forever would turn a
      // revocation into a request loop against the control plane, and this
      // machine is never getting back in on this token.
      logger.warn(
        "this computer's access was revoked — stopping heartbeat. Run `sparstrow setup --force` to reconnect.",
      );
      stopHeartbeat();
      return;
    }
    // 401: the token was rejected but not revoked. Most often the store was
    // rewritten while core was running, so re-read it before concluding
    // anything. This is what lets connecting take effect without a restart.
    invalidatePairingCache();
    if (!isPaired()) {
      logger.warn("access token is no longer valid — stopping heartbeat until reconnected");
      stopHeartbeat();
      return;
    }
    logger.info("access token was rejected; re-read the secret store and will retry");
    return;
  }

  // A runtime that no longer exists means the owner left that workspace while
  // this machine was running. Not a failure of this machine — a change
  // underneath it — so it re-claims rather than treating itself as broken.
  const unknownRuntime = results.some(
    (r) =>
      r.status === "rejected" &&
      r.reason instanceof CloudRequestError &&
      r.reason.reason === "unknown_runtime",
  );
  if (unknownRuntime) {
    await reclaimAfterUnknownRuntime();
    return;
  }

  const delivered = results.some((r) => r.status === "fulfilled");
  if (delivered) {
    if (!healthy) {
      healthy = true;
      logger.info("cloud control plane reachable again");
    }
    return;
  }

  if (healthy) {
    healthy = false;
    logger.warn("cloud control plane unreachable — heartbeats will keep retrying");
  }
}

export function startHeartbeat(): void {
  if (timer) return;
  stopped = false;
  healthy = true;

  void beat();
  timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  // An interval with no unref keeps Node alive and turns a clean exit into a
  // hang. Core's shutdown calls process.exit(0), so this would be survivable —
  // but a process that will not end on its own is exactly the wedge the
  // startup watchdog exists to complain about.
  timer.unref?.();
}

export function stopHeartbeat(): void {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Tell the cloud this machine is going away, so the UI says "shutting down"
 * instead of waiting out the staleness window to notice.
 *
 * Best-effort with a short timeout and no retries: shutdown must not block on
 * the network. A missed declaration costs nothing — the machine simply goes
 * stale the ordinary way.
 */
export async function declareDraining(): Promise<void> {
  stopHeartbeat();
  if (!isPaired()) return;
  try {
    await cloudFetch("/status", {
      body: { status: "draining" },
      retries: 0,
      timeoutMs: 2_000,
    });
  } catch {
    // Deliberately silent. Nothing useful can be done at this point in
    // shutdown, and a stack trace here would be the last thing in the log.
  }
}
