import { z } from "zod";
import { pipelineStepSchema, pipelineCreateSchema, type PipelineCreate } from "./pipeline.js";

export const draftPipelineStepSchema = pipelineStepSchema
  .pick({ agentId: true, promptTemplate: true, onFailure: true })
  .extend({
    unresolvedAgentName: z.string().optional(),
  })
  .partial();

export type DraftPipelineStep = z.infer<typeof draftPipelineStepSchema>;

export const draftPipelineSchema = pipelineCreateSchema
  .pick({ name: true, description: true })
  .extend({ steps: z.array(draftPipelineStepSchema).default([]) })
  .partial();

export type DraftPipeline = z.infer<typeof draftPipelineSchema>;

export const teamManagerChatRequestSchema = z.object({
  message: z.string().min(1),
  mode: z.enum(["advisor", "draft"]).default("advisor"),
  draft: draftPipelineSchema.optional(), // The untrusted draft that we clamp in the service
});
export type TeamManagerChatRequest = z.infer<typeof teamManagerChatRequestSchema>;

export interface PipelineDraftTurn {
  reply: string;
  draft: DraftPipeline;
  source: "ai" | "fallback";
}

// ---------------------------------------------------------------------------
// Publish gate — pure logic shared by the canvas (Publish button) and tests.
// v1 pipelines are LINEAR (P10-Q2): edges derive from step order, so "single
// start / no cycles" holds by construction. The only gate is: a name, at least
// one step, and every step resolved to a real roster agent with a prompt.
// ---------------------------------------------------------------------------

export interface PublishValidation {
  ok: boolean;
  /** Human-readable reasons the draft can't be published yet (empty when ok). */
  reasons: string[];
}

export function validateDraftForPublish(
  draft: DraftPipeline,
  roster: { id: string; name: string }[],
): PublishValidation {
  const reasons: string[] = [];
  const name = (draft.name ?? "").trim();
  if (!name) reasons.push("Add a pipeline name.");
  if (name.length > 100) reasons.push("Pipeline name must be 100 characters or fewer.");

  const steps = draft.steps ?? [];
  if (steps.length === 0) reasons.push("Add at least one step.");

  const rosterIds = new Set(roster.map((r) => r.id));
  steps.forEach((s, i) => {
    const n = i + 1;
    const resolved = Boolean(s.agentId) && !s.unresolvedAgentName && rosterIds.has(s.agentId!);
    if (!resolved) reasons.push(`Step ${n}: pick an agent from this team.`);
    if (!(s.promptTemplate ?? "").trim()) reasons.push(`Step ${n}: add a prompt.`);
  });

  return { ok: reasons.length === 0, reasons };
}

/**
 * Map a draft to the real pipeline-create payload. Assumes the draft already
 * passed {@link validateDraftForPublish}; step order becomes `position`.
 */
export function draftToCreatePayload(draft: DraftPipeline, teamId: string | null): PipelineCreate {
  return {
    name: (draft.name ?? "").trim(),
    description: (draft.description ?? "").trim(),
    projectId: null,
    teamId,
    enabled: true,
    steps: (draft.steps ?? []).map((s, i) => ({
      position: i,
      agentId: s.agentId ?? "",
      promptTemplate: (s.promptTemplate ?? "").trim(),
      onFailure: s.onFailure ?? "abort",
    })),
  };
}

// ---------------------------------------------------------------------------
// Pure draft step mutators
// ---------------------------------------------------------------------------

export function addDraftStep(steps: DraftPipelineStep[]): DraftPipelineStep[] {
  return [...steps, { onFailure: "abort" }];
}

export function patchDraftStep(
  steps: DraftPipelineStep[],
  index: number,
  patch: Partial<DraftPipelineStep>,
): DraftPipelineStep[] {
  if (index < 0 || index >= steps.length) return steps;
  return steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
}

export function removeDraftStep(steps: DraftPipelineStep[], index: number): DraftPipelineStep[] {
  if (index < 0 || index >= steps.length) return steps;
  return steps.filter((_, i) => i !== index);
}

export function moveDraftStep(steps: DraftPipelineStep[], index: number, dir: -1 | 1): DraftPipelineStep[] {
  const target = index + dir;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) {
    return steps;
  }
  const next = [...steps];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
