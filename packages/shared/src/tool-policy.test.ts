import { describe, expect, it } from "vitest";
import {
  intersectEffectiveTools,
  isToolPolicySubset,
  resolveEffectiveTools,
  type EffectiveTools,
} from "./tool-policy.js";

const P = (allowed: string[] = [], disallowed: string[] = []) => ({ allowed, disallowed });

describe("resolveEffectiveTools — P2-lite truth table", () => {
  it("empty everywhere ⇒ empty (provider default), not deny-all (P2-Q2)", () => {
    expect(resolveEffectiveTools({})).toEqual({ allowed: [], disallowed: [] });
    expect(resolveEffectiveTools({ agent: P() })).toEqual({ allowed: [], disallowed: [] });
  });

  it("grants union across levels (empty allow = inherit, not narrow)", () => {
    const eff = resolveEffectiveTools({
      agent: P(["Read"]),
      project: P(["WebSearch"]),
      task: P([]),
    });
    expect(eff.allowed).toEqual(["Read", "WebSearch"]);
    expect(eff.disallowed).toEqual([]);
  });

  it("deny-wins: a project disallow removes an agent grant (a project contains its agents, P2-Q1)", () => {
    const eff = resolveEffectiveTools({
      agent: P(["Bash", "Read"]),
      project: P([], ["Bash"]),
    });
    expect(eff.allowed).toEqual(["Read"]); // Bash removed from grants
    expect(eff.disallowed).toEqual(["Bash"]); // and enforced explicitly over the default set
  });

  it("a deny at any level beats a grant at any other level (order-independent outcome)", () => {
    const denyAtTask = resolveEffectiveTools({ agent: P(["Edit"]), task: P([], ["Edit"]) });
    const denyAtGlobal = resolveEffectiveTools({ global: P([], ["Edit"]), task: P(["Edit"]) });
    expect(denyAtTask.allowed).toEqual([]);
    expect(denyAtGlobal.allowed).toEqual([]);
    expect(denyAtTask.disallowed).toEqual(["Edit"]);
    expect(denyAtGlobal.disallowed).toEqual(["Edit"]);
  });

  it("dedupes repeated grants/denies while preserving first-seen order", () => {
    const eff = resolveEffectiveTools({
      global: P(["Read"]),
      agent: P(["Read", "Bash"]),
      project: P(["Bash", "WebSearch"]),
    });
    expect(eff.allowed).toEqual(["Read", "Bash", "WebSearch"]);
  });
});

describe("isToolPolicySubset — P3 delegation clamp (S1-a)", () => {
  const parent: EffectiveTools = { allowed: ["Read", "WebSearch"], disallowed: ["Bash"] };

  it("child within the parent's allow-list and denying the parent's denies is a subset", () => {
    expect(isToolPolicySubset({ allowed: ["Read"], disallowed: ["Bash"] }, parent)).toBe(true);
  });

  it("child granting a tool outside the parent's allow-list is NOT a subset", () => {
    expect(isToolPolicySubset({ allowed: ["Read", "Edit"], disallowed: ["Bash"] }, parent)).toBe(false);
  });

  it("child failing to carry a parent deny (privilege escalation) is NOT a subset", () => {
    expect(isToolPolicySubset({ allowed: ["Read"], disallowed: [] }, parent)).toBe(false);
    // Re-granting a parent-denied tool is the escalation we must reject.
    expect(isToolPolicySubset({ allowed: ["Read", "Bash"], disallowed: [] }, parent)).toBe(false);
  });

  it("when the parent allow-list is empty (default), the child is bounded only by denials", () => {
    const defaultParent: EffectiveTools = { allowed: [], disallowed: ["Bash"] };
    expect(isToolPolicySubset({ allowed: ["Read", "Edit"], disallowed: ["Bash"] }, defaultParent)).toBe(true);
    expect(isToolPolicySubset({ allowed: ["Bash"], disallowed: [] }, defaultParent)).toBe(false);
  });
});

describe("intersectEffectiveTools — S1-a LEAST constructor", () => {
  const I = (a: EffectiveTools, b: EffectiveTools) => intersectEffectiveTools(a, b);

  it("both allow-lists empty ⇒ empty allow, union of denies (provider default, tighter denies)", () => {
    expect(I(P([], ["Bash"]), P([], ["Edit"]))).toEqual({ allowed: [], disallowed: ["Bash", "Edit"] });
  });

  it("one side empty ⇒ the non-default side is the bound", () => {
    expect(I(P([], ["Edit"]), P(["Read", "WebSearch"], []))).toEqual({
      allowed: ["Read", "WebSearch"],
      disallowed: ["Edit"],
    });
    expect(I(P(["Read"], []), P([], ["Bash"]))).toEqual({ allowed: ["Read"], disallowed: ["Bash"] });
  });

  it("both non-empty ⇒ set intersection of allows", () => {
    expect(I(P(["Read", "Edit"], []), P(["Read", "WebSearch"], []))).toEqual({
      allowed: ["Read"],
      disallowed: [],
    });
  });

  it("deny at either level removes the tool from the granted set", () => {
    expect(I(P(["Read", "Bash"], []), P(["Read", "Bash"], ["Bash"]))).toEqual({
      allowed: ["Read"],
      disallowed: ["Bash"],
    });
  });

  it("property: the intersection is always a subset of both inputs", () => {
    const cases: [EffectiveTools, EffectiveTools][] = [
      [P([], []), P([], [])],
      [P(["Read"], ["Bash"]), P([], ["Edit"])],
      [P(["Read", "Edit"], []), P(["Read"], ["Edit"])],
      [P(["A", "B", "C"], ["D"]), P(["B", "C", "E"], ["A"])],
    ];
    for (const [a, b] of cases) {
      const least = I(a, b);
      // Union of denies + intersected allows ⇒ subset of each input by construction.
      expect(isToolPolicySubset(least, a)).toBe(true);
      expect(isToolPolicySubset(least, b)).toBe(true);
    }
  });
});
