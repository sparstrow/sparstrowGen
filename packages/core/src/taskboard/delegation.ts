import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  DEFAULT_CROSS_TEAM_MESSAGE_LIMIT,
  DEFAULT_DELEGATION_MAX_DEPTH,
  SETTING_CROSS_TEAM_MESSAGE_LIMIT,
  SETTING_DELEGATION_MAX_DEPTH,
  TERMINAL_TASK_STATUSES,
  buildChildrenWakePrompt,
  intersectEffectiveTools,
  type ChildOutcome,
  type EffectiveTools,
  type Task,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agents, messages, runs, settings, taskQuestions, tasks, teamMembers, teams } from "../db/schema.js";
import { bus } from "../events/bus.js";
import { logger } from "../logger.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { createTask, getTask, startTaskRun, updateTask } from "./service.js";
import { wakeTask } from "./questions.js";

const nowIso = () => new Date().toISOString();
const TERMINAL = [...TERMINAL_TASK_STATUSES] as string[];

function readIntSetting(key: string, fallback: number): number {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  const n = Number.parseInt(row.value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const delegationMaxDepth = () =>
  readIntSetting(SETTING_DELEGATION_MAX_DEPTH, DEFAULT_DELEGATION_MAX_DEPTH);
export const crossTeamMessageLimit = () =>
  readIntSetting(SETTING_CROSS_TEAM_MESSAGE_LIMIT, DEFAULT_CROSS_TEAM_MESSAGE_LIMIT);

/** First unarchived team both agents belong to (templates — seam table #6), or null. */
export function sharedTeamId(agentA: string, agentB: string): string | null {
  if (agentA === agentB) return null; // self-delegation is same-team by definition; caller handles
  const db = getDb();
  const rows = db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.agentId, agentA), isNull(teams.archivedAt)))
    .all();
  if (rows.length === 0) return null;
  const shared = db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.agentId, agentB), inArray(teamMembers.teamId, rows.map((r) => r.teamId))))
    .get();
  return shared?.teamId ?? null;
}

/** Delegation depth of a task = length of its parent chain (root = 0). Cycle-guarded. */
export function delegationDepth(taskId: string): number {
  const db = getDb();
  let depth = 0;
  let current: string | null = taskId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = db
      .select({ parentTaskId: tasks.parentTaskId })
      .from(tasks)
      .where(eq(tasks.id, current))
      .get();
    const parentId: string | null = row?.parentTaskId ?? null;
    if (!parentId) break;
    depth++;
    current = parentId;
  }
  return depth;
}

export interface SpawnSubtaskInput {
  callerAgentId: string;
  callerAgentName: string;
  callerRunId: string | null;
  parentTaskId: string;
  title: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  projectId: string | null;
  priority?: number;
}

export interface SpawnSubtaskResult {
  childTaskId: string;
  status: "spawned" | "pending_approval";
  whatToDoNext: string;
}

/**
 * The delegate-and-suspend path (P3 item 2/3). Same-team spawns run immediately;
 * cross-team spawns park in pending_approval for the owner (P3-Q2 per-spawn gate).
 * The child's tool bound = the delegating run's immutable effective snapshot
 * (S1-a LEAST — spawn_subtask has NO tool-granting parameter, so escalation is
 * structurally impossible). The parent transitions to waiting_children server-side
 * (EH1) so its clean run exit reconciles as waiting, not into the review column.
 * Errors are agent-facing and actionable (DX3): problem + cause + what to do.
 */
