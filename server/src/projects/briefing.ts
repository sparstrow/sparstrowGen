import { and, eq } from "drizzle-orm";
import type { CronJob } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { cronJobs, projects } from "../db/schema.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { getSystemAgentId, PROJECT_REPORTER_SLUG } from "../agents/system-agents.js";
import { createCronJob, getCronJob, updateCronJob } from "../scheduler/service.js";

/** Default schedule: 08:00 daily, in the host timezone. */
export const DEFAULT_BRIEFING_CRON = "0 8 * * *";

const BRIEFING_PROMPT = [
  "Write today's morning briefing for this project.",
  "",
  "Review the project's recent activity — recent runs and their outcomes, task status changes",
  "(especially anything blocked or awaiting the operator), memory updates, and recent git commits",
  "(use Read/Glob/Grep on the project's root directory if helpful).",
  "",
  'Write ONE concise memory note with scope "project" titled "Morning briefing" summarizing what',
  "changed and what needs attention — lead with blockers. Then send a one-line summary to the",
  'operator using the message_send tool (omit "to" so it reaches the user inbox), subject',
  '"Morning briefing". Do not modify any files.',
].join("\n");

/**
 * P4 §5 morning briefing — opt-in per project (P4-Q1). Modeled as a normal
 * cron_jobs row (targetType:'agent', targetId = the Project Reporter system agent,
 * projectId set): the scheduler already forwards projectId to createRun, so the
 * Reporter run is project-scoped for free. Opt-in is the row's `enabled` flag.
 * The (projectId, reporterAgentId) pair uniquely identifies a project's briefing.
 */
function reporterId(): string {
  const id = getSystemAgentId(PROJECT_REPORTER_SLUG);
  if (!id) throw new HttpError(500, "Project Reporter system agent is not seeded");
  return id;
}

export function getProjectBriefing(projectId: string): CronJob | null {
  const rid = getSystemAgentId(PROJECT_REPORTER_SLUG);
  if (!rid) return null;
  const row = getDb()
    .select()
    .from(cronJobs)
    .where(and(eq(cronJobs.projectId, projectId), eq(cronJobs.targetId, rid)))
    .get();
  return row ? ({ ...row } as unknown as CronJob) : null;
}

export interface BriefingConfig {
  enabled: boolean;
  cronExpr?: string;
  timezone?: string;
}

/** Enable/disable/reschedule the per-project briefing. Idempotent (one per project). */
export function setProjectBriefing(projectId: string, config: BriefingConfig): CronJob | null {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new HttpError(404, `project not found: ${projectId}`);

  const existing = getProjectBriefing(projectId);
  const cronExpr = config.cronExpr ?? existing?.cronExpr ?? DEFAULT_BRIEFING_CRON;
  const timezone = config.timezone ?? existing?.timezone ?? "system";

  if (existing) {
    return updateCronJob(existing.id, { enabled: config.enabled, cronExpr, timezone });
  }
  if (!config.enabled) return null; // nothing to disable
  return createCronJob({
    name: `Morning briefing — ${project.name}`,
    cronExpr,
    timezone,
    targetType: "agent",
    targetId: reporterId(),
    prompt: BRIEFING_PROMPT,
    projectId,
    enabled: true,
  });
}

/** Manually trigger the briefing now ("brief me"). Returns the cron job id or null. */
export function getBriefingJob(projectId: string): CronJob | null {
  const b = getProjectBriefing(projectId);
  return b ? getCronJob(b.id) : null;
}
