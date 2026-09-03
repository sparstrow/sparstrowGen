import { describe, expect, it } from "vitest";
import { plannerPlanSchema, type PlannerPlan } from "@sparstrow/shared";
import {
  computeLayout,
  deriveNodeStatus,
  diffPlans,
  isPushLike,
  planComplete,
  readyActionIds,
  validatePlan,
  type NodeExecView,
} from "./dag.js";

const ROSTER = [
  { id: "agt_ui", name: "UI Coder", slug: "ui-coder" },
  { id: "agt_be", name: "Backend Coder", slug: "backend-coder" },
  { id: "agt_rev", name: "Security Reviewer", slug: "security-reviewer" },
];

const plan = (actions: Array<Record<string, unknown>>): PlannerPlan =>
  plannerPlanSchema.parse({ actions });

const a = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  label: `Do ${id}`,
  description: `Work on ${id}.`,
  agentHint: "backend-coder",
  ...over,
});

const CTX = { roster: ROSTER, maxNodes: 30 };

describe("validatePlan", () => {
  it("accepts a valid plan, resolves hints (id/slug/name, case-insensitive), topo-orders", () => {
    const v = validatePlan(
      plan([
        a("schema"),
        a("api", { dependsOn: ["schema"], agentHint: "Backend Coder" }),
        a("ui", { dependsOn: ["schema"], agentHint: "AGT_UI" }),
        a("test", { dependsOn: ["api", "ui"], agentHint: "security-reviewer" }),
      ]),
      CTX,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.order[0]).toBe("schema");
    expect(v.order[3]).toBe("test");
    const byId = new Map(v.actions.map((x) => [x.id, x]));
    expect(byId.get("api")!.agentId).toBe("agt_be");
    expect(byId.get("ui")!.agentId).toBe("agt_ui");
    expect(byId.get("schema")!.position).toEqual({ x: 0, y: 0 });
    expect(byId.get("test")!.position.x).toBeGreaterThan(byId.get("api")!.position.x);
  });

  it("bounces duplicate ids, dangling deps and self-deps with diagnostics naming the action", () => {
    const v = validatePlan(
      plan([a("x"), a("x", { label: "again" }), a("y", { dependsOn: ["ghost", "y"] })]),
      CTX,
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostics.join("\n")).toMatch(/duplicate action id "x"/);
    expect(v.diagnostics.join("\n")).toMatch(/"y" depends on "ghost"/);
    expect(v.diagnostics.join("\n")).toMatch(/"y" depends on itself/);
  });

  it("bounces cycles naming the members", () => {
    const v = validatePlan(
      plan([a("one", { dependsOn: ["two"] }), a("two", { dependsOn: ["one"] })]),
      CTX,
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostics[0]).toMatch(/cycle involving: one, two/);
  });

  it("bounces a missing or unknown agentHint, listing the roster (team-labelled when bounded)", () => {
    const v = validatePlan(plan([a("x", { agentHint: null }), a("y", { agentHint: "nobody" })]), {
      ...CTX,
      teamLabel: "team Frontend",
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostics.join("\n")).toMatch(/"x" has no agentHint/);
    expect(v.diagnostics.join("\n")).toMatch(/not a member of team Frontend/);
    expect(v.diagnostics.join("\n")).toMatch(/ui-coder, backend-coder, security-reviewer/);
  });

  it("enforces the settings node cap", () => {
    const v = validatePlan(plan([a("x"), a("y")]), { ...CTX, maxNodes: 1 });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.diagnostics[0]).toMatch(/limit is 1/);
  });

  it("normalizes an unlabelled push-like node to kind=push (P6-Q3 fallback)", () => {
    const v = validatePlan(
      plan([a("work1"), a("ship", { label: "Open a PR to main", dependsOn: ["work1"] })]),
      CTX,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.actions.find((x) => x.id === "ship")!.kind).toBe("push");
    expect(v.actions.find((x) => x.id === "work1")!.kind).toBe("work");
  });
});

describe("isPushLike", () => {
  it("matches push/PR/deploy phrasing but not ordinary work", () => {
    expect(isPushLike({ label: "Push the branch", description: "" })).toBe(true);
    expect(isPushLike({ label: "Deploy to staging", description: "" })).toBe(true);
    expect(isPushLike({ label: "Write tests", description: "add coverage for the executor" })).toBe(false);
    expect(isPushLike({ label: "Fix the pushback handler", description: "refactor" })).toBe(false);
  });
});

