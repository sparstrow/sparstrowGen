import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { PipelineRun, Run } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { pipelineRuns, pipelineSteps, pipelines } from "../db/schema.js";
import { bus } from "../events/bus.js";
import { logger } from "../logger.js";
import { HttpError, runManager } from "./run-manager.js";

const nowIso = () => new Date().toISOString();

function rowToPipelineRun(row: typeof pipelineRuns.$inferSelect): PipelineRun {
  return { ...row } as unknown as PipelineRun;
}

export function getPipelineRun(id: string): PipelineRun | null {
  const row = getDb().select().from(pipelineRuns).where(eq(pipelineRuns.id, id)).get();
  return row ? rowToPipelineRun(row) : null;
}

export function listPipelineRuns(pipelineId: string, limit = 50): PipelineRun[] {
  return getDb()
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.pipelineId, pipelineId))
    .limit(limit)
    .all()
    .map(rowToPipelineRun);
}

function resolveTemplate(
  template: string,
  triggerPrompt: string,
  previousOutput: string | null,
  stepOutputs: Record<number, string>,
): string {
  return template
    .replace(/\{\{trigger_prompt\}\}/g, triggerPrompt)
    .replace(/\{\{input\}\}/g, previousOutput ?? triggerPrompt)
    .replace(/\{\{steps\.(\d+)\.output\}\}/g, (_, n) => stepOutputs[Number(n)] ?? "");
}

function waitForRun(runId: string): Promise<Run> {
  return new Promise((resolve) => {
    const existing = runManager.getRun(runId);
    if (existing && ["succeeded", "failed", "cancelled", "timeout"].includes(existing.status)) {
      resolve(existing);
      return;
    }
    const unsub = bus.subscribe((ev) => {
      if (ev.type === "run.completed" && ev.run.id === runId) {
        unsub();
        resolve(ev.run);
      }
    });
  });
}

async function doExecute(
  prId: string,
  pipelineId: string,
  triggerPrompt: string,
  projectId: string | null,
): Promise<void> {
  const db = getDb();
  const steps = db
    .select()
    .from(pipelineSteps)
    .where(eq(pipelineSteps.pipelineId, pipelineId))
    .orderBy(asc(pipelineSteps.position))
    .all();

  const stepOutputs: Record<number, string> = {};
  let lastOutput: string | null = null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    db.update(pipelineRuns).set({ currentStep: i }).where(eq(pipelineRuns.id, prId)).run();
    bus.publish({ type: "pipeline-run.updated", pipelineRun: getPipelineRun(prId)! });

    const prompt = resolveTemplate(step.promptTemplate, triggerPrompt, lastOutput, stepOutputs);

    let run: Run;
    try {
      run = runManager.createRun({
        agentId: step.agentId,
        projectId,
        prompt,
        trigger: "pipeline",
        triggerRef: prId,
        pipelineRunId: prId,
        pipelineStepId: step.id,
      });
    } catch (err) {
      logger.warn({ err, prId, step: i }, "pipeline step run creation failed");
      db.update(pipelineRuns)
        .set({ status: "failed", finishedAt: nowIso() })
        .where(eq(pipelineRuns.id, prId))
        .run();
      bus.publish({ type: "pipeline-run.updated", pipelineRun: getPipelineRun(prId)! });
      return;
    }

    logger.info({ prId, step: i, runId: run.id }, "pipeline step started");
    const completed = await waitForRun(run.id);

    const output = completed.resultText ?? "";
    stepOutputs[i] = output;
    lastOutput = output;

    const failed =
      completed.status === "failed" ||
      completed.status === "timeout" ||
      completed.status === "cancelled";
    if (failed && step.onFailure === "abort") {
      db.update(pipelineRuns)
        .set({ status: "failed", finishedAt: nowIso(), currentStep: i })
        .where(eq(pipelineRuns.id, prId))
        .run();
      bus.publish({ type: "pipeline-run.updated", pipelineRun: getPipelineRun(prId)! });
      logger.warn({ prId, step: i, runStatus: completed.status }, "pipeline aborted at step");
      return;
    }
  }

  db.update(pipelineRuns)
    .set({ status: "succeeded", finishedAt: nowIso(), currentStep: steps.length })
    .where(eq(pipelineRuns.id, prId))
    .run();
  bus.publish({ type: "pipeline-run.updated", pipelineRun: getPipelineRun(prId)! });
  logger.info({ prId }, "pipeline run succeeded");
}

export function startPipeline(
  pipelineId: string,
  triggerPrompt: string,
  trigger: string,
  projectId?: string | null,
): PipelineRun {
  const db = getDb();
  const pipeline = db.select().from(pipelines).where(eq(pipelines.id, pipelineId)).get();
  if (!pipeline) throw new HttpError(404, `pipeline not found: ${pipelineId}`);
  if (!pipeline.enabled) throw new HttpError(409, `pipeline is disabled: ${pipeline.name}`);

  const steps = db
    .select()
    .from(pipelineSteps)
    .where(eq(pipelineSteps.pipelineId, pipelineId))
    .limit(1)
    .all();
  if (steps.length === 0) throw new HttpError(409, "pipeline has no steps");

  const prId = `pr_${nanoid(10)}`;
  db.insert(pipelineRuns)
    .values({
      id: prId,
      pipelineId,
      status: "running",
      trigger,
      triggerPrompt,
      currentStep: 0,
      startedAt: nowIso(),
    })
    .run();

  const pr = getPipelineRun(prId)!;
  bus.publish({ type: "pipeline-run.updated", pipelineRun: pr });
  logger.info({ prId, pipeline: pipeline.name }, "pipeline run queued");

  void doExecute(prId, pipelineId, triggerPrompt, projectId ?? null).catch((err) => {
    logger.error({ err, prId }, "pipeline executor crashed");
    db.update(pipelineRuns)
      .set({ status: "failed", finishedAt: nowIso() })
      .where(eq(pipelineRuns.id, prId))
      .run();
    bus.publish({ type: "pipeline-run.updated", pipelineRun: getPipelineRun(prId)! });
  });

  return pr;
}
