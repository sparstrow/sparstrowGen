import { describe, it, expect } from "vitest";
import {
  validateDraftForPublish,
  draftToCreatePayload,
  type DraftPipeline,
} from "./pipeline-draft.js";
import { pipelineCreateSchema } from "./pipeline.js";

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
