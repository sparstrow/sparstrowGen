import { z } from "zod";
import { pipelineStepSchema, pipelineCreateSchema } from "./pipeline.js";

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
