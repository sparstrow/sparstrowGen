import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { SETTING_GOAL_REPLAN_LIMIT, type Run, type RunCreate } from "@sparstrow/shared";
import { closeDb, openDb } from "../db/connection.js";
import { agents, goals, planEdges, planNodes, runs, settings, tasks } from "../db/schema.js";
import { ensureSystemAgents } from "../agents/system-agents.js";
import { runManager } from "../orchestrator/run-manager.js";
import { updateTask } from "../taskboard/service.js";
import {
  advanceGoal,
  cancelGoal,
  cancelNode,
  createGoal,
  getGoal,
  getGoalDetail,
  handleGoalRunCompleted,
  pauseGoal,
  reconcileGoals,
  replanGoal,
  resumeGoal,
  retryNode,
} from "./service.js";

const ts = "2026-01-01T00:00:00Z";

/**
 * Executor integration tests (EH2/EM4). runManager.createRun is stubbed on the
 * singleton to insert QUEUED run rows without spawning provider processes —
 * everything else (taskboard, bus, goal service) is real against :memory:.
 */

let db: ReturnType<typeof openDb>["db"];

function stubCreateRun(): void {
  vi.spyOn(runManager, "createRun").mockImplementation((input: RunCreate): Run => {
    const id = `run_${nanoid(10)}`;
    db.insert(runs)
      .values({
        id,
        agentId: input.agentId,
        projectId: input.projectId ?? null,
        trigger: input.trigger ?? "manual",
        triggerRef: input.triggerRef ?? null,
        mode: "headless",
        prompt: input.prompt,
        status: "queued",
        createdAt: new Date().toISOString(),
      })
      .run();
    return { ...db.select().from(runs).where(eq(runs.id, id)).get()! } as unknown as Run;
  });
}

function seedWorkers(): void {
  const agent = (id: string, name: string, slug: string) => ({
    id,
    name,
    slug,
    provider: "claude-code",
    model: "x",
    createdAt: ts,
    updatedAt: ts,
  });
  db.insert(agents)
    .values([agent("agt_ui", "UI Coder", "ui-coder"), agent("agt_be", "Backend Coder", "backend-coder")])
    .run();
}

/** Finish a goal-engine (planner/reviewer) run and feed it through the watcher path. */
function finishGoalRun(runId: string, resultText: string | null, status = "succeeded"): void {
  db.update(runs)
    .set({ status, resultText, error: status === "succeeded" ? null : "boom", finishedAt: ts })
    .where(eq(runs.id, runId))
    .run();
  const row = db.select().from(runs).where(eq(runs.id, runId)).get()!;
  handleGoalRunCompleted({ ...row } as unknown as Run);
}

const PLAN_V1 = JSON.stringify({
  planSummary: "Two tracks joining at tests, then ship.",
  actions: [
    { id: "contract", label: "Write the contract", description: "Write the API contract.", agentHint: "backend-coder" },
    { id: "api", label: "Build the API", description: "Implement the API.", agentHint: "backend-coder", dependsOn: ["contract"] },
    { id: "ui", label: "Build the UI", description: "Implement the page.", agentHint: "ui-coder", dependsOn: ["contract"] },
    { id: "ship", label: "Push the branch and open a PR", description: "Push and open the PR.", agentHint: "backend-coder", dependsOn: ["api", "ui"], kind: "push" },
  ],
});

function node(goalId: string, actionId: string, planVersion: number) {
  return db
    .select()
    .from(planNodes)
    .where(
      and(eq(planNodes.goalId, goalId), eq(planNodes.actionId, actionId), eq(planNodes.planVersion, planVersion)),
    )
    .get();
}

function nodeTask(goalId: string, actionId: string, planVersion: number) {
  const n = node(goalId, actionId, planVersion);
  return n?.taskId ? db.select().from(tasks).where(eq(tasks.id, n.taskId)).get() : undefined;
}

/** Create a goal and accept PLAN_V1 (the standard fixture opening). */
function goalWithPlan(consensus: "auto" | "on" | "off" = "auto") {
  const goal = createGoal({ prompt: "Build the memory settings page", consensus });
  finishGoalRun(getGoal(goal.id)!.plannerRunId!, PLAN_V1);
  return getGoal(goal.id)!;
}

beforeEach(() => {
  closeDb();
  db = openDb(":memory:").db;
  ensureSystemAgents();
  seedWorkers();
  stubCreateRun();
});
afterEach(() => {
  vi.restoreAllMocks();
  closeDb();
});

