import type { Run } from "@sparstrow/shared";
import { logger } from "../logger.js";
import { maybeWakeWaitingParent } from "../taskboard/delegation.js";
import {
  createTask,
  getTask,
  resolveAgentRef,
  updateTask,
} from "../taskboard/service.js";

/**
 * Post-run bookkeeping:
 * 1. Fenced ```sparstrow``` JSON blocks — the structured-handoff fallback for
 *    agents without MCP tools (antigravity): task_update / handoff directives.
 * 2. Task reconciliation — a task-triggered run whose agent never called
 *    task_update lands in 'review' (succeeded) or 'failed', so nothing sticks.
 * 3. Delegation watcher (P3): a lead whose run just exited may already have every
 *    child terminal (they finished while it was still running — the S4-a guard
 *    deferred the wake); re-evaluate it now.
 */
export function processRunCompletion(run: Run): void {
  try {
    if (run.resultText) applyDirectives(run);
  } catch (err) {
    logger.warn({ err, runId: run.id }, "handoff directive processing failed");
  }
  try {
    reconcileTask(run);
  } catch (err) {
    logger.warn({ err, runId: run.id }, "task reconciliation failed");
  }
  try {
    if (run.trigger === "task" && run.triggerRef) {
      const task = getTask(run.triggerRef);
      if (task?.status === "waiting_children") maybeWakeWaitingParent(task.id);
    }
  } catch (err) {
    logger.warn({ err, runId: run.id }, "post-run delegation wake failed");
  }
}

interface SparstrowDirective {
  task_update?: { taskId: string; status?: string; result?: string };
  handoff?: { to_agent: string; prompt: string; title?: string };
}

function applyDirectives(run: Run): void {
  const blocks = [...run.resultText!.matchAll(/```sparstrow\s*\n([\s\S]*?)```/g)];
  for (const match of blocks) {
    let directive: SparstrowDirective;
    try {
      directive = JSON.parse(match[1] ?? "{}") as SparstrowDirective;
    } catch {
      logger.warn({ runId: run.id }, "unparseable sparstrow directive block");
      continue;
    }

    if (directive.task_update?.taskId) {
      const { taskId, status, result } = directive.task_update;
      const task = getTask(taskId);
      if (task && (task.assignedAgentId === run.agentId || task.createdByAgentId === run.agentId)) {
        const validStatus = ["in_progress", "review", "done", "failed"].includes(status ?? "")
          ? (status as "in_progress" | "review" | "done" | "failed")
          : undefined;
        updateTask(
          taskId,
          {
            ...(validStatus ? { status: validStatus } : {}),
            ...(result !== undefined ? { result } : {}),
          },
          { triggerRun: false },
        );
        logger.info({ runId: run.id, taskId, status }, "applied task_update directive");
      }
    }

    if (directive.handoff?.to_agent && directive.handoff.prompt) {
      try {
        const assignee = resolveAgentRef(directive.handoff.to_agent);
        const task = createTask({
          title: directive.handoff.title ?? `Handoff from run ${run.id}`,
          description: directive.handoff.prompt,
          projectId: run.projectId,
          assignedAgentId: assignee.id,
          createdByType: "agent",
          createdByAgentId: run.agentId,
        });
        logger.info(
          { runId: run.id, taskId: task.id, to: assignee.name },
          "applied handoff directive",
        );
      } catch (err) {
        logger.warn({ err, runId: run.id }, "handoff directive target not found");
      }
    }
  }
}

function reconcileTask(run: Run): void {
  if (run.trigger !== "task" || !run.triggerRef) return;
  const task = getTask(run.triggerRef);
  if (!task || task.runId !== run.id) return;
  if (task.status !== "in_progress") return; // agent already reported via tool/directive

  if (run.status === "succeeded") {
    updateTask(
      task.id,
      { status: "review", result: run.resultText ?? "(no result text)" },
      { triggerRun: false },
    );
  } else {
    updateTask(
      task.id,
      { status: "failed", result: run.error ?? `run ended with status ${run.status}` },
      { triggerRun: false },
    );
  }
}
