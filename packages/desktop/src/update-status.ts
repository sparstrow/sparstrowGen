import type { UpdateStatus } from "./updater";

/**
 * Consecutive failed checks before a feed that has never once been reached is
 * treated as broken rather than as a machine that happens to be offline. The
 * shell checks at launch and every 30 minutes, so this is roughly an hour.
 */
export const FEED_FAILURE_THRESHOLD = 3;

export interface CheckFailureContext {
  state: UpdateStatus["state"];
  /** Failed checks since the last one that reached the feed. */
  consecutiveFailures: number;
  /** Whether any check has ever got an answer — update available OR up to date. */
  everReachedFeed: boolean;
}

/**
 * Whether an autoUpdater check failure is worth showing the user.
 *
 * Being offline is routine and must stay silent, which is why these were
 * suppressed. But that also silenced the case where the feed has *never*
 * worked — no release published, or a 404 on latest.yml — making a release
 * pipeline that had never run look identical to a healthy one. A feed that has
 * answered before and stops is offline; a feed that has never answered is
 * misconfigured, and only the second is worth interrupting the user for.
 */
export function shouldSurfaceCheckError(ctx: CheckFailureContext): boolean {
  if (ctx.state !== "idle" && ctx.state !== "available") return true;
  return !ctx.everReachedFeed && ctx.consecutiveFailures >= FEED_FAILURE_THRESHOLD;
}
