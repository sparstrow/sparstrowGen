import { describe, it, expect } from "vitest";
import {
  validateDraftForPublish,
  draftToCreatePayload,
  addDraftStep,
  patchDraftStep,
  removeDraftStep,
  moveDraftStep,
  type DraftPipeline,
  type DraftPipelineStep,
} from "./pipeline-draft";
import { pipelineCreateSchema } from "./pipeline";

const roster = [
  { id: "agt_1", name: "Researcher" },
  { id: "agt_2", name: "Writer" },
];

const validDraft: DraftPipeline = {
  name: "Research → Write",
  description: "Two-step content pipeline",
  steps: [
    { agentId: "agt_1", promptTemplate: "Research {{input}}", onFailure: "abort" },
    { agentId: "agt_2", promptTemplate: "Write up {{input}}", onFailure: "continue" },
  ],
};

describe("validateDraftForPublish", () => {
  it("accepts a clean linear draft", () => {
    expect(validateDraftForPublish(validDraft, roster)).toEqual({ ok: true, reasons: [] });
  });

  it("rejects a missing name", () => {
    const res = validateDraftForPublish({ ...validDraft, name: "  " }, roster);
    expect(res.ok).toBe(false);
    expect(res.reasons).toContain("Add a pipeline name.");
  });

  it("rejects zero steps", () => {
    const res = validateDraftForPublish({ ...validDraft, steps: [] }, roster);
    expect(res.ok).toBe(false);
    expect(res.reasons).toContain("Add at least one step.");
  });

  it("rejects an unresolved (fix-up) agent", () => {
    const res = validateDraftForPublish(
      { ...validDraft, steps: [{ promptTemplate: "Do it", unresolvedAgentName: "Designer" }] },
      roster,
    );
    expect(res.ok).toBe(false);
    expect(res.reasons).toContain("Step 1: pick an agent from this team.");
  });

  it("rejects an agent not on the team roster", () => {
    const res = validateDraftForPublish(
      { ...validDraft, steps: [{ agentId: "agt_999", promptTemplate: "Do it" }] },
      roster,
    );
    expect(res.ok).toBe(false);
    expect(res.reasons).toContain("Step 1: pick an agent from this team.");
  });

  it("rejects an empty prompt", () => {
    const res = validateDraftForPublish(
      { ...validDraft, steps: [{ agentId: "agt_1", promptTemplate: "   " }] },
      roster,
    );
    expect(res.ok).toBe(false);
    expect(res.reasons).toContain("Step 1: add a prompt.");
  });
});

describe("draftToCreatePayload", () => {
  it("maps a valid draft into a schema-clean create payload", () => {
    const payload = draftToCreatePayload(validDraft, "team_1");
    // The strongest assertion: the payload round-trips through the real create schema.
    expect(pipelineCreateSchema.safeParse(payload).success).toBe(true);
    expect(payload.teamId).toBe("team_1");
    expect(payload.projectId).toBeNull();
    expect(payload.enabled).toBe(true);
    expect(payload.steps.map((s) => s.position)).toEqual([0, 1]);
    expect(payload.steps[0]!.agentId).toBe("agt_1");
  });

  it("defaults onFailure to abort and trims name/description", () => {
    const payload = draftToCreatePayload(
      { name: "  Padded  ", description: "  d  ", steps: [{ agentId: "agt_1", promptTemplate: "x" }] },
      null,
    );
    expect(payload.name).toBe("Padded");
    expect(payload.description).toBe("d");
    expect(payload.teamId).toBeNull();
    expect(payload.steps[0]!.onFailure).toBe("abort");
  });
});

describe("Pure draft step mutators", () => {
  const steps: DraftPipelineStep[] = [
    { agentId: "agt_1", promptTemplate: "p1" },
    { agentId: "agt_2", promptTemplate: "p2" },
  ];

  it("addDraftStep adds a step with abort failure", () => {
    const next = addDraftStep(steps);
    expect(next.length).toBe(3);
    expect(next[2]!.onFailure).toBe("abort");
  });

  it("patchDraftStep updates only the targeted index", () => {
    const next = patchDraftStep(steps, 1, { promptTemplate: "new2" });
    expect(next[0]!.promptTemplate).toBe("p1");
    expect(next[1]!.promptTemplate).toBe("new2");
  });

  it("patchDraftStep ignores out-of-bounds index", () => {
    expect(patchDraftStep(steps, -1, { promptTemplate: "new" })).toEqual(steps);
    expect(patchDraftStep(steps, 9, { promptTemplate: "new" })).toEqual(steps);
  });

  it("removeDraftStep removes the targeted index", () => {
    const next = removeDraftStep(steps, 0);
    expect(next.length).toBe(1);
    expect(next[0]!.agentId).toBe("agt_2");
  });

  it("removeDraftStep ignores out-of-bounds index", () => {
    expect(removeDraftStep(steps, -1)).toEqual(steps);
  });

  it("moveDraftStep swaps elements and ignores out of bounds", () => {
    const next = moveDraftStep(steps, 0, 1);
    expect(next[0]!.agentId).toBe("agt_2");
    expect(next[1]!.agentId).toBe("agt_1");

    expect(moveDraftStep(steps, 0, -1)).toEqual(steps); // out of bounds
    expect(moveDraftStep(steps, 1, 1)).toEqual(steps); // out of bounds
  });
});
