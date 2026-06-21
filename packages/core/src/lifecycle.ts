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
