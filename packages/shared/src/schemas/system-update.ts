/**
 * 0004 Phase 2 — contract between core's drain-aware update endpoints and the
 * desktop shell's updater (POST /system/prepare-update, GET
 * /system/update-readiness, POST /system/resume-after-update).
 */

/** A still-running run blocking the update, as shown in "waiting for N agents…". */
export interface UpdateBlockingRun {
  id: string;
  agentId: string;
  agentName: string | null;
  startedAt: string | null;
}

/**
 * Drain state. `busy === 0 && draining` ⇒ safe to quitAndInstall: the
 * scheduler is paused and the run manager admits no new runs.
 */
export interface UpdateReadiness {
  draining: boolean;
  busy: number;
  runs: UpdateBlockingRun[];
}