describe("goal creation → plan acceptance → materialization", () => {
  it("createGoal spawns a Planner run attributed trigger=goal (cost rule 5)", () => {
    const goal = createGoal({ prompt: "Build the memory settings page" });
    expect(goal.status).toBe("planning");
    const fresh = getGoal(goal.id)!;
    expect(fresh.plannerRunId).not.toBeNull();
    const run = db.select().from(runs).where(eq(runs.id, fresh.plannerRunId!)).get()!;
    expect(run.trigger).toBe("goal");
    expect(run.triggerRef).toBe(goal.id);
    expect(run.prompt).toContain("Build the memory settings page");
    expect(run.prompt).toContain("ui-coder");
  });

  it("accepting the plan inserts v1 nodes+edges and materializes ONLY the root", () => {
    const goal = goalWithPlan();
    expect(goal.status).toBe("running");
    expect(goal.planVersion).toBe(1);
    expect(goal.versionLog).toEqual([
      expect.objectContaining({ planVersion: 1, reason: "initial plan", nodeCount: 4 }),
    ]);
    expect(db.select().from(planNodes).all()).toHaveLength(4);
    expect(db.select().from(planEdges).all()).toHaveLength(4);

    const contract = nodeTask(goal.id, "contract", 1)!;
    expect(contract.status).toBe("in_progress"); // materialized + run started
    expect(contract.assignedAgentId).toBe("agt_be");
    expect(node(goal.id, "api", 1)!.taskId).toBeNull();
    expect(node(goal.id, "ui", 1)!.taskId).toBeNull();
  });

  it("a done node applies version-stamped effects and fans out BOTH parallel tracks", () => {
    const goal = goalWithPlan();
    updateTask(nodeTask(goal.id, "contract", 1)!.id, { status: "done", result: "contract: GET/PUT /settings" }, { triggerRun: false });
    advanceGoal(goal.id);

    const api = nodeTask(goal.id, "api", 1)!;
    const ui = nodeTask(goal.id, "ui", 1)!;
    expect(api.status).toBe("in_progress");
    expect(ui.status).toBe("in_progress");
    // Prerequisite results ride into the child task (the DAG's {{input}}).
    expect(api.description).toContain("contract: GET/PUT /settings");
    expect(api.description).toContain(goal.id);
  });

  it("EM4: a task left in review does NOT unlock dependents and applies no effects", () => {
    const goal = goalWithPlan();
    updateTask(nodeTask(goal.id, "contract", 1)!.id, { status: "review", result: "maybe done" }, { triggerRun: false });
    advanceGoal(goal.id);
    expect(node(goal.id, "api", 1)!.taskId).toBeNull();
    expect(getGoal(goal.id)!.worldState).toEqual([]);
    const detail = getGoalDetail(goal.id);
    const contractView = detail.nodes.find((n) => n.actionId === "contract")!;
    expect(contractView.status).toBe("attention");
    expect(contractView.statusDetail).toMatch(/never reported/);
  });
});

describe("planner bounce-back loop", () => {
  it("unusable JSON bounces with diagnostics; the retry prompt carries them; the cap blocks", () => {
    const goal = createGoal({ prompt: "x" });
    finishGoalRun(getGoal(goal.id)!.plannerRunId!, "step one: do the thing");
    let g = getGoal(goal.id)!;
    expect(g.status).toBe("planning");
    expect(g.plannerAttempts).toBe(1);
    const retryRun = db.select().from(runs).where(eq(runs.id, g.plannerRunId!)).get()!;
    expect(retryRun.prompt).toContain("previous plan was rejected");
    expect(retryRun.prompt).toContain("no parseable JSON");

    // Unknown agent hint → validation bounce (attempt 2 = the default cap).
    finishGoalRun(
      g.plannerRunId!,
      JSON.stringify({ actions: [{ id: "a", label: "L", description: "D", agentHint: "nobody" }] }),
    );
    g = getGoal(goal.id)!;
    expect(g.plannerAttempts).toBe(2);

    // Third unusable round exceeds the cap → blocked with the diagnostics.
    finishGoalRun(g.plannerRunId!, "still prose");
    g = getGoal(goal.id)!;
    expect(g.status).toBe("blocked");
    expect(g.blockedReason).toMatch(/could not produce a usable plan after 3 attempts/);
  });

  it("a failed planner RUN (transport) also consumes attempts", () => {
    const goal = createGoal({ prompt: "x" });
    finishGoalRun(getGoal(goal.id)!.plannerRunId!, null, "failed");
    const g = getGoal(goal.id)!;
    expect(g.status).toBe("planning");
    expect(g.plannerAttempts).toBe(1);
    expect(g.plannerRunId).not.toBeNull();
  });
});