describe("readyActionIds / planComplete", () => {
  const node = (actionId: string, over: Partial<NodeExecView> = {}): NodeExecView => ({
    actionId,
    taskId: null,
    taskStatus: null,
    kind: "work",
    ...over,
  });
  const EDGES = [
    { from: "schema", to: "api" },
    { from: "schema", to: "ui" },
    { from: "api", to: "test" },
    { from: "ui", to: "test" },
  ];

  it("exposes parallel tracks simultaneously once the shared dep is done", () => {
    const ready = readyActionIds(
      [
        node("schema", { taskId: "tsk_1", taskStatus: "done" }),
        node("api"),
        node("ui"),
        node("test"),
      ],
      EDGES,
    );
    expect(ready.sort()).toEqual(["api", "ui"]);
  });

  it("review does NOT count as done (EM4 — effects not applied)", () => {
    const ready = readyActionIds(
      [node("schema", { taskId: "tsk_1", taskStatus: "review" }), node("api"), node("ui"), node("test")],
      EDGES,
    );
    expect(ready).toEqual([]);
  });

  it("never re-materializes an already-materialized node", () => {
    const ready = readyActionIds(
      [
        node("schema", { taskId: "tsk_1", taskStatus: "done" }),
        node("api", { taskId: "tsk_2", taskStatus: "failed" }),
        node("ui"),
        node("test"),
      ],
      EDGES,
    );
    expect(ready).toEqual(["ui"]);
  });

  it("planComplete requires every node done (and a non-empty plan)", () => {
    expect(planComplete([])).toBe(false);
    expect(planComplete([node("x", { taskId: "t", taskStatus: "done" })])).toBe(true);
    expect(
      planComplete([
        node("x", { taskId: "t", taskStatus: "done" }),
        node("y", { taskId: "t2", taskStatus: "review" }),
      ]),
    ).toBe(false);
  });
});

describe("deriveNodeStatus", () => {
  const base = {
    node: { actionId: "x", taskId: null, taskStatus: null, kind: "work" } as NodeExecView,
    depsDone: true,
    goal: { paused: false },
    consensusHold: false,
  };

  it("maps the unmaterialized states: pending / ready / paused-ready / consensus-approval", () => {
    expect(deriveNodeStatus({ ...base, depsDone: false }).status).toBe("pending");
    expect(deriveNodeStatus(base).status).toBe("ready");
    const paused = deriveNodeStatus({ ...base, goal: { paused: true } });
    expect(paused.status).toBe("ready");
    expect(paused.statusDetail).toMatch(/paused/);
    const held = deriveNodeStatus({ ...base, consensusHold: true });
    expect(held.status).toBe("approval");
    expect(held.statusDetail).toMatch(/consensus/);
  });

  it("maps task states onto the locked vocabulary (EM4)", () => {
    const withTask = (taskStatus: NodeExecView["taskStatus"]) =>
      deriveNodeStatus({ ...base, node: { ...base.node, taskId: "t", taskStatus } });
    expect(withTask("in_progress").status).toBe("running");
    expect(withTask("waiting_children").status).toBe("running");
    expect(withTask("todo").status).toBe("running");
    expect(withTask("review")).toEqual({
      status: "attention",
      statusDetail: "agent never reported — review the result (effects not applied)",
    });
    expect(withTask("blocked").status).toBe("attention");
    expect(withTask("pending_approval").status).toBe("approval");
    expect(withTask("done").status).toBe("done");
    expect(withTask("failed").status).toBe("failed");
    expect(withTask(null).status).toBe("failed"); // task row vanished
  });
});

describe("diffPlans", () => {
  it("carries forward only DONE tasks by stable action id; reports added/removed", () => {
    const diff = diffPlans(
      [
        { actionId: "schema", taskId: "tsk_1", taskStatus: "done" },
        { actionId: "api", taskId: "tsk_2", taskStatus: "failed" },
        { actionId: "dropme", taskId: null, taskStatus: null },
      ],
      [{ id: "schema" }, { id: "api" }, { id: "fix_dep" }],
    );
    expect(diff.carriedTaskByAction.get("schema")).toBe("tsk_1");
    expect(diff.carriedTaskByAction.has("api")).toBe(false); // failed → re-executes in v2
    expect(diff.added).toEqual(["fix_dep"]);
    expect(diff.removed).toEqual(["dropme"]);
  });
});

describe("computeLayout", () => {
  it("layers by longest dependency path and stacks siblings", () => {
    const pos = computeLayout([
      { id: "root", dependsOn: [] },
      { id: "a", dependsOn: ["root"] },
      { id: "b", dependsOn: ["root"] },
      { id: "join", dependsOn: ["a", "b"] },
      { id: "deep", dependsOn: ["join", "root"] }, // longest path wins: depth 3
    ]);
    expect(pos.get("root")).toEqual({ x: 0, y: 0 });
    expect(pos.get("a")!.x).toBe(280);
    expect(pos.get("b")!.x).toBe(280);
    expect(pos.get("a")!.y).not.toBe(pos.get("b")!.y);
    expect(pos.get("join")!.x).toBe(560);
    expect(pos.get("deep")!.x).toBe(840);
  });
});
