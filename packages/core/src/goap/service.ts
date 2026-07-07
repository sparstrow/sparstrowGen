import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  DEFAULT_GOAL_PLANNER_RETRY_LIMIT,
  DEFAULT_GOAL_REPLAN_LIMIT,
  GOAL_MAX_PLAN_NODES,
  SETTING_GOAL_PLANNER_RETRY_LIMIT,
  SETTING_GOAL_REPLAN_LIMIT,
  type AppliedEffect,
  type Goal,
  type GoalCreate,
  type GoalDetail,
  type PlanEdge,
  type PlanNodeView,
  type Run,
  type Task,
  type TaskStatus,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import {
  agents,
  goals,
  planEdges,
  planNodes,
  projects,
  settings,
  tasks,
  teamMembers,
  teams,
} from "../db/schema.js";
import { bus } from "../events/bus.js";
import { logger } from "../logger.js";
import { HttpError, runManager } from "../orchestrator/run-manager.js";
import { resolveRunEffectiveTools } from "../agents/tool-resolution.js";
import { GOAL_PLANNER_SLUG, GOAL_REVIEWER_SLUG, getSystemAgentId } from "../agents/system-agents.js";
import { createTask, getTask, startTaskRun, updateTask } from "../taskboard/service.js";
import {
  deriveNodeStatus,
  diffPlans,
  planComplete,
  readyActionIds,
  validatePlan,
  type NodeExecView,
  type ValidatedAction,
} from "./dag.js";
import {
  buildPlannerPrompt,
  buildReviewerPrompt,
  parseConsensusVerdict,
  parsePlannerPlan,
  type PlannerRosterEntry,
} from "./planner.js";

/**
 * P6 goal executor — EH2 discipline: state lives ENTIRELY in goals/plan_nodes
 * rows; every transition is re-derivable from the DB, advanced by bus events,
 * and re-checked by a startup reconciliation pass. There is deliberately no
 * in-memory await anywhere in this file (the pipeline-executor anti-pattern).
 */

const nowIso = () => new Date().toISOString();
const rowToGoal = (row: typeof goals.$inferSelect): Goal => ({ ...row }) as unknown as Goal;

/** Task statuses that count as "work is in flight" for the replan join barrier. */
const IN_FLIGHT: TaskStatus[] = ["inbox", "todo", "in_progress", "waiting_children", "blocked_answered"];
/** Task statuses parked on a human gate — superseded (not joined) at the barrier. */
const HUMAN_HELD: TaskStatus[] = ["blocked", "review", "pending_approval"];

