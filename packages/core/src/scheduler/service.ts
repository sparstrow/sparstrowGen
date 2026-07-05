import { Cron } from "croner";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { CronJob } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { cronJobs } from "../db/schema.js";
import { bus } from "../events/bus.js";
import { logger } from "../logger.js";
import { HttpError, runManager } from "../orchestrator/run-manager.js";
import { startPipeline } from "../orchestrator/pipeline-executor.js";

const nowIso = () => new Date().toISOString();
const handles = new Map<string, Cron>();

function rowToCronJob(row: typeof cronJobs.$inferSelect): CronJob {
  return { ...row } as unknown as CronJob;
}

function computeNext(cronExpr: string, timezone: string): string | null {
  try {
    const tz = timezone === "system" ? undefined : timezone;
    const c = new Cron(cronExpr, { timezone: tz });
    const next = c.nextRun();
    c.stop();
    return next?.toISOString() ?? null;
  } catch {
    return null;
  }
}

export function getCronJob(id: string): CronJob | null {
  const row = getDb().select().from(cronJobs).where(eq(cronJobs.id, id)).get();
  return row ? rowToCronJob(row) : null;
}

export function listCronJobs(): CronJob[] {
  return getDb().select().from(cronJobs).orderBy(desc(cronJobs.createdAt)).all().map(rowToCronJob);
}

export function createCronJob(input: {
  name: string;
  cronExpr: string;
  timezone: string;
  targetType: string;
  targetId: string;
  prompt: string;
  projectId?: string | null;
  enabled?: boolean;
}): CronJob {
  const db = getDb();
  const id = `cj_${nanoid(10)}`;
  const ts = nowIso();
  const next = computeNext(input.cronExpr, input.timezone);
  db.insert(cronJobs)
    .values({
      id,
      name: input.name,
      cronExpr: input.cronExpr,
      timezone: input.timezone,
      targetType: input.targetType,
      targetId: input.targetId,
      prompt: input.prompt,
      projectId: input.projectId ?? null,
      enabled: input.enabled ?? true,
      nextRunAt: next,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  const job = getCronJob(id)!;
  if (job.enabled) scheduleJob(job);
  return job;
}

export function updateCronJob(
  id: string,
  patch: Partial<{
    name: string;
    cronExpr: string;
    timezone: string;
    targetType: string;
    targetId: string;
    prompt: string;
    projectId: string | null;
    enabled: boolean;
  }>,
): CronJob {
  const existing = getCronJob(id);
  if (!existing) throw new HttpError(404, `cron job not found: ${id}`);
  const db = getDb();
  const expr = patch.cronExpr ?? existing.cronExpr;
  const tz = patch.timezone ?? existing.timezone;
  const next = computeNext(expr, tz);
  db.update(cronJobs)
    .set({ ...patch, nextRunAt: next, updatedAt: nowIso() })
    .where(eq(cronJobs.id, id))
    .run();
  const job = getCronJob(id)!;
  if (patch.enabled === false) {
    unscheduleJob(id);
  } else if (job.enabled) {
    scheduleJob(job);
  }
  return job;
}

export function deleteCronJob(id: string): void {
  if (!getCronJob(id)) throw new HttpError(404, `cron job not found: ${id}`);
  unscheduleJob(id);
  getDb().delete(cronJobs).where(eq(cronJobs.id, id)).run();
}

/**
 * Remove every cron job bound to a project (P4): cron_jobs.project_id has no FK
 * cascade, so a deleted project would otherwise leave live croner handles firing
 * against a stale job (and 404-ing inside fire()). Unschedule + delete them.
 */
export function deleteCronJobsForProject(projectId: string): number {
  const db = getDb();
  const rows = db.select({ id: cronJobs.id }).from(cronJobs).where(eq(cronJobs.projectId, projectId)).all();
  for (const { id } of rows) unscheduleJob(id);
  db.delete(cronJobs).where(eq(cronJobs.projectId, projectId)).run();
  return rows.length;
}

export function fireJobNow(id: string): void {
  const job = getCronJob(id);
  if (!job) throw new HttpError(404, `cron job not found: ${id}`);
  void fire(job);
}

function scheduleJob(job: CronJob): void {
  handles.get(job.id)?.stop();
  handles.delete(job.id);
  if (!job.enabled) return;
  try {
    const tz = job.timezone === "system" ? undefined : job.timezone;
    const cron = new Cron(job.cronExpr, { timezone: tz, protect: true }, () => {
      void fire(job);
    });
    handles.set(job.id, cron);
    const next = cron.nextRun();
    if (next) {
      getDb()
        .update(cronJobs)
        .set({ nextRunAt: next.toISOString() })
        .where(eq(cronJobs.id, job.id))
        .run();
    }
  } catch (err) {
    logger.warn({ err, jobId: job.id }, "failed to schedule cron job");
  }
}

function unscheduleJob(id: string): void {
  handles.get(id)?.stop();
  handles.delete(id);
}

async function fire(job: CronJob): Promise<void> {
  const db = getDb();
  const row = db.select().from(cronJobs).where(eq(cronJobs.id, job.id)).get();
  if (!row || !row.enabled) return;
  const now = nowIso();
  const next = computeNext(row.cronExpr, row.timezone);
  db.update(cronJobs).set({ lastRunAt: now, nextRunAt: next }).where(eq(cronJobs.id, job.id)).run();
  bus.publish({ type: "cron.fired", cronJobId: job.id, at: now });
  logger.info({ jobId: job.id, name: job.name }, "cron job fired");
  try {
    if (row.targetType === "agent") {
      runManager.createRun({
        agentId: row.targetId,
        prompt: row.prompt,
        trigger: "cron",
        triggerRef: job.id,
        projectId: row.projectId ?? null,
      });
    } else if (row.targetType === "pipeline") {
      startPipeline(row.targetId, row.prompt, "cron", row.projectId);
    }
  } catch (err) {
    logger.error({ err, jobId: job.id }, "cron job fire error");
  }
}

export function startScheduler(): void {
  const jobs = getDb().select().from(cronJobs).where(eq(cronJobs.enabled, true)).all();
  for (const row of jobs) scheduleJob(rowToCronJob(row));
  logger.info({ count: jobs.length }, "scheduler started");
}

export function stopScheduler(): void {
  for (const [, c] of handles) c.stop();
  handles.clear();
  logger.info("scheduler stopped");
}