export function spawnSubtask(input: SpawnSubtaskInput): SpawnSubtaskResult {
  const db = getDb();
  const parent = getTask(input.parentTaskId);
  if (!parent) throw new HttpError(404, `task not found: ${input.parentTaskId}`);
  if (parent.assignedAgentId !== input.callerAgentId) {
    throw new HttpError(
      403,
      "you may only spawn subtasks under the task you are assigned. If you want to hand off unrelated work fire-and-forget, use task_create instead.",
    );
  }
  if (!["in_progress", "waiting_children"].includes(parent.status)) {
    throw new HttpError(
      409,
      `your task is in status "${parent.status}" — subtasks can only be spawned while you are actively working it (in_progress). Finish or unblock the task first.`,
    );
  }

  const cap = delegationMaxDepth();
  const childDepth = delegationDepth(parent.id) + 1;
  if (childDepth > cap) {
    throw new HttpError(
      409,
      `delegation depth limit reached (${cap}, configurable in settings): this work is already ${childDepth - 1} level(s) deep. Do the work yourself, or call task_block if only a human can unblock you.`,
    );
  }

  // S1-a: the child's bound is the delegating run's immutable snapshot. The run
  // row's effective_tools already folds in any bound the PARENT ran under, so
  // clamps compose transitively down the tree.
  let parentBound: EffectiveTools | null = null;
  if (input.callerRunId) {
    const run = db.select().from(runs).where(eq(runs.id, input.callerRunId)).get();
    parentBound = (run?.effectiveTools as EffectiveTools | null) ?? null;
  }

  const teamId = sharedTeamId(input.callerAgentId, input.assigneeId);
  const sameTeam = input.callerAgentId === input.assigneeId || teamId !== null;

  const child = createTask({
    title: input.title,
    description: input.description, // stored RAW — the approval card shows it verbatim (EM3); the child run wraps it (EC3)
    projectId: input.projectId,
    assignedAgentId: input.assigneeId,
    priority: input.priority ?? 1,
    createdByType: "agent",
    createdByAgentId: input.callerAgentId,
    parentTaskId: parent.id,
    parentEffectiveTools: parentBound,
    // Cross-team: park for the owner; do NOT run (P3-Q2 per-spawn approval).
    initialStatus: sameTeam ? undefined : "pending_approval",
  });

  // EH1: suspend the lead server-side. Conditional so a second spawn in the same
  // run (parent already waiting_children) is a no-op, and a blocked/other-state
  // parent is never silently flipped.
  db.update(tasks)
    .set({ status: "waiting_children", updatedAt: nowIso() })
    .where(and(eq(tasks.id, parent.id), eq(tasks.status, "in_progress")))
    .run();
  bus.publish({ type: "task.updated", task: getTask(parent.id)! });

  if (sameTeam) {
    return {
      childTaskId: child.id,
      status: "spawned",
      whatToDoNext:
        "Subtask is running. Spawn more subtasks if needed, then END your run (finish your reply) — you will be woken with all results when every subtask finishes. Do NOT call task_update on your own task now.",
    };
  }
  return {
    childTaskId: child.id,
    status: "pending_approval",
    whatToDoNext: `"${input.assigneeName}" is outside your team, so this spawn needs the owner's approval (it is queued for them). END your run — you will be woken with the outcome once it is approved and finished, or denied.`,
  };
}

/**
 * The completion-watcher (P1 item 4 / P3 item 3): a DERIVED query, never a
 * sleeping process. Wakes a waiting_children parent when no non-terminal children
 * remain — the wake itself is the conditional transition in wakeTask (idempotent,
 * the sole double-wake gate). A parent with no assignee (ephemeral-team container)
 * moves to review with the aggregated results instead of spawning a run.
 */
export function maybeWakeWaitingParent(parentTaskId: string): boolean {
  const db = getDb();
  const parent = getTask(parentTaskId);
  if (!parent || parent.status !== "waiting_children") return false;

  // S4-a guard: the lead's own run is still in flight — defer; the run-completion
  // hook re-evaluates when it exits.
  if (parent.runId) {
    const activeRun = db.select().from(runs).where(eq(runs.id, parent.runId)).get();
    if (activeRun && ["running", "queued"].includes(activeRun.status)) return false;
  }

  const children = db.select().from(tasks).where(eq(tasks.parentTaskId, parentTaskId)).all();
  if (children.length === 0) return false;
  if (children.some((c) => !TERMINAL.includes(c.status))) return false;

  const agentNames = new Map(
    db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .all()
      .map((a) => [a.id, a.name]),
  );
  const outcomes: ChildOutcome[] = children.map((c) => ({
    taskId: c.id,
    title: c.title,
    status: c.status,
    assignedAgentName: c.assignedAgentId ? (agentNames.get(c.assignedAgentId) ?? null) : null,
    result: c.result,
  }));

  if (!parent.assignedAgentId) {
    // Ephemeral-team container: no lead to wake — aggregate and hand to the human.
    const summary = outcomes
      .map((o) => `[${o.status}] ${o.title}${o.assignedAgentName ? ` — ${o.assignedAgentName}` : ""}: ${o.result ?? "(none reported)"}`)
      .join("\n");
    const res = db
      .update(tasks)
      .set({ status: "review", result: summary, updatedAt: nowIso() })
      .where(and(eq(tasks.id, parentTaskId), eq(tasks.status, "waiting_children")))
      .run();
    if (res.changes === 0) return false;
    bus.publish({ type: "task.updated", task: getTask(parentTaskId)! });
    return true;
  }

  const wakePayload = buildChildrenWakePrompt({
    taskTitle: parent.title,
    taskDescription: parent.description,
    children: outcomes,
    progressNote: parent.result,
  });
  db.update(tasks).set({ wakePayload }).where(eq(tasks.id, parentTaskId)).run();
  return wakeTask(parentTaskId);
}

