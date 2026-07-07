import type {
  Goal,
  PlanNodeStatus,
  PlannerAction,
  PlannerPlan,
  TaskStatus,
} from "@sparstrow/shared";

/**
 * P6 DAG core — the engine the P6-Q0 head-to-head decided on (see
 * fable-handoff/P6-ENGINE-DECISION.md). Everything here is a PURE function
 * over plan data: validation (the deterministic replacement for the A*
 * solver), ready-set computation, derived node status (EM4), replan diffing,
 * and layout. No DB, no bus — the executor owns side effects.
 */

export interface RosterAgent {
  id: string;
  name: string;
  slug: string;
}

export interface ValidatedAction extends PlannerAction {
  /** Resolved assignee id (validation guarantees every action has one). */
  agentId: string;
  /** React Flow position, layered by dependency depth. */
  position: { x: number; y: number };
}

export type PlanValidation =
  | { ok: true; actions: ValidatedAction[]; order: string[] }
  | { ok: false; diagnostics: string[] };

/**
 * Deterministic push-node fallback (P6-Q3 "reliable push-node detection
 * required"): the Planner is asked to label push actions `kind: "push"`, but an
 * unlabelled push/PR/deploy action must not slip past the consensus gate.
 */
const PUSH_LABEL_RE =
  /\b(push(es|ing)?\b|pull[- ]request|open (a |the )?pr\b|\bpr\b|merge (to|into)|deploy|publish|release)\b/i;

export function isPushLike(action: Pick<PlannerAction, "label" | "description">): boolean {
  return PUSH_LABEL_RE.test(action.label) || PUSH_LABEL_RE.test(action.description);
}

/**
 * Validate one Planner plan against the roster and structural rules. Failures
 * return agent-facing diagnostics written FOR the Planner's bounce-back prompt
 * (each names the exact action/edge and says how to fix it — the DAG
 * equivalent of "the solver's diagnostic").
 */
export function validatePlan(
  plan: PlannerPlan,
  ctx: {
    /** Enabled agents the plan may assign (ALREADY team-filtered when the goal has a team). */
    roster: RosterAgent[];
    /** Names the bound in diagnostics ("team Frontend") when the goal is team-scoped. */
    teamLabel?: string | null;
    maxNodes: number;
  },
): PlanValidation {
  const diagnostics: string[] = [];
  const actions = plan.actions;

  if (actions.length > ctx.maxNodes) {
    diagnostics.push(
      `plan has ${actions.length} actions — the limit is ${ctx.maxNodes}. Merge related steps into fewer, larger actions.`,
    );
  }

  const byId = new Map<string, PlannerAction>();
  for (const a of actions) {
    if (byId.has(a.id)) diagnostics.push(`duplicate action id "${a.id}" — every action id must be unique.`);
    byId.set(a.id, a);
  }

  for (const a of actions) {
    for (const dep of a.dependsOn) {
      if (dep === a.id) diagnostics.push(`action "${a.id}" depends on itself — remove it from its own dependsOn.`);
      else if (!byId.has(dep)) {
        diagnostics.push(`action "${a.id}" depends on "${dep}", which is not in the plan — fix the id or add the missing action.`);
      }
    }
  }

  // Roster resolution: every action needs a resolvable, enabled assignee — an
  // unassignable node would materialize a task that never runs and stall the
  // goal, so it bounces back instead (CEO S1-b: never plan unexecutable work).
  const rosterIndex = new Map<string, RosterAgent>();
  for (const r of ctx.roster) {
    rosterIndex.set(r.id.toLowerCase(), r);
    rosterIndex.set(r.slug.toLowerCase(), r);
    rosterIndex.set(r.name.toLowerCase(), r);
  }
  const rosterLabel = ctx.roster.map((r) => r.slug).join(", ") || "(none)";
  const resolveHint = (a: PlannerAction): RosterAgent | null => {
    if (!a.agentHint) {
      diagnostics.push(
        `action "${a.id}" has no agentHint — every action must name one of: ${rosterLabel}.`,
      );
      return null;
    }
    const found = rosterIndex.get(a.agentHint.trim().toLowerCase());
    if (!found) {
      diagnostics.push(
        `action "${a.id}" names agent "${a.agentHint}" which is not ${ctx.teamLabel ? `a member of ${ctx.teamLabel}` : "an enabled agent"} — use one of: ${rosterLabel}.`,
      );
    }
    return found ?? null;
  };
  const resolved = new Map<string, RosterAgent>();
  for (const a of actions) {
    const agent = resolveHint(a);
    if (agent) resolved.set(a.id, agent);
  }

  // Cycle detection (Kahn). Only meaningful once refs resolve.
  const order: string[] = [];
  if (diagnostics.length === 0) {
    const indegree = new Map<string, number>(actions.map((a) => [a.id, 0]));
    const dependents = new Map<string, string[]>();
    for (const a of actions) {
      for (const dep of a.dependsOn) {
        indegree.set(a.id, (indegree.get(a.id) ?? 0) + 1);
        dependents.set(dep, [...(dependents.get(dep) ?? []), a.id]);
      }
    }
    const queue = actions.filter((a) => (indegree.get(a.id) ?? 0) === 0).map((a) => a.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const next of dependents.get(id) ?? []) {
        const d = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, d);
        if (d === 0) queue.push(next);
      }
    }
    if (order.length !== actions.length) {
      const stuck = actions.filter((a) => !order.includes(a.id)).map((a) => a.id);
      diagnostics.push(
        `dependency cycle involving: ${stuck.join(", ")} — plans must be acyclic; break the cycle by removing or redirecting one dependsOn.`,
      );
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const positions = computeLayout(actions);
  const validated: ValidatedAction[] = actions.map((a) => ({
    ...a,
    kind: a.kind === "push" || isPushLike(a) ? "push" : "work",
    agentId: resolved.get(a.id)!.id,
    position: positions.get(a.id)!,
  }));
  return { ok: true, actions: validated, order };
}