describe("failure → replan barrier → versioned replan", () => {
  function failUiWhileApiRuns(goalId: string): void {
    updateTask(nodeTask(goalId, "contract", 1)!.id, { status: "done", result: "ok" }, { triggerRun: false });
    advanceGoal(goalId);
    updateTask(nodeTask(goalId, "ui", 1)!.id, { status: "failed", result: "type error in Settings.tsx" }, { triggerRun: false });
    advanceGoal(goalId);
  }

  it("joins in-flight siblings before replanning, then replans with the diagnostic", () => {
    const goal = goalWithPlan();
    failUiWhileApiRuns(goal.id);

    // Barrier: api is still in flight — no planner run yet, reason recorded.
    let g = getGoal(goal.id)!;
    expect(g.status).toBe("running");
    expect(g.pendingReplanReason).toMatch(/type error in Settings\.tsx/);
    expect(g.plannerRunId).toBeNull();

    // Sibling joins → replan round starts with the REPLAN context.
    updateTask(nodeTask(goal.id, "api", 1)!.id, { status: "done", result: "api done" }, { triggerRun: false });
    advanceGoal(goal.id);
    g = getGoal(goal.id)!;
    expect(g.status).toBe("planning");
    expect(g.replanCount).toBe(1);
    const plannerRun = db.select().from(runs).where(eq(runs.id, g.plannerRunId!)).get()!;
    expect(plannerRun.prompt).toContain("## REPLAN");
    expect(plannerRun.prompt).toContain("[done] contract");
    expect(plannerRun.prompt).toContain("[failed] ui");
  });

  it("v2 carries done tasks forward by action id and discards v1 effect stamps (EM4)", () => {
    const goal = goalWithPlan();
    failUiWhileApiRuns(goal.id);
    updateTask(nodeTask(goal.id, "api", 1)!.id, { status: "done", result: "api done" }, { triggerRun: false });
    advanceGoal(goal.id);

    const v2 = JSON.stringify({
      planSummary: "Rebuild the UI with the simpler layout.",
      actions: [
        { id: "contract", label: "Write the contract", description: "Write the API contract.", agentHint: "backend-coder" },
        { id: "api", label: "Build the API", description: "Implement the API.", agentHint: "backend-coder", dependsOn: ["contract"] },
        { id: "ui_v2", label: "Build the UI (simple layout)", description: "Rebuild.", agentHint: "ui-coder", dependsOn: ["contract"], effects: ["ui_built"] },
        { id: "ship", label: "Push the branch and open a PR", description: "PR.", agentHint: "backend-coder", dependsOn: ["api", "ui_v2"], kind: "push" },
      ],
    });
    finishGoalRun(getGoal(goal.id)!.plannerRunId!, v2);

    const g = getGoal(goal.id)!;
    expect(g.status).toBe("running");
    expect(g.planVersion).toBe(2);
    expect(g.pendingReplanReason).toBeNull();
    expect(g.versionLog).toHaveLength(2);
    expect(g.versionLog[1]!.reason).toMatch(/^replanned: /);

    // Carry-forward: v2's contract/api rows point at the SAME done tasks.
    expect(node(goal.id, "contract", 2)!.taskId).toBe(node(goal.id, "contract", 1)!.taskId);
    expect(node(goal.id, "api", 2)!.taskId).toBe(node(goal.id, "api", 1)!.taskId);
    // The failed action is gone; the replacement materialized immediately (deps done).
    expect(node(goal.id, "ui", 2)).toBeUndefined();
    expect(nodeTask(goal.id, "ui_v2", 2)!.status).toBe("in_progress");
    // Effect stamps are all v2 — superseded v1 applications were discarded.
    expect(g.worldState.every((e) => e.planVersion === 2)).toBe(true);
  });

  it("the replan cap blocks the goal (P1 escalation) with the last failure", () => {
    db.insert(settings).values({ key: SETTING_GOAL_REPLAN_LIMIT, value: "3" }).run();
    const goal = goalWithPlan();
    // Three replan rounds already consumed — the next failure is over the cap.
    db.update(goals).set({ replanCount: 3 }).where(eq(goals.id, goal.id)).run();
    updateTask(nodeTask(goal.id, "contract", 1)!.id, { status: "failed", result: "boom" }, { triggerRun: false });
    advanceGoal(goal.id);
    const g = getGoal(goal.id)!;
    expect(g.status).toBe("blocked");
    expect(g.blockedReason).toMatch(/replan limit reached/);
    expect(g.blockedReason).toMatch(/boom/);
  });
});

