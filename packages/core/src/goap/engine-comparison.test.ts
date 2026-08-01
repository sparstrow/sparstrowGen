import { describe, expect, it } from "vitest";
import { plannerPlanSchema } from "@sparstrow/shared";
import { isPushLike, readyActionIds, validatePlan, type NodeExecView } from "./dag.js";

/**
 * P6-Q0 head-to-head harness — the executable half of
 * docs/archive/fable-handoff/P6-ENGINE-DECISION.md. Encodes BOTH candidate
 * engines: the shipped DAG core (imported) and a real A* GOAP solver (below,
 * test-only per the decision — no dead production code), and runs the decision
 * doc's three goals through each. Every `[harness]` claim in the doc is
 * asserted here; if a claim rots, this file fails.
 */

// ---------------------------------------------------------------------------
// The A*/GOAP candidate: boolean world-state flags, actions {pre, effects,
// cost}, forward A* search (h = unmet goal facts — admissible since every
// action adds at least one fact). This is ruflo's model, faithfully.
// ---------------------------------------------------------------------------

interface GoapAction {
  id: string;
  pre: string[];
  effects: string[];
  cost: number;
}
interface GoapDomain {
  initial: string[];
  goal: string[];
  actions: GoapAction[];
}

function astarPlan(domain: GoapDomain): string[] | null {
  const goalMet = (state: Set<string>) => domain.goal.every((f) => state.has(f));
  const h = (state: Set<string>) => domain.goal.filter((f) => !state.has(f)).length;
  const key = (state: Set<string>) => [...state].sort().join("|");

  interface Node {
    state: Set<string>;
    path: string[];
    g: number;
  }
  const open: Node[] = [{ state: new Set(domain.initial), path: [], g: 0 }];
  const bestG = new Map<string, number>([[key(open[0]!.state), 0]]);

  while (open.length > 0) {
    open.sort((x, y) => x.g + h(x.state) - (y.g + h(y.state)));
    const current = open.shift()!;
    if (goalMet(current.state)) return current.path;

    for (const action of domain.actions) {
      if (!action.pre.every((f) => current.state.has(f))) continue;
      const next = new Set(current.state);
      let addsSomething = false;
      for (const f of action.effects) {
        if (!next.has(f)) addsSomething = true;
        next.add(f);
      }
      if (!addsSomething) continue; // no progress
      const g = current.g + action.cost;
      const k = key(next);
      if ((bestG.get(k) ?? Number.POSITIVE_INFINITY) <= g) continue;
      bestG.set(k, g);
      open.push({ state: next, path: [...current.path, action.id], g });
    }
  }
  return null; // unsolvable from this state
}

// ---------------------------------------------------------------------------
// The three real goals, LLM-shaped (what a Planner prompt realistically emits:
// each action's preconditions are its predecessors' effects — "steps"
// translated into GOAP form).
// ---------------------------------------------------------------------------

/** G1 — "Build the memory settings page": two parallel tracks joining at tests. */
const G1_GOAP: GoapDomain = {
  initial: [],
  goal: ["pushed"],
  actions: [
    { id: "contract", pre: [], effects: ["contract_written"], cost: 1 },
    { id: "api", pre: ["contract_written"], effects: ["api_built"], cost: 2 },
    { id: "ui", pre: ["contract_written"], effects: ["ui_built"], cost: 2 },
    { id: "test", pre: ["api_built", "ui_built"], effects: ["tested"], cost: 1 },
    { id: "push", pre: ["tested"], effects: ["pushed"], cost: 1 },
  ],
};

const g1DagPlan = plannerPlanSchema.parse({
  actions: [
    { id: "contract", label: "Write the API contract", description: "Contract note.", agentHint: "backend-coder" },
    { id: "api", label: "Build the settings API", description: "API.", agentHint: "backend-coder", dependsOn: ["contract"] },
    { id: "ui", label: "Build the settings UI", description: "UI.", agentHint: "ui-coder", dependsOn: ["contract"] },
    { id: "test", label: "Integration tests", description: "Tests.", agentHint: "backend-coder", dependsOn: ["api", "ui"] },
    { id: "push", label: "Push the branch and open a PR", description: "PR.", agentHint: "backend-coder", dependsOn: ["test"], kind: "push" },
  ],
});

/** G2 — "Fix the failing auth test": reality invalidates the plan mid-flight. */
const G2_GOAP: GoapDomain = {
  initial: ["repro_confirmed"],
  goal: ["suite_green"],
  actions: [
    { id: "diagnose", pre: ["repro_confirmed"], effects: ["cause_known"], cost: 1 },
    { id: "fix_test", pre: ["cause_known"], effects: ["fix_applied"], cost: 2 },
    { id: "verify", pre: ["fix_applied"], effects: ["suite_green"], cost: 1 },
  ],
};

/** G3 — swarm + consensus gate; the terminal action is a push. */
const G3_GOAP: GoapDomain = {
  initial: [],
  goal: ["pr_opened"],
  actions: [
    { id: "refactor", pre: [], effects: ["executor_rowsafe"], cost: 3 },
    { id: "tests", pre: ["executor_rowsafe"], effects: ["tests_added"], cost: 2 },
    { id: "review", pre: ["tests_added"], effects: ["review_passed"], cost: 1 },
    { id: "open_pr", pre: ["review_passed"], effects: ["pr_opened"], cost: 1 },
  ],
};