/**
 * Layered layout for React Flow: depth = longest dependency path from a root
 * (so a node sits right of everything it waits on), siblings stack vertically.
 */
export function computeLayout(
  actions: Array<Pick<PlannerAction, "id" | "dependsOn">>,
): Map<string, { x: number; y: number }> {
  const depth = new Map<string, number>();
  const byId = new Map(actions.map((a) => [a.id, a]));
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard — validation reports it separately
    visiting.add(id);
    const a = byId.get(id);
    const d =
      !a || a.dependsOn.length === 0
        ? 0
        : 1 + Math.max(...a.dependsOn.filter((x) => byId.has(x)).map(depthOf), -1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const a of actions) depthOf(a.id);

  const layerCounts = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const a of actions) {
    const d = depth.get(a.id) ?? 0;
    const row = layerCounts.get(d) ?? 0;
    layerCounts.set(d, row + 1);
    positions.set(a.id, { x: d * 280, y: row * 140 });
  }
  return positions;
}

/** The executor's per-node view of one CURRENT-version row. */
export interface NodeExecView {
  actionId: string;
  /** Materialized task id (null = not yet spawned). */
  taskId: string | null;
  /** Status of that task (null when taskId is null or the task row vanished). */
  taskStatus: TaskStatus | null;
  kind: string;
}

/**
 * Ready set (the DAG replacement for "all preconditions satisfied by world
 * state"): unmaterialized nodes whose dependencies ALL have task status
 * `done`. `review` does NOT count as done (EM4: the agent never reported —
 * effects are not applied, dependents stay pending).
 */
export function readyActionIds(
  nodes: NodeExecView[],
  edges: Array<{ from: string; to: string }>,
): string[] {
  const doneByAction = new Map(nodes.map((n) => [n.actionId, n.taskStatus === "done"]));
  const depsByAction = new Map<string, string[]>();
  for (const e of edges) {
    depsByAction.set(e.to, [...(depsByAction.get(e.to) ?? []), e.from]);
  }
  return nodes
    .filter((n) => n.taskId === null)
    .filter((n) => (depsByAction.get(n.actionId) ?? []).every((dep) => doneByAction.get(dep) === true))
    .map((n) => n.actionId);
}

/** True when every current-version node's task is done — the goal is done. */
export function planComplete(nodes: NodeExecView[]): boolean {
  return nodes.length > 0 && nodes.every((n) => n.taskStatus === "done");
}

/**
 * Derived node status (EM4 — never stored). Maps the linked task's state onto
 * the locked semantic-status vocabulary (design rule 15) with a human-readable
 * detail wherever the color alone doesn't explain itself.
 */
export function deriveNodeStatus(input: {
  node: NodeExecView;
  depsDone: boolean;
  goal: Pick<Goal, "paused">;
  /** This push node is being held (or reviewed) by the P6-Q3 consensus gate. */
  consensusHold: boolean;
}): { status: PlanNodeStatus; statusDetail: string | null } {
  const { node, depsDone, goal, consensusHold } = input;
  if (node.taskId === null) {
    if (!depsDone) return { status: "pending", statusDetail: null };
    if (consensusHold) {
      return { status: "approval", statusDetail: "consensus gate: awaiting Reviewer verdict" };
    }
    if (goal.paused) return { status: "ready", statusDetail: "goal paused — will start on resume" };
    return { status: "ready", statusDetail: null };
  }
  if (node.taskStatus === null) {
    return { status: "failed", statusDetail: "materialized task no longer exists" };
  }
  switch (node.taskStatus) {
    case "done":
      return { status: "done", statusDetail: null };
    case "failed":
      return { status: "failed", statusDetail: null };
    case "review":
      return {
        status: "attention",
        statusDetail: "agent never reported — review the result (effects not applied)",
      };
    case "blocked":
      return { status: "attention", statusDetail: "blocked on a human answer" };
    case "pending_approval":
      return { status: "approval", statusDetail: "awaiting cross-team spawn approval" };
    case "inbox":
    case "todo":
      return { status: "running", statusDetail: "task queued" };
    default:
      // in_progress, waiting_children, blocked_answered — work is in flight.
      return { status: "running", statusDetail: null };
  }
}

/**
 * Replan diff (EM4 barrier rule): actions are matched across versions by their
 * stable id. `carried` actions keep their completed task (completion
 * carry-forward — the new version's row points at the same done task);
 * `removed` actions with no completed task render as `skipped` in the old
 * version's history.
 */
export function diffPlans(
  oldNodes: Array<{ actionId: string; taskId: string | null; taskStatus: TaskStatus | null }>,
  newActions: Array<Pick<PlannerAction, "id">>,
): {
  /** actionId → the old DONE task id the new version inherits. */
  carriedTaskByAction: Map<string, string>;
  added: string[];
  removed: string[];
} {
  const oldByAction = new Map(oldNodes.map((n) => [n.actionId, n]));
  const newIds = new Set(newActions.map((a) => a.id));
  const carriedTaskByAction = new Map<string, string>();
  for (const n of oldNodes) {
    if (newIds.has(n.actionId) && n.taskId && n.taskStatus === "done") {
      carriedTaskByAction.set(n.actionId, n.taskId);
    }
  }
  return {
    carriedTaskByAction,
    added: [...newIds].filter((id) => !oldByAction.has(id)),
    removed: oldNodes.map((n) => n.actionId).filter((id) => !newIds.has(id)),
  };
}