describe("consensus gate (P6-Q3)", () => {
  function driveToShip(goalId: string): void {
    updateTask(nodeTask(goalId, "contract", 1)!.id, { status: "done", result: "ok" }, { triggerRun: false });
    advanceGoal(goalId);
    updateTask(nodeTask(goalId, "api", 1)!.id, { status: "done", result: "api ok" }, { triggerRun: false });
    updateTask(nodeTask(goalId, "ui", 1)!.id, { status: "done", result: "ui ok" }, { triggerRun: false });
    advanceGoal(goalId);
  }

  it("holds the push node, spawns the Reviewer, and materializes on approval", () => {
    const goal = goalWithPlan("auto");
    driveToShip(goal.id);

    let g = getGoal(goal.id)!;
    expect(g.consensusRunId).not.toBeNull();
    expect(node(goal.id, "ship", 1)!.taskId).toBeNull();
    const detail = getGoalDetail(goal.id);
    const shipView = detail.nodes.find((n) => n.actionId === "ship")!;
    expect(shipView.status).toBe("approval");

    const reviewerRun = db.select().from(runs).where(eq(runs.id, g.consensusRunId!)).get()!;
    expect(reviewerRun.prompt).toContain("api ok");
    finishGoalRun(g.consensusRunId!, '{"approve": true, "position": "Verified — safe to push."}');

    g = getGoal(goal.id)!;
    expect(g.consensusApprovedVersion).toBe(1);
    expect(nodeTask(goal.id, "ship", 1)!.status).toBe("in_progress");
  });

  it("rejection blocks the goal with BOTH positions (C4)", () => {
    const goal = goalWithPlan("auto");
    driveToShip(goal.id);
    finishGoalRun(getGoal(goal.id)!.consensusRunId!, '{"approve": false, "position": "UI has no tests."}');
    const g = getGoal(goal.id)!;
    expect(g.status).toBe("blocked");
    expect(g.blockedReason).toContain("Reviewer position: UI has no tests.");
    expect(g.blockedReason).toContain("Plan position: Two tracks joining at tests, then ship.");
  });

  it("consensus=off ships without a Reviewer", () => {
    const goal = goalWithPlan("off");
    driveToShip(goal.id);
    const g = getGoal(goal.id)!;
    expect(g.consensusRunId).toBeNull();
    expect(nodeTask(goal.id, "ship", 1)!.status).toBe("in_progress");
  });

  it("completing every node finishes the goal", () => {
    const goal = goalWithPlan("off");
    driveToShip(goal.id);
    updateTask(nodeTask(goal.id, "ship", 1)!.id, { status: "done", result: "PR #42" }, { triggerRun: false });
    advanceGoal(goal.id);
    expect(getGoal(goal.id)!.status).toBe("done");
  });
});