const ROSTER = [
  { id: "agt_ui", name: "UI Coder", slug: "ui-coder" },
  { id: "agt_be", name: "Backend Coder", slug: "backend-coder" },
];

describe("P6-Q0 — G1 parallelism", () => {
  it("[harness] DAG: after the shared dep completes, BOTH parallel tracks are ready at once", () => {
    const nodes: NodeExecView[] = [
      { actionId: "contract", taskId: "t1", taskStatus: "done", kind: "work" },
      { actionId: "api", taskId: null, taskStatus: null, kind: "work" },
      { actionId: "ui", taskId: null, taskStatus: null, kind: "work" },
      { actionId: "test", taskId: null, taskStatus: null, kind: "work" },
      { actionId: "push", taskId: null, taskStatus: null, kind: "push" },
    ];
    const edges = [
      { from: "contract", to: "api" },
      { from: "contract", to: "ui" },
      { from: "api", to: "test" },
      { from: "ui", to: "test" },
      { from: "test", to: "push" },
    ];
    expect(readyActionIds(nodes, edges).sort()).toEqual(["api", "ui"]);
  });

  it("[harness] GOAP: A* returns a strict sequence over the same domain — no concurrency information", () => {
    const path = astarPlan(G1_GOAP);
    expect(path).not.toBeNull();
    // A totally ordered path: api and ui hold distinct sequential slots even
    // though nothing orders them — the plan itself cannot express "run both".
    expect(path).toHaveLength(5);
    const apiIdx = path!.indexOf("api");
    const uiIdx = path!.indexOf("ui");
    expect(apiIdx).toBeGreaterThanOrEqual(0);
    expect(uiIdx).toBeGreaterThanOrEqual(0);
    expect(apiIdx).not.toBe(uiIdx);
  });
});

describe("P6-Q0 — G2 replanning", () => {
  it("[harness] GOAP: recovery needs a NEW action the domain lacks — A* over the failed state returns no plan", () => {
    // Mid-flight discovery: the fix is in the session-store dependency, not the
    // test. fix_test failed; the world is what it was, and no other action
    // produces fix_applied. The solver cannot invent one.
    const failedState: GoapDomain = {
      ...G2_GOAP,
      initial: ["repro_confirmed", "cause_known", "fix_test_failed_dep_bug"],
      actions: G2_GOAP.actions.filter((a) => a.id !== "fix_test"),
    };
    expect(astarPlan(failedState)).toBeNull();

    // The recovery in BOTH engines is the same: the LLM authors the new action
    // ("patch the session-store dependency"). With it, the domain solves again.
    const repaired: GoapDomain = {
      ...failedState,
      actions: [
        ...failedState.actions,
        { id: "patch_dep", pre: ["cause_known"], effects: ["fix_applied"], cost: 2 },
      ],
    };
    expect(astarPlan(repaired)).toEqual(["patch_dep", "verify"]);
  });

  it("[harness] LLM-shaped domains are linear chains: every non-initial precondition has exactly ONE producer, so the A* search space is one path", () => {
    for (const domain of [G1_GOAP, G2_GOAP, G3_GOAP]) {
      for (const action of domain.actions) {
        for (const fact of action.pre) {
          if (domain.initial.includes(fact)) continue;
          const producers = domain.actions.filter((a) => a.effects.includes(fact));
          expect(producers, `${action.id} pre "${fact}"`).toHaveLength(1);
        }
      }
      // ...and the solver dutifully returns that single chain.
      expect(astarPlan(domain)).toHaveLength(domain.actions.length);
    }
  });
});

describe("P6-Q0 — G3 consensus-gate detection", () => {
  it("[harness] DAG: push node is a field check with a deterministic label fallback", () => {
    const unlabelled = plannerPlanSchema.parse({
      actions: [
        { id: "refactor", label: "Refactor the executor", description: "Row-safe.", agentHint: "backend-coder" },
        { id: "open_pr", label: "Open the PR against main", description: "Ship it.", agentHint: "backend-coder", dependsOn: ["refactor"] },
      ],
    });
    const v = validatePlan(unlabelled, { roster: ROSTER, maxNodes: 30 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.actions.find((a) => a.id === "open_pr")!.kind).toBe("push");
  });

  it("[harness] GOAP: detection means divining LLM-invented effect-flag vocabulary — the same heuristic misses it", () => {
    // The G3 terminal effect is "pr_opened". The label heuristic that catches
    // "Open the PR against main" does not match the flag (no word boundary
    // inside pr_opened) — effect-name inspection is brittle where a node-kind
    // field is exact.
    const terminal = G3_GOAP.actions.find((a) => a.id === "open_pr")!;
    expect(isPushLike({ label: terminal.effects[0]!, description: "" })).toBe(false);
  });
});

describe("P6-Q0 — G1 solved by both engines (sanity: the comparison is like-for-like)", () => {
  it("both engines accept their G1 artifact", () => {
    expect(astarPlan(G1_GOAP)).not.toBeNull();
    const v = validatePlan(g1DagPlan, { roster: ROSTER, maxNodes: 30 });
    expect(v.ok).toBe(true);
  });
});
