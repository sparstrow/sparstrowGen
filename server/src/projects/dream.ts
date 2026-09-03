import { and, eq } from "drizzle-orm";
import type { CronJob } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { cronJobs, projects } from "../db/schema.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { createCronJob, getCronJob, updateCronJob } from "../scheduler/service.js";

/** Default schedule: 03:00 daily, host timezone — after the day's work, before the briefing. */
export const DEFAULT_DREAM_CRON = "0 3 * * *";

/**
 * P5 dream cycle opt-in (P5-Q1: OFF until enabled per project). Modeled on the
 * P4 briefing idiom: one cron_jobs row per project, targetType 'dream' with
 * targetId = the PROJECT id — the scheduler's fire() routes that to
 * runDreamCycle instead of spawning an agent run directly. Opt-in is the
 * row's `enabled` flag; (projectId, targetType='dream') is the identity.
 */
export function getProjectDream(projectId: string): CronJob | null {
  const row = getDb()
    .select()
    .from(cronJobs)
    .where(and(eq(cronJobs.projectId, projectId), eq(cronJobs.targetType, "dream")))
    .get();
  return row ? ({ ...row } as unknown as CronJob) : null;
}

export interface DreamConfig {
  enabled: boolean;
  cronExpr?: string;
  timezone?: string;
}

/** Enable/disable/reschedule the per-project dream cycle. Idempotent (one per project). */
export function setProjectDream(projectId: string, config: DreamConfig): CronJob | null {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new HttpError(404, `project not found: ${projectId}`);
  // Sandboxes get no autonomous background LLM work (#41 posture — the same
  // reason they never auto-index). Promote the project to enable dreaming.
  if (project.isSandbox && config.enabled) {
    throw new HttpError(400, "sandbox projects cannot enable the dream cycle — promote the project first");
  }

  const existing = getProjectDream(projectId);
  const cronExpr = config.cronExpr ?? existing?.cronExpr ?? DEFAULT_DREAM_CRON;
  const timezone = config.timezone ?? existing?.timezone ?? "system";

  if (existing) {
    return updateCronJob(existing.id, { enabled: config.enabled, cronExpr, timezone });
  }
  if (!config.enabled) return null; // nothing to disable
  return createCronJob({
    name: `Dream cycle — ${project.name}`,
    cronExpr,
    timezone,
    targetType: "dream",
    targetId: projectId,
    prompt: "(dream cycle — prompt is built nightly by the consolidator)",
    projectId,
    enabled: true,
  });
}
