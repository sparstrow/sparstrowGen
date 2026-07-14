/**
 * Process-lifecycle hooks the API can trigger (used by the desktop shell:
 * tray "pause scheduler", graceful POST /system/shutdown).
 */

let shutdownHandler: ((reason: string) => Promise<void>) | null = null;
let schedulerEnabled = true;

export function registerShutdownHandler(fn: (reason: string) => Promise<void>): void {
  shutdownHandler = fn;
}

export async function requestShutdown(reason: string): Promise<boolean> {
  if (!shutdownHandler) return false;
  await shutdownHandler(reason);
  return true;
}

export function setSchedulerEnabled(value: boolean): void {
  schedulerEnabled = value;
}

export function isSchedulerEnabled(): boolean {
  return schedulerEnabled;
}

/**
 * 0004 Phase 2 — update drain. While draining, the run manager admits no new
 * runs (queued runs stay queued; running ones finish). The desktop updater
 * sets this via POST /system/prepare-update, polls /system/update-readiness
 * until busy===0, then quitAndInstall()s; a user cancel clears it via
 * POST /system/resume-after-update.
 */
let draining = false;

export function setDraining(value: boolean): void {
  draining = value;
}

export function isDraining(): boolean {
  return draining;
}
