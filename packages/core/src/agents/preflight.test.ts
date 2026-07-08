import { describe, expect, it } from "vitest";
import { cosine, rankDuplicates, type DupCandidate } from "./preflight.js";

const v = (...xs: number[]) => Float32Array.from(xs);

describe("preflight cosine", () => {
  it("is 1 for identical direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine(v(1, 0), v(2, 0))).toBeCloseTo(1);
    expect(cosine(v(1, 0), v(0, 1))).toBeCloseTo(0);
    expect(cosine(v(1, 0), v(-1, 0))).toBeCloseTo(-1);
  });

  it("returns 0 (not NaN) for a zero vector", () => {
    expect(cosine(v(0, 0), v(1, 1))).toBe(0);
  });
});

describe("preflight rankDuplicates", () => {
  const candidates: DupCandidate[] = [
    { id: "a", name: "Twin", role: "reviewer", vec: v(1, 0, 0) },
    { id: "b", name: "Cousin", role: "planner", vec: v(0.9, 0.1, 0) },
    { id: "c", name: "Stranger", role: "writer", vec: v(0, 1, 0) },
  ];

  it("surfaces only candidates above the threshold, closest first", () => {
    const out = rankDuplicates(v(1, 0, 0), candidates, 0.82, 4);
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
    expect(out[0]!.similarity).toBeCloseTo(1);
    expect(out[0]!.reason).toContain("Twin");
  });

  it("caps the result count", () => {
    const many: DupCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: `x${i}`,
      name: `X${i}`,
      role: "",
      vec: v(1, 0, 0),
    }));
    expect(rankDuplicates(v(1, 0, 0), many, 0.82, 3)).toHaveLength(3);
  });

  it("returns [] when nothing clears the bar (advisory, never blocks)", () => {
    expect(rankDuplicates(v(0, 0, 1), candidates, 0.82, 4)).toEqual([]);
  });
});