/** Startup/periodic reconciliation sweep (survives restarts — EH1/EC1 discipline). */
export function sweepWaitingParents(): number {
  const waiting = getDb()
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.status, "waiting_children"))
    .all();
  let woken = 0;
  for (const { id } of waiting) {
    try {
      if (maybeWakeWaitingParent(id)) woken++;
    } catch (err) {
      logger.warn({ err, taskId: id }, "waiting-parent sweep failed for task");
    }
  }
  return woken;
}

const pendingParentChecks = new Set<string>();

/**
 * Wire the watcher to the event bus: any child reaching a terminal status
 * re-evaluates its parent (debounced per parent — wake-storms when many children
 * finish together collapse to one check; correctness never depends on the
 * debounce, only the conditional transition). Returns a disposer.
 */
export function initDelegationWatcher(opts: { sweepIntervalMs?: number } = {}): () => void {
  const unsubscribe = bus.subscribe((event) => {
    if (event.type !== "task.updated") return;
    const task = event.task as Task;
    if (!task.parentTaskId || !TERMINAL.includes(task.status)) return;
    const parentId = task.parentTaskId;
    if (pendingParentChecks.has(parentId)) return;
    pendingParentChecks.add(parentId);
    setTimeout(() => {
      pendingParentChecks.delete(parentId);
      try {
        maybeWakeWaitingParent(parentId);
      } catch (err) {
        logger.warn({ err, taskId: parentId }, "delegation watcher wake failed");
      }
    }, 50);
  });
  const interval = setInterval(() => {
    try {
      sweepWaitingParents();
    } catch (err) {
      logger.warn({ err }, "waiting-parent periodic sweep failed");
    }
  }, opts.sweepIntervalMs ?? 5 * 60 * 1000);
  interval.unref?.();
  return () => {
    unsubscribe();
    clearInterval(interval);
  };
}

export interface MultiAssignInput {
  title: string;
  description: string;
  projectId?: string | null;
  agentIds: string[];
  priority?: number;
}

/**
 * Multi-assign task creation (P3 item 5): N assignees auto-create an ephemeral
 * team around the work — a parent container task in waiting_children plus one
 * child per agent (all spawn immediately: the OWNER created this, so there is no
 * cross-team gate). When every child is terminal the watcher aggregates results
 * onto the container (→ review) and the team is soft-archived (C6/P3-Q3).
 */
