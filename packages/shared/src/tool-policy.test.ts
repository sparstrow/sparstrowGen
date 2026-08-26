import { describe, expect, it } from "vitest";
import {
  intersectEffectiveTools,
  isToolPolicySubset,
  resolveEffectiveTools,
  type EffectiveTools,
  resolveEffectiveToolsWithProvenance,
  intersectEffectiveToolsWithProvenance,
  toLegacyShape,
} from "./tool-policy";

const P = (allowed: string[] = [], disallowed: string[] = []) => ({ allowed, disallowed });

describe("resolveEffectiveTools â€” P2-lite truth table", () => {
  it("empty everywhere â‡’ empty (provider default), not deny-all (P2-Q2)", () => {
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

describe("isToolPolicySubset â€” P3 delegation clamp (S1-a)", () => {
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

describe("intersectEffectiveTools â€” S1-a LEAST constructor", () => {
  const I = (a: EffectiveTools, b: EffectiveTools) => intersectEffectiveTools(a, b);

  it("both allow-lists empty â‡’ empty allow, union of denies (provider default, tighter denies)", () => {
    expect(I(P([], ["Bash"]), P([], ["Edit"]))).toEqual({ allowed: [], disallowed: ["Bash", "Edit"] });
  });

  it("one side empty â‡’ the non-default side is the bound", () => {
    expect(I(P([], ["Edit"]), P(["Read", "WebSearch"], []))).toEqual({
      allowed: ["Read", "WebSearch"],
      disallowed: ["Edit"],
    });
    expect(I(P(["Read"], []), P([], ["Bash"]))).toEqual({ allowed: ["Read"], disallowed: ["Bash"] });
  });

  it("both non-empty â‡’ set intersection of allows", () => {
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
      // Union of denies + intersected allows â‡’ subset of each input by construction.
      expect(isToolPolicySubset(least, a)).toBe(true);
      expect(isToolPolicySubset(least, b)).toBe(true);
    }
  });
});

function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

describe("resolveEffectiveToolsWithProvenance", () => {
  it("explicit cases", () => {
    const r1 = resolveEffectiveToolsWithProvenance({});
    expect(r1.usesProviderDefault).toBe(true);
    expect(r1.tools).toEqual([]);

    const r2 = resolveEffectiveToolsWithProvenance({
      project: P([], ["Bash"]),
      task: P([], ["Bash"]),
    });
    expect(r2.tools.find((t) => t.tool === "Bash")?.deniedBy).toEqual(["project", "task"]);

    const r3 = resolveEffectiveToolsWithProvenance({
      agent: P(["Bash"]),
      project: P([], ["Bash"]),
    });
    const tool = r3.tools.find((t) => t.tool === "Bash");
    expect(tool?.grantedBy).toEqual(["agent"]);
    expect(tool?.deniedBy).toEqual(["project"]);
    
    const bound = resolveEffectiveToolsWithProvenance({ agent: P([], ["Edit"]) });
    const resolved = resolveEffectiveToolsWithProvenance({ task: P(["Edit", "Read"]) });
    const intersected = intersectEffectiveToolsWithProvenance(resolved, bound);
    
    expect([...toLegacyShape(intersected).allowed].sort()).toEqual([...intersectEffectiveTools(toLegacyShape(resolved), toLegacyShape(bound)).allowed].sort());
    expect([...toLegacyShape(intersected).disallowed].sort()).toEqual([...intersectEffectiveTools(toLegacyShape(resolved), toLegacyShape(bound)).disallowed].sort());
    expect(intersected.tools.find(t => t.tool === "Edit")?.deniedBy).toContain("delegation-bound");
  });

  it("agrees with resolveEffectiveTools on randomized input", () => {
    const prng = mulberry32(12345);
    const levels = ["global", "agent", "project", "task"] as const;
    const possibleTools = ["A", "B", "C", "D"];

    for (let i = 0; i < 200; i++) {
      const policy: any = {};
      for (const lvl of levels) {
        if (prng() > 0.5) {
          const allowed = possibleTools.filter(() => prng() > 0.5);
          const disallowed = possibleTools.filter(() => prng() > 0.8);
          policy[lvl] = P(allowed, disallowed);
        }
      }

      const legacy = resolveEffectiveTools(policy);
      const prov = resolveEffectiveToolsWithProvenance(policy);
      expect([...toLegacyShape(prov).allowed].sort()).toEqual([...legacy.allowed].sort());
      expect([...toLegacyShape(prov).disallowed].sort()).toEqual([...legacy.disallowed].sort());
    }
  });
  
  it("intersectEffectiveToolsWithProvenance agrees with intersectEffectiveTools on randomized input", () => {
    const prng = mulberry32(54321);
    const possibleTools = ["A", "B", "C", "D"];

    for (let i = 0; i < 200; i++) {
      const aAllowed = prng() > 0.2 ? possibleTools.filter(() => prng() > 0.5) : [];
      const aDisallowed = possibleTools.filter(() => prng() > 0.8);
      const bAllowed = prng() > 0.2 ? possibleTools.filter(() => prng() > 0.5) : [];
      const bDisallowed = possibleTools.filter(() => prng() > 0.8);
      
      const a = resolveEffectiveToolsWithProvenance({ global: P(aAllowed, aDisallowed) });
      const b = resolveEffectiveToolsWithProvenance({ global: P(bAllowed, bDisallowed) });
      
      const legacyIntersect = intersectEffectiveTools(toLegacyShape(a), toLegacyShape(b));
      const provIntersect = intersectEffectiveToolsWithProvenance(a, b);
      expect([...toLegacyShape(provIntersect).allowed].sort()).toEqual([...legacyIntersect.allowed].sort());
      expect([...toLegacyShape(provIntersect).disallowed].sort()).toEqual([...legacyIntersect.disallowed].sort());
    }
  });
});