function readIntSetting(key: string, fallback: number): number {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  const n = Number.parseInt(row.value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const replanLimit = () => readIntSetting(SETTING_GOAL_REPLAN_LIMIT, DEFAULT_GOAL_REPLAN_LIMIT);
const plannerRetryLimit = () =>
  readIntSetting(SETTING_GOAL_PLANNER_RETRY_LIMIT, DEFAULT_GOAL_PLANNER_RETRY_LIMIT);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getGoal(id: string): Goal | null {
  const row = getDb().select().from(goals).where(eq(goals.id, id)).get();
  return row ? rowToGoal(row) : null;
}

export function listGoals(filter: { projectId?: string; status?: string } = {}): Goal[] {
  const conditions = [];
  if (filter.projectId) conditions.push(eq(goals.projectId, filter.projectId));
  if (filter.status) conditions.push(eq(goals.status, filter.status));
  return getDb()
    .select()
    .from(goals)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(goals.updatedAt))
    .limit(200)
    .all()
    .map(rowToGoal);
}

interface LoadedPlan {
  nodes: Array<typeof planNodes.$inferSelect>;
  edges: Array<typeof planEdges.$inferSelect>;
  /** taskId → task row for every materialized node. */
  taskById: Map<string, Task>;
  views: NodeExecView[];
  /** actionId-keyed edges for the pure DAG functions. */
  actionEdges: Array<{ from: string; to: string }>;
}

/** Load the CURRENT plan version's rows + task states (the executor's world). */
function loadCurrentPlan(goal: Goal): LoadedPlan {
  const db = getDb();
  const nodes =
    goal.planVersion === 0
      ? []
      : db
          .select()
          .from(planNodes)
          .where(and(eq(planNodes.goalId, goal.id), eq(planNodes.planVersion, goal.planVersion)))
          .all();
  const edges =
    goal.planVersion === 0
      ? []
      : db
          .select()
          .from(planEdges)
          .where(and(eq(planEdges.goalId, goal.id), eq(planEdges.planVersion, goal.planVersion)))
          .all();
  const taskIds = nodes.map((n) => n.taskId).filter((t): t is string => t !== null);
  const taskById = new Map<string, Task>(
    taskIds.length > 0
      ? db
          .select()
          .from(tasks)
          .where(inArray(tasks.id, taskIds))
          .all()
          .map((t) => [t.id, { ...t } as unknown as Task])
      : [],
  );
  const views: NodeExecView[] = nodes.map((n) => ({
    actionId: n.actionId,
    taskId: n.taskId,
    taskStatus: n.taskId ? (taskById.get(n.taskId)?.status ?? null) : null,
    kind: n.kind,
  }));
  const byNodeId = new Map(nodes.map((n) => [n.id, n.actionId]));
  const actionEdges = edges
    .map((e) => ({ from: byNodeId.get(e.fromNodeId), to: byNodeId.get(e.toNodeId) }))
    .filter((e): e is { from: string; to: string } => Boolean(e.from && e.to));
  return { nodes, edges, taskById, views, actionEdges };
}

/** P6-Q3: the gate applies when forced on, or auto + the plan contains a push node. */
function consensusRequired(goal: Goal, views: NodeExecView[]): boolean {
  if (goal.consensus === "off") return false;
  if (goal.consensus === "on") return true;
  return views.some((v) => v.kind === "push");
}

export function getGoalDetail(id: string): GoalDetail {
  const goal = getGoal(id);
  if (!goal) throw new HttpError(404, `goal not found: ${id}`);
  const { nodes, edges, taskById, views, actionEdges } = loadCurrentPlan(goal);
  const doneByAction = new Map(views.map((v) => [v.actionId, v.taskStatus === "done"]));
  const depsByAction = new Map<string, string[]>();
  for (const e of actionEdges) depsByAction.set(e.to, [...(depsByAction.get(e.to) ?? []), e.from]);
  const gate = consensusRequired(goal, views);

  const nodeViews: PlanNodeView[] = nodes.map((n) => {
    const view = views.find((v) => v.actionId === n.actionId)!;
    const depsDone = (depsByAction.get(n.actionId) ?? []).every((d) => doneByAction.get(d) === true);
    const consensusHold =
      gate &&
      n.kind === "push" &&
      view.taskId === null &&
      depsDone &&
      goal.consensusApprovedVersion !== goal.planVersion;
    const derived = deriveNodeStatus({ node: view, depsDone, goal, consensusHold });
    return {
      ...(n as unknown as Omit<PlanNodeView, "status" | "statusDetail">),
      status: derived.status,
      statusDetail: derived.statusDetail,
    } as PlanNodeView;
  });
  return { goal, nodes: nodeViews, edges: edges as unknown as PlanEdge[] };
}

// ---------------------------------------------------------------------------
// Roster (CEO S1-b: the Planner sees each agent's RESOLVED toolset)
// ---------------------------------------------------------------------------

function loadRoster(goal: Pick<Goal, "projectId" | "teamId">): {
  roster: PlannerRosterEntry[];
  rosterAgents: Array<typeof agents.$inferSelect>;
  teamLabel: string | null;
} {
  const db = getDb();
  let rows: Array<typeof agents.$inferSelect>;
  let teamLabel: string | null = null;
  if (goal.teamId) {
    const team = db.select().from(teams).where(eq(teams.id, goal.teamId)).get();
    teamLabel = team ? `team ${team.name}` : "the goal's team";
    rows = db
      .select()
      .from(agents)
      .innerJoin(teamMembers, eq(teamMembers.agentId, agents.id))
      .where(eq(teamMembers.teamId, goal.teamId))
      .all()
      .map((r) => r.agents);
  } else {
    rows = db.select().from(agents).all();
  }
  const usable = rows.filter((a) => a.enabled && !a.isSystem);
  const project = goal.projectId
    ? (db.select().from(projects).where(eq(projects.id, goal.projectId)).get() ?? null)
    : null;
  const roster: PlannerRosterEntry[] = usable.map((a) => {
    const resolved = resolveRunEffectiveTools({ agent: a, project });
    return {
      slug: a.slug,
      name: a.name,
      role: a.role,
      allowed: resolved.allowed,
      disallowed: resolved.disallowed,
    };
  });
  return { roster, rosterAgents: usable, teamLabel };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function saveGoal(id: string, patch: Partial<typeof goals.$inferInsert>): Goal {
  getDb()
    .update(goals)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(goals.id, id))
    .run();
  const goal = getGoal(id)!;
  bus.publish({ type: "goal.updated", goal });
  return goal;
}

function blockGoal(id: string, reason: string): Goal {
  logger.warn({ goalId: id, reason }, "goal blocked");
  return saveGoal(id, {
    status: "blocked",
    blockedReason: reason,
    plannerRunId: null,
    consensusRunId: null,
  });
}

export function createGoal(input: GoalCreate): Goal {
  const db = getDb();
  if (input.projectId) {
    const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get();
    if (!project) throw new HttpError(404, `project not found: ${input.projectId}`);
  }
  if (input.teamId) {
    const team = db.select().from(teams).where(eq(teams.id, input.teamId)).get();
    if (!team) throw new HttpError(404, `team not found: ${input.teamId}`);
  }
  const id = `gl_${nanoid(10)}`;
  const ts = nowIso();
  db.insert(goals)
    .values({
      id,
      projectId: input.projectId ?? null,
      teamId: input.teamId ?? null,
      prompt: input.prompt,
      status: "planning",
      consensus: input.consensus ?? "auto",
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  const goal = getGoal(id)!;
  bus.publish({ type: "goal.updated", goal });
  spawnPlanner(goal, {});
  return getGoal(id)!;
}

interface SpawnPlannerOpts {
  diagnostics?: string[] | null;
  previousPlanJson?: string | null;
}

function spawnPlanner(goal: Goal, opts: SpawnPlannerOpts): void {
  const plannerId = getSystemAgentId(GOAL_PLANNER_SLUG);
  if (!plannerId) {
    blockGoal(goal.id, "Goal Planner system agent is missing — restart the core to reseed it.");
    return;
  }
  const { roster, teamLabel } = loadRoster(goal);
  if (roster.length === 0) {
    blockGoal(
      goal.id,
      goal.teamId
        ? "the goal's team has no enabled agents to plan with."
        : "no enabled agents exist to plan with — create or enable an agent first.",
    );
    return;
  }
  const project = goal.projectId
    ? getDb().select().from(projects).where(eq(projects.id, goal.projectId)).get()
    : null;

  // A replan round (pendingReplanReason set on a goal that already has a plan)
  // gets the current plan state so the model repairs instead of restarting.
  let replan: { reason: string; nodes: Array<Pick<PlanNodeView, "actionId" | "label" | "status">> } | null = null;
  if (goal.pendingReplanReason && goal.planVersion > 0) {
    const detail = getGoalDetail(goal.id);
    replan = {
      reason: goal.pendingReplanReason,
      nodes: detail.nodes.map((n) => ({ actionId: n.actionId, label: n.label, status: n.status })),
    };
  }
  const prompt = buildPlannerPrompt({
    goal,
    roster,
    projectName: project?.name ?? null,
    diagnostics: opts.diagnostics ?? null,
    previousPlanJson: opts.previousPlanJson ?? null,
    replan,
  });
  try {
    const run = runManager.createRun({
      agentId: plannerId,
      projectId: goal.projectId,
      prompt,
      trigger: "goal",
      triggerRef: goal.id,
    });
    saveGoal(goal.id, { status: "planning", plannerRunId: run.id });
  } catch (err) {
    blockGoal(goal.id, `could not start the Planner run: ${(err as Error).message}`);
  }
}

/** Accept a validated plan as the next version (the ONLY writer of plan rows). */
function acceptPlan(goal: Goal, planSummary: string, actions: ValidatedAction[], reason: string): void {
  const db = getDb();
  const newVersion = goal.planVersion + 1;
  const ts = nowIso();

  const oldNodes =
    goal.planVersion > 0
      ? loadCurrentPlan(goal).views.map((v) => ({
          actionId: v.actionId,
          taskId: v.taskId,
          taskStatus: v.taskStatus,
        }))
      : [];
  const diff = diffPlans(oldNodes, actions);

  // Crash insurance: a previous accept that died between node insert and the
  // goal-row update leaves rows for this version — clear them (cascade edges).
  db.delete(planNodes)
    .where(and(eq(planNodes.goalId, goal.id), eq(planNodes.planVersion, newVersion)))
    .run();

  const nodeIdByAction = new Map<string, string>();
  for (const a of actions) {
    const id = `pn_${nanoid(10)}`;
    nodeIdByAction.set(a.id, id);
    db.insert(planNodes)
      .values({
        id,
        goalId: goal.id,
        planVersion: newVersion,
        actionId: a.id,
        label: a.label,
        description: a.description,
        agentHint: a.agentHint,
        agentId: a.agentId,
        kind: a.kind,
        pre: a.pre,
        effects: a.effects,
        cost: a.cost,
        // Completion carry-forward (EM4): a done action's new row points at
        // the same done task, so its work never re-runs.
        taskId: diff.carriedTaskByAction.get(a.id) ?? null,
        position: a.position,
        createdAt: ts,
      })
      .run();
  }
  for (const a of actions) {
    for (const dep of a.dependsOn) {
      db.insert(planEdges)
        .values({
          goalId: goal.id,
          planVersion: newVersion,
          fromNodeId: nodeIdByAction.get(dep)!,
          toNodeId: nodeIdByAction.get(a.id)!,
        })
        .run();
    }
  }

  // EM4 barrier rule: effect applications are version-stamped; applications
  // from superseded versions are DISCARDED. Carried-done actions re-stamp
  // their (possibly updated) effects at the new version.
  const worldState: AppliedEffect[] = actions
    .filter((a) => diff.carriedTaskByAction.has(a.id))
    .flatMap((a) =>
      a.effects.map((fact) => ({ fact, actionId: a.id, planVersion: newVersion, at: ts })),
    );

  saveGoal(goal.id, {
    status: "running",
    planVersion: newVersion,
    planSummary,
    plannerRunId: null,
    plannerAttempts: 0,
    pendingReplanReason: null,
    consensusRunId: null,
    worldState,
    versionLog: [
      ...goal.versionLog,
      { planVersion: newVersion, reason, at: ts, nodeCount: actions.length },
    ],
  });
  bus.publish({ type: "goal.plan.updated", goalId: goal.id, planVersion: newVersion });
  logger.info(
    { goalId: goal.id, planVersion: newVersion, nodes: actions.length, carried: diff.carriedTaskByAction.size },
    "goal plan accepted",
  );
  advanceGoal(goal.id);
}

// ---------------------------------------------------------------------------
// The advance loop — idempotent, synchronous, derived entirely from rows.
// ---------------------------------------------------------------------------

const advancing = new Set<string>();

export function advanceGoal(goalId: string): void {
  if (advancing.has(goalId)) return;
  advancing.add(goalId);
  try {
    advanceGoalInner(goalId);
  } catch (err) {
    logger.error({ err, goalId }, "goal advance failed");
  } finally {
    advancing.delete(goalId);
  }
}

function advanceGoalInner(goalId: string): void {
  let goal = getGoal(goalId);
  if (!goal || goal.status !== "running" || goal.planVersion === 0) return;
  const plan = loadCurrentPlan(goal);
  const { views, actionEdges } = plan;

  // 1. Apply effects for done nodes (idempotent; version-stamped — EM4).
  const applied = new Set(goal.worldState.map((e) => `${e.planVersion}:${e.actionId}:${e.fact}`));
  const newEffects: AppliedEffect[] = [];
  for (const node of plan.nodes) {
    const view = views.find((v) => v.actionId === node.actionId)!;
    if (view.taskStatus !== "done") continue;
    for (const fact of node.effects) {
      const key = `${goal.planVersion}:${node.actionId}:${fact}`;
      if (applied.has(key)) continue;
      applied.add(key);
      newEffects.push({ fact, actionId: node.actionId, planVersion: goal.planVersion, at: nowIso() });
    }
  }
  if (newEffects.length > 0) {
    goal = saveGoal(goal.id, { worldState: [...goal.worldState, ...newEffects] });
  }

  // 2. Failure detection (row-derived — also catches failures that happened
  //    while the service was down, and vanished task rows).
  const failed = views.filter((v) => v.taskId !== null && (v.taskStatus === "failed" || v.taskStatus === null));
  if (failed.length > 0 && !goal.pendingReplanReason) {
    const details = failed
      .map((f) => {
        const node = plan.nodes.find((n) => n.actionId === f.actionId)!;
        const task = f.taskId ? plan.taskById.get(f.taskId) : null;
        return `node "${node.label}" (${f.actionId}) failed: ${task?.result ?? "its task no longer exists"}`;
      })
      .join("; ");
    goal = saveGoal(goal.id, { pendingReplanReason: details });
  }

  // 3. Replan barrier: join in-flight siblings, supersede human-held ones,
  //    then re-plan (or block at the cap).
  if (goal.pendingReplanReason) {
    const inFlight = views.filter((v) => v.taskStatus !== null && IN_FLIGHT.includes(v.taskStatus));
    if (inFlight.length > 0) return; // join — their terminal events re-advance
    for (const held of views.filter((v) => v.taskStatus !== null && HUMAN_HELD.includes(v.taskStatus))) {
      updateTask(
        held.taskId!,
        { status: "failed", result: "superseded by goal replan — the plan around this step is being rewritten" },
        { triggerRun: false },
      );
    }
    if (goal.paused) return; // resume re-advances into the replan
    const cap = replanLimit();
    if (goal.replanCount + 1 > cap) {
      blockGoal(
        goal.id,
        `replan limit reached (${cap}, configurable in settings). Last failure: ${goal.pendingReplanReason}`,
      );
      return;
    }
    goal = saveGoal(goal.id, { replanCount: goal.replanCount + 1 });
    spawnPlanner(goal, {});
    return;
  }

  // 4. Completion.
  if (planComplete(views)) {
    saveGoal(goal.id, { status: "done", blockedReason: null });
    logger.info({ goalId: goal.id }, "goal done");
    return;
  }

  // 5. Pause holds materialization (in-flight work continues — CEO E2).
  if (goal.paused) return;

  // 6. Materialize ready nodes; hold push nodes behind the consensus gate.
  const gate = consensusRequired(goal, views);
  const ready = readyActionIds(views, actionEdges);
  let materialized = false;
  for (const actionId of ready) {
    const node = plan.nodes.find((n) => n.actionId === actionId)!;
    if (node.kind === "push" && gate && goal.consensusApprovedVersion !== goal.planVersion) {
      if (!goal.consensusRunId) {
        goal = spawnReviewer(goal, plan, node) ?? goal;
        if (goal.status !== "running") return;
      }
      continue; // held for the verdict
    }
    if (materializeNode(goal, plan, node)) materialized = true;
    else return; // materialization failure set a replan reason / blocked
  }
  if (materialized) {
    bus.publish({ type: "goal.plan.updated", goalId: goal.id, planVersion: goal.planVersion });
  }
}

/** Spawn one node's task (assignee re-checked at materialize time). */
function materializeNode(
  goal: Goal,
  plan: LoadedPlan,
  node: typeof planNodes.$inferSelect,
): boolean {
  const db = getDb();
  const agentRow = node.agentId
    ? db.select().from(agents).where(eq(agents.id, node.agentId)).get()
    : null;
  if (!agentRow || !agentRow.enabled) {
    saveGoal(goal.id, {
      pendingReplanReason: `node "${node.label}" (${node.actionId}) has no runnable assignee — the agent was removed or disabled; re-plan with the current roster`,
    });
    // We are inside the advance guard — schedule the barrier evaluation instead
    // of recursing into a no-op.
    scheduleAdvance(goal.id);
    return false;
  }

  // Prerequisite results ride into the task (the DAG's {{input}} equivalent).
  const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const depActions = plan.edges
    .filter((e) => e.toNodeId === node.id)
    .map((e) => plan.nodes.find((n) => n.id === e.fromNodeId))
    .filter((n): n is typeof planNodes.$inferSelect => Boolean(n));
  const depResults = depActions
    .map((dep) => {
      const task = dep.taskId ? plan.taskById.get(dep.taskId) : null;
      return task?.result ? `### ${dep.label}\n${clamp(task.result, 2000)}` : null;
    })
    .filter((s): s is string => s !== null);

  const description = [
    node.description,
    "",
    `(You are executing one step of goal ${goal.id}: "${clamp(goal.prompt, 300)}". Other agents handle the other steps — do ONLY this step's work.)`,
    ...(depResults.length > 0 ? ["", "## Results from completed prerequisite steps", ...depResults] : []),
  ].join("\n");

  const task = createTask({
    title: node.label,
    description,
    projectId: goal.projectId,
    assignedAgentId: agentRow.id,
    createdByType: "agent",
    createdByAgentId: getSystemAgentId(GOAL_PLANNER_SLUG),
    priority: 1,
  });
  db.update(planNodes).set({ taskId: task.id }).where(eq(planNodes.id, node.id)).run();
  logger.info({ goalId: goal.id, actionId: node.actionId, taskId: task.id }, "goal node materialized");
  return true;
}

/** P6-Q3: spawn the consensus Reviewer for a held push node. Returns the updated goal (or null if it blocked). */
function spawnReviewer(
  goal: Goal,
  plan: LoadedPlan,
  pushNode: typeof planNodes.$inferSelect,
): Goal | null {
  const reviewerId = getSystemAgentId(GOAL_REVIEWER_SLUG);
  if (!reviewerId) {
    blockGoal(goal.id, "Goal Reviewer system agent is missing — restart the core to reseed it.");
    return null;
  }
  const completed = plan.nodes
    .filter((n) => n.taskId && plan.taskById.get(n.taskId)?.status === "done")
    .map((n) => ({ label: n.label, result: plan.taskById.get(n.taskId!)?.result ?? null }));
  const prompt = buildReviewerPrompt({
    goal,
    completed,
    pushNode: { label: pushNode.label, description: pushNode.description },
  });
  try {
    const run = runManager.createRun({
      agentId: reviewerId,
      projectId: goal.projectId,
      prompt,
      trigger: "goal",
      triggerRef: goal.id,
    });
    return saveGoal(goal.id, { consensusRunId: run.id });
  } catch (err) {
    blockGoal(goal.id, `could not start the consensus Reviewer run: ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Goal-run completion (Planner + Reviewer) — bus-driven, reconciliation-safe.
// ---------------------------------------------------------------------------

export function handleGoalRunCompleted(run: Run): void {
  if (run.trigger !== "goal" || !run.triggerRef) return;
  const goal = getGoal(run.triggerRef);
  if (!goal) return;
  if (goal.plannerRunId === run.id) handlePlannerCompletion(goal, run);
  else if (goal.consensusRunId === run.id) handleReviewerCompletion(goal, run);
  // anything else is a stale run from a superseded round — ignore.
}

function bounceOrBlock(goal: Goal, diagnostics: string[], previousPlanJson: string | null): void {
  const attempts = goal.plannerAttempts + 1;
  if (attempts > plannerRetryLimit()) {
    blockGoal(
      goal.id,
      `the Planner could not produce a usable plan after ${attempts} attempts. Last diagnostics: ${diagnostics.join("; ")}`,
    );
    return;
  }
  const updated = saveGoal(goal.id, { plannerAttempts: attempts });
  spawnPlanner(updated, { diagnostics, previousPlanJson });
}

function handlePlannerCompletion(goal: Goal, run: Run): void {
  if (goal.status !== "planning") return;
  const cleared = saveGoal(goal.id, { plannerRunId: null });

  if (run.status !== "succeeded" || !run.resultText) {
    bounceOrBlock(cleared, [`the Planner run ended ${run.status}: ${run.error ?? "no output"}`], null);
    return;
  }
  const parsed = parsePlannerPlan(run.resultText);
  if (!parsed.ok) {
    bounceOrBlock(cleared, parsed.diagnostics, run.resultText.slice(0, 8000));
    return;
  }
  const { rosterAgents, teamLabel } = loadRoster(cleared);
  const validation = validatePlan(parsed.plan, {
    roster: rosterAgents.map((a) => ({ id: a.id, name: a.name, slug: a.slug })),
    teamLabel,
    maxNodes: GOAL_MAX_PLAN_NODES,
  });
  if (!validation.ok) {
    bounceOrBlock(cleared, validation.diagnostics, run.resultText.slice(0, 8000));
    return;
  }
  const reason =
    cleared.planVersion === 0
      ? "initial plan"
      : `replanned: ${cleared.pendingReplanReason ?? "owner requested"}`;
  acceptPlan(cleared, parsed.plan.planSummary, validation.actions, reason);
}

function handleReviewerCompletion(goal: Goal, run: Run): void {
  if (goal.status !== "running") return;
  const cleared = saveGoal(goal.id, { consensusRunId: null });

  const retryReviewer = (detail: string): void => {
    const attempts = cleared.plannerAttempts + 1;
    if (attempts > plannerRetryLimit()) {
      blockGoal(cleared.id, `the consensus Reviewer failed after ${attempts} attempts: ${detail}`);
      return;
    }
    saveGoal(cleared.id, { plannerAttempts: attempts });
    advanceGoal(cleared.id); // re-reaches the held push node → respawns the Reviewer
  };

  if (run.status !== "succeeded" || !run.resultText) {
    retryReviewer(`run ended ${run.status}: ${run.error ?? "no output"}`);
    return;
  }
  const parsed = parseConsensusVerdict(run.resultText);
  if (!parsed.ok) {
    retryReviewer(parsed.detail);
    return;
  }
  if (parsed.verdict.approve) {
    saveGoal(cleared.id, {
      consensusApprovedVersion: cleared.planVersion,
      plannerAttempts: 0,
    });
    advanceGoal(cleared.id);
    return;
  }
  // C4: disagreement blocks with BOTH positions.
  blockGoal(
    cleared.id,
    [
      "Consensus gate rejected the push step.",
      "",
      `Reviewer position: ${parsed.verdict.position}`,
      "",
      `Plan position: ${cleared.planSummary ?? "(no plan summary recorded)"}`,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Owner controls (CEO E2: pause goal, cancel, retry node) + manual replan.
// ---------------------------------------------------------------------------

export function pauseGoal(id: string): Goal {
  const goal = getGoal(id);
  if (!goal) throw new HttpError(404, `goal not found: ${id}`);
  if (["done", "cancelled"].includes(goal.status)) {
    throw new HttpError(409, `goal is ${goal.status} — nothing to pause`);
  }
  return saveGoal(id, { paused: true });
}

export function resumeGoal(id: string): Goal {
  const goal = getGoal(id);
  if (!goal) throw new HttpError(404, `goal not found: ${id}`);
  const updated = saveGoal(id, { paused: false });
  advanceGoal(id);
  return getGoal(id) ?? updated;
}

export function cancelGoal(id: string): Goal {
  const goal = getGoal(id);
  if (!goal) throw new HttpError(404, `goal not found: ${id}`);
  if (["done", "cancelled"].includes(goal.status)) {
    throw new HttpError(409, `goal is already ${goal.status}`);
  }
  for (const runId of [goal.plannerRunId, goal.consensusRunId]) {
    if (!runId) continue;
    try {
      runManager.cancel(runId);
    } catch (err) {
      logger.warn({ err, goalId: id, runId }, "goal cancel: engine run cancel failed");
    }
  }
  const { views, taskById } = loadCurrentPlan(goal);
  for (const view of views) {
    if (!view.taskId || view.taskStatus === null) continue;
    if (["done", "failed"].includes(view.taskStatus)) continue;
    const task = taskById.get(view.taskId);
    if (task?.runId) {
      try {
        runManager.cancel(task.runId);
      } catch (err) {
        logger.warn({ err, goalId: id, runId: task.runId }, "goal cancel: node run cancel failed");
      }
    }
    // Settle the task synchronously — run-cancel reconciliation is async and
    // guarded on in_progress, so this direct write wins and the late
    // reconcile becomes a no-op.
    updateTask(view.taskId, { status: "failed", result: "goal cancelled by the operator" }, { triggerRun: false });
  }
  return saveGoal(id, { status: "cancelled", plannerRunId: null, consensusRunId: null });
}

/** Retry ONE failed node in place (no replan) — the graph's node-level control. */
export function retryNode(goalId: string, nodeId: string): Goal {
  const db = getDb();
  const goal = getGoal(goalId);
  if (!goal) throw new HttpError(404, `goal not found: ${goalId}`);
  if (["done", "cancelled"].includes(goal.status)) {
    throw new HttpError(409, `goal is ${goal.status} — nothing to retry`);
  }
  const node = db.select().from(planNodes).where(eq(planNodes.id, nodeId)).get();
  if (!node || node.goalId !== goalId) throw new HttpError(404, `plan node not found: ${nodeId}`);
  if (node.planVersion !== goal.planVersion) {
    throw new HttpError(409, "node belongs to a superseded plan version");
  }
  const task = node.taskId ? getTask(node.taskId) : null;
  if (node.taskId && task && task.status !== "failed") {
    throw new HttpError(409, `node's task is ${task.status} — only failed nodes can be retried`);
  }
  // The owner intervened: if a replan round already started for this failure,
  // cancel that Planner run — the retry supersedes it.
  if (goal.status === "planning" && goal.plannerRunId) {
    try {
      runManager.cancel(goal.plannerRunId);
    } catch (err) {
      logger.warn({ err, goalId, runId: goal.plannerRunId }, "retry: planner cancel failed");
    }
  }
  db.update(planNodes).set({ taskId: null }).where(eq(planNodes.id, nodeId)).run();
  const updated = saveGoal(goalId, {
    status: "running",
    plannerRunId: null,
    pendingReplanReason: null,
    blockedReason: null,
  });
  bus.publish({ type: "goal.plan.updated", goalId, planVersion: goal.planVersion });
  advanceGoal(goalId);
  return getGoal(goalId) ?? updated;
}

/** Delete a terminal goal (0009 cascade removes its whole graph). */
export function deleteGoal(id: string): void {
  const goal = getGoal(id);
  if (!goal) throw new HttpError(404, `goal not found: ${id}`);
  if (!["done", "cancelled", "blocked"].includes(goal.status)) {
    throw new HttpError(409, `goal is ${goal.status} — cancel it before deleting`);
  }
  getDb().delete(goals).where(eq(goals.id, id)).run();
}

/** Owner-triggered replan of the current plan (counts against the replan cap). */
export function replanGoal(id: string, reason?: string | null): Goal {
  const goal = getGoal(id);
  if (!goal) throw new HttpError(404, `goal not found: ${id}`);
  if (goal.status !== "running" && goal.status !== "blocked") {
    throw new HttpError(409, `goal is ${goal.status} — only a running or blocked goal can replan`);
  }
  const updated = saveGoal(id, {
    status: "running",
    blockedReason: null,
    pendingReplanReason: reason?.trim() || "the operator requested a replan",
  });
  advanceGoal(id);
  return getGoal(id) ?? updated;
}

// ---------------------------------------------------------------------------
// Watcher + startup reconciliation (EH2: everything re-derivable from rows).
// ---------------------------------------------------------------------------

const pendingAdvances = new Set<string>();

function scheduleAdvance(goalId: string): void {
  if (pendingAdvances.has(goalId)) return;
  pendingAdvances.add(goalId);
  setTimeout(() => {
    pendingAdvances.delete(goalId);
    try {
      advanceGoal(goalId);
    } catch (err) {
      logger.warn({ err, goalId }, "goal watcher advance failed");
    }
  }, 50);
}

export function initGoalWatcher(opts: { sweepIntervalMs?: number } = {}): () => void {
  const unsubscribe = bus.subscribe((event) => {
    if (event.type === "run.completed") {
      try {
        handleGoalRunCompleted(event.run);
      } catch (err) {
        logger.warn({ err, runId: event.run.id }, "goal run-completion handling failed");
      }
      return;
    }
    if (event.type === "task.updated") {
      const task = event.task as Task;
      if (!["done", "failed"].includes(task.status)) return;
      const node = getDb().select().from(planNodes).where(eq(planNodes.taskId, task.id)).get();
      if (node) scheduleAdvance(node.goalId);
    }
  });
  const interval = setInterval(() => {
    try {
      reconcileGoals();
    } catch (err) {
      logger.warn({ err }, "goal periodic sweep failed");
    }
  }, opts.sweepIntervalMs ?? 5 * 60 * 1000);
  interval.unref?.();
  return () => {
    unsubscribe();
    clearInterval(interval);
  };
}

/**
 * Startup/periodic reconciliation: a planner/reviewer run swept to `failed`
 * before this watcher subscribed still transitions its goal; every running
 * goal re-advances (idempotent); materialized tasks parked `todo` with no run
 * (auto-spawn throttle at materialize time) are re-kicked.
 */
export function reconcileGoals(): number {
  const db = getDb();
  let touched = 0;
  const open = db
    .select()
    .from(goals)
    .where(inArray(goals.status, ["planning", "running"]))
    .all()
    .map(rowToGoal);

  for (const goal of open) {
    try {
      if (goal.status === "planning") {
        if (!goal.plannerRunId) {
          spawnPlanner(goal, {});
          touched++;
          continue;
        }
        const run = runManager.getRun(goal.plannerRunId);
        if (!run) {
          saveGoal(goal.id, { plannerRunId: null });
          spawnPlanner(getGoal(goal.id)!, {});
          touched++;
        } else if (["succeeded", "failed", "cancelled", "timeout"].includes(run.status)) {
          handlePlannerCompletion(goal, run);
          touched++;
        }
        continue;
      }
      // running
      if (goal.consensusRunId) {
        const run = runManager.getRun(goal.consensusRunId);
        if (!run) saveGoal(goal.id, { consensusRunId: null });
        else if (["succeeded", "failed", "cancelled", "timeout"].includes(run.status)) {
          handleReviewerCompletion(goal, run);
          touched++;
          continue;
        }
      }
      const { views, taskById } = loadCurrentPlan(getGoal(goal.id)!);
      for (const view of views) {
        if (view.taskStatus !== "todo" || !view.taskId) continue;
        const task = taskById.get(view.taskId);
        if (task && !task.runId) {
          startTaskRun(task);
          touched++;
        }
      }
      advanceGoal(goal.id);
    } catch (err) {
      logger.warn({ err, goalId: goal.id }, "goal reconciliation failed for goal");
    }
  }
  return touched;
}