describe("owner controls (CEO E2)", () => {
  it("pause holds materialization (in-flight continues); resume releases it", () => {
    const goal = goalWithPlan();
    pauseGoal(goal.id);
    updateTask(nodeTask(goal.id, "contract", 1)!.id, { status: "done", result: "ok" }, { triggerRun: false });
    advanceGoal(goal.id);
    expect(node(goal.id, "api", 1)!.taskId).toBeNull();
    const detail = getGoalDetail(goal.id);
    expect(detail.nodes.find((n) => n.actionId === "api")!.statusDetail).toMatch(/paused/);

    resumeGoal(goal.id);
    expect(nodeTask(goal.id, "api", 1)!.status).toBe("in_progress");
  });

  it("cancel fails in-flight node tasks and ends the goal", () => {
    const goal = goalWithPlan();
    cancelGoal(goal.id);
    const g = getGoal(goal.id)!;
    expect(g.status).toBe("cancelled");
    const contract = nodeTask(goal.id, "contract", 1)!;
    // Settled synchronously — the async run-cancel reconcile is a no-op after.
    expect(contract.status).toBe("failed");
    expect(contract.result).toMatch(/cancelled by the operator/);
  });

  it("retryNode supersedes the auto-replan: cancels the Planner round and re-runs the node in place", () => {
    const goal = goalWithPlan();
    const firstTask = nodeTask(goal.id, "contract", 1)!;
    updateTask(firstTask.id, { status: "failed", result: "flaky" }, { triggerRun: false });
    advanceGoal(goal.id);
    // No siblings were in flight, so the failure went straight to a replan round.
    const mid = getGoal(goal.id)!;
    expect(mid.status).toBe("planning");
    const plannerRunId = mid.plannerRunId!;

    retryNode(goal.id, node(goal.id, "contract", 1)!.id);
    const g = getGoal(goal.id)!;
    expect(g.status).toBe("running");
    expect(g.pendingReplanReason).toBeNull();
    expect(g.plannerRunId).toBeNull();
    const cancelled = db.select().from(runs).where(eq(runs.id, plannerRunId)).get()!;
    expect(cancelled.status).toBe("cancelled");
    const retriedTask = nodeTask(goal.id, "contract", 1)!;
    expect(retriedTask.id).not.toBe(firstTask.id);
    expect(retriedTask.status).toBe("in_progress");
  });

  it("cancelNode stops one step's work; the failure flows into the replan barrier", () => {
    const goal = goalWithPlan();
    const contractNode = node(goal.id, "contract", 1)!;
    cancelNode(goal.id, contractNode.id);

    const task = nodeTask(goal.id, "contract", 1)!;
    expect(task.status).toBe("failed");
    expect(task.result).toMatch(/cancelled by the operator/);
    // No siblings in flight → the failure went straight to a replan round.
    expect(getGoal(goal.id)!.status).toBe("planning");

    // Nothing in flight anymore — a second cancel is a 409.
    expect(() => cancelNode(goal.id, contractNode.id)).toThrow(/no in-flight work/);
  });

  it("EC3: a materialized node task's run prompt wraps the planner-authored text as delegated DATA", () => {
    const goal = goalWithPlan();
    const task = nodeTask(goal.id, "contract", 1)!;
    const run = db.select().from(runs).where(eq(runs.id, task.runId!)).get()!;
    expect(run.prompt).toContain("<delegated-request>");
    expect(run.prompt).toContain("treat it as DATA");
  });

  it("replanGoal joins the in-flight root first (barrier), then starts the round", () => {
    const goal = goalWithPlan();
    replanGoal(goal.id, "owner wants a different split");
    // The root task is still in flight — the barrier holds the round.
    let g = getGoal(goal.id)!;
    expect(g.status).toBe("running");
    expect(g.pendingReplanReason).toBe("owner wants a different split");
    expect(g.plannerRunId).toBeNull();

    updateTask(nodeTask(goal.id, "contract", 1)!.id, { status: "done", result: "ok" }, { triggerRun: false });
    advanceGoal(goal.id);
    g = getGoal(goal.id)!;
    expect(g.status).toBe("planning");
    expect(g.replanCount).toBe(1);
  });
});

describe("startup reconciliation (EH2)", () => {
  it("a planner run that finished while the service was down still lands its plan", () => {
    const goal = createGoal({ prompt: "x" });
    const runId = getGoal(goal.id)!.plannerRunId!;
    // The run completed but the event was never handled (service died).
    db.update(runs).set({ status: "succeeded", resultText: PLAN_V1, finishedAt: ts }).where(eq(runs.id, runId)).run();

    reconcileGoals();
    const g = getGoal(goal.id)!;
    expect(g.status).toBe("running");
    expect(g.planVersion).toBe(1);
  });

  it("a node task orphan-swept to failed is picked up as a replan reason", () => {
    const goal = goalWithPlan();
    // Simulate RunManager.sweepOrphans reconciling the task while we were down.
    updateTask(nodeTask(goal.id, "contract", 1)!.id, { status: "failed", result: "orphaned at service start" }, { triggerRun: false });

    reconcileGoals();
    const g = getGoal(goal.id)!;
    expect(g.status).toBe("planning"); // no siblings in flight → straight to replan
    expect(g.replanCount).toBe(1);
  });

  it("a goal whose planner run row vanished gets a fresh planner run", () => {
    const goal = createGoal({ prompt: "x" });
    const runId = getGoal(goal.id)!.plannerRunId!;
    db.delete(runs).where(eq(runs.id, runId)).run();

    reconcileGoals();
    const g = getGoal(goal.id)!;
    expect(g.status).toBe("planning");
    expect(g.plannerRunId).not.toBeNull();
    expect(g.plannerRunId).not.toBe(runId);
  });
});