export function createMultiAssignTask(input: MultiAssignInput): { parent: Task; teamId: string } {
  const db = getDb();
  const agentIds = [...new Set(input.agentIds)];
  if (agentIds.length < 2) {
    throw new HttpError(400, "multi-assign needs at least two distinct agents (use assignedAgentId for one)");
  }
  const rows = db.select().from(agents).where(inArray(agents.id, agentIds)).all();
  if (rows.length !== agentIds.length) {
    const found = new Set(rows.map((r) => r.id));
    throw new HttpError(404, `agent not found: ${agentIds.filter((a) => !found.has(a)).join(", ")}`);
  }

  const parent = createTask({
    title: input.title,
    description: input.description,
    projectId: input.projectId ?? null,
    priority: input.priority ?? 1,
    createdByType: "user",
    initialStatus: "waiting_children",
  });

  const ts = nowIso();
  const teamId = `team_${nanoid(10)}`;
  db.insert(teams)
    .values({
      id: teamId,
      name: `Swarm: ${input.title.slice(0, 60)} (${parent.id})`,
      slug: `swarm-${parent.id.replace(/^tsk_/, "").toLowerCase()}`,
      description: `Ephemeral team auto-created for task ${parent.id}.`,
      isEphemeral: true,
      linkedTaskId: parent.id,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  db.insert(teamMembers)
    .values(agentIds.map((agentId, i) => ({ id: `tm_${nanoid(10)}`, teamId, agentId, sort: i })))
    .run();

  for (const row of rows) {
    createTask({
      title: `${input.title} — ${row.name}`,
      description: input.description,
      projectId: input.projectId ?? null,
      assignedAgentId: row.id,
      priority: input.priority ?? 1,
      createdByType: "user",
      parentTaskId: parent.id,
    });
  }
  return { parent: getTask(parent.id)!, teamId };
}

/** Approve a cross-team spawn: pending_approval → todo → run (owner action). */
export function approveSubtask(taskId: string): Task {
  const task = getTask(taskId);
  if (!task) throw new HttpError(404, `task not found: ${taskId}`);
  if (task.status !== "pending_approval") {
    throw new HttpError(409, `task is not awaiting approval (status: ${task.status})`);
  }
  const updated = updateTask(taskId, { status: "todo" }, { triggerRun: false });
  return startTaskRun(updated) ?? updated;
}

/** Deny a cross-team spawn: the child fails with the denial; the watcher wakes the lead with it. */
export function denySubtask(taskId: string, reason?: string | null): Task {
  const task = getTask(taskId);
  if (!task) throw new HttpError(404, `task not found: ${taskId}`);
  if (task.status !== "pending_approval") {
    throw new HttpError(409, `task is not awaiting approval (status: ${task.status})`);
  }
  const updated = updateTask(
    taskId,
    {
      status: "failed",
      result: `Denied by the operator${reason ? `: ${reason}` : ""}. Do not retry this cross-team delegation without new instructions.`,
    },
    { triggerRun: false },
  );
  if (updated.parentTaskId) {
    try {
      maybeWakeWaitingParent(updated.parentTaskId);
    } catch (err) {
      logger.warn({ err, taskId }, "deny: parent wake failed (sweep will retry)");
    }
  }
  return updated;
}

/**
 * C10 cross-team messaging circuit breaker. Counts the (task, agent-pair) thread
 * in both directions; at the limit the send is refused, the task is blocked with a
 * system question for the owner, and the thread stays halted until a human answers
 * (any answered question on the task resets the counter — an owner intervention
 * restarts threads fresh; recorded in P3-SEAM-TABLE.md).
 * Returns silently when the message is allowed.
 */
export function checkCrossTeamBreaker(input: {
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  taskId: string | null;
  runId?: string | null;
}): void {
  const { fromAgentId, toAgentId, taskId } = input;
  if (!taskId) return; // only task-linked threads are counted
  if (fromAgentId === toAgentId) return;
  if (sharedTeamId(fromAgentId, toAgentId) !== null) return; // same team: autonomous

  const db = getDb();
  // Owner intervention resets the thread: count only messages newer than the
  // latest answered question on this task.
  const lastAnswered = db
    .select({ answeredAt: taskQuestions.answeredAt })
    .from(taskQuestions)
    .where(and(eq(taskQuestions.taskId, taskId), isNotNull(taskQuestions.answeredAt)))
    .all()
    .map((r) => r.answeredAt!)
    .sort()
    .pop();

  const pair = or(
    and(eq(messages.fromAgentId, fromAgentId), eq(messages.toAgentId, toAgentId)),
    and(eq(messages.fromAgentId, toAgentId), eq(messages.toAgentId, fromAgentId)),
  );
  const thread = db
    .select({ id: messages.id, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.taskId, taskId), pair))
    .all()
    .filter((m) => (lastAnswered ? m.createdAt > lastAnswered : true));

  const limit = crossTeamMessageLimit();
  if (thread.length < limit) return;

  // Halt: block the task with a system question so it lands in the attention queue.
  const task = getTask(taskId);
  if (task && !TERMINAL.includes(task.status) && task.status !== "blocked") {
    getDb()
      .insert(taskQuestions)
      .values({
        id: `tq_${nanoid(10)}`,
        taskId,
        question: `Cross-team thread between "${input.fromAgentName}" and "${input.toAgentName}" hit the ${limit}-message circuit breaker on this task. Should they continue?`,
        whyBlocked: "Cross-team chatter is human-gated after the limit (C10) to stop runaway loops.",
        options: ["Yes — let the thread continue", "No — I'll intervene myself"],
        recommendation: null,
        defaultIfNoAnswer: null,
        answer: null,
        askedByRunId: input.runId ?? null,
        askedAt: nowIso(),
        answeredAt: null,
        appliedAt: null,
        userId: null,
      })
      .run();
    updateTask(taskId, { status: "blocked" }, { triggerRun: false });
  }
  throw new HttpError(
    429,
    `message not sent: the cross-team thread with "${input.toAgentName}" hit the ${limit}-message circuit breaker for this task. The task is now blocked for the operator — stop messaging and end your run; you will be woken if they allow the thread to continue.`,
  );
}
