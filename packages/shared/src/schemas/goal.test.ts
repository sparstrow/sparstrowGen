import { describe, expect, it } from "vitest";
import {
  consensusVerdictSchema,
  goalCreateSchema,
  goalSchema,
  planNodeStatusSchema,
  plannerActionSchema,
  plannerPlanSchema,
} from "./goal";

const action = (over: Record<string, unknown> = {}) => ({
  id: "write_schema",
  label: "Write the schema",
  description: "Write the zod schema for the settings page.",
  ...over,
});

describe("plannerActionSchema", () => {
  it("applies defaults (kind=work, no deps, cost=1, null hint)", () => {
    const a = plannerActionSchema.parse(action());
    expect(a.kind).toBe("work");
    expect(a.dependsOn).toEqual([]);
    expect(a.agentHint).toBeNull();
    expect(a.cost).toBe(1);
    expect(a.pre).toEqual([]);
    expect(a.effects).toEqual([]);
  });

  it("rejects action ids that are not short slugs", () => {
    expect(() => plannerActionSchema.parse(action({ id: "has spaces" }))).toThrow();
    expect(() => plannerActionSchema.parse(action({ id: "" }))).toThrow();
    expect(() => plannerActionSchema.parse(action({ id: "x".repeat(65) }))).toThrow();
    // slugs with _ and - and mixed case are fine
    expect(plannerActionSchema.parse(action({ id: "Fix_auth-Test2" })).id).toBe("Fix_auth-Test2");
  });

  it("caps annotation arrays and dependency fan-in", () => {
    expect(() =>
      plannerActionSchema.parse(action({ pre: Array.from({ length: 21 }, (_, i) => `f${i}`) })),
    ).toThrow();
    expect(() =>
      plannerActionSchema.parse(
        action({ dependsOn: Array.from({ length: 17 }, (_, i) => `d${i}`) }),
      ),
    ).toThrow();
  });
});

describe("plannerPlanSchema", () => {
  it("requires at least one action and caps at 30", () => {
    expect(() => plannerPlanSchema.parse({ actions: [] })).toThrow();
    const big = Array.from({ length: 31 }, (_, i) => action({ id: `a${i}` }));
    expect(() => plannerPlanSchema.parse({ actions: big })).toThrow();
    const ok = plannerPlanSchema.parse({ actions: [action()] });
    expect(ok.planSummary).toBe("");
  });
});

describe("goalSchema", () => {
  it("defaults a fresh goal to planning/v0 with empty audit trails", () => {
    const g = goalSchema.parse({
      id: "gl_abc1234567",
      prompt: "Build the memory settings page",
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
    });
    expect(g.status).toBe("planning");
    expect(g.planVersion).toBe(0);
    expect(g.replanCount).toBe(0);
    expect(g.consensus).toBe("auto");
    expect(g.paused).toBe(false);
    expect(g.worldState).toEqual([]);
    expect(g.versionLog).toEqual([]);
    expect(g.pendingReplanReason).toBeNull();
  });

  it("rejects unknown statuses (paused is a flag, not a status)", () => {
    expect(() =>
      goalSchema.parse({
        id: "gl_abc1234567",
        prompt: "x",
        status: "paused",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("goalCreateSchema", () => {
  it("accepts the minimal launcher payload", () => {
    const c = goalCreateSchema.parse({ prompt: "Fix the failing auth test" });
    expect(c.projectId).toBeUndefined();
    expect(c.consensus).toBeUndefined();
  });

  it("rejects an empty prompt", () => {
    expect(() => goalCreateSchema.parse({ prompt: "" })).toThrow();
  });
});

describe("consensusVerdictSchema", () => {
  it("requires a position with the verdict (disagreement shows BOTH positions)", () => {
    expect(() => consensusVerdictSchema.parse({ approve: false, position: "" })).toThrow();
    const v = consensusVerdictSchema.parse({ approve: true, position: "Diff is clean." });
    expect(v.approve).toBe(true);
  });
});

describe("planNodeStatusSchema", () => {
  it("covers exactly the locked semantic-status vocabulary (design rule 15)", () => {
    expect(planNodeStatusSchema.options).toEqual([
      "pending",
      "ready",
      "running",
      "attention",
      "approval",
      "done",
      "failed",
      "skipped",
    ]);
  });
});
