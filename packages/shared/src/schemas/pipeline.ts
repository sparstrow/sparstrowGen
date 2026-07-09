import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";
import { runStatusSchema } from "./run.js";

export const pipelineStepSchema = z.object({
  id: idSchema,
  pipelineId: idSchema,
  position: z.number().int().min(0),
  agentId: idSchema,
  /** Template vars: {{input}} (previous step output), {{trigger_prompt}}, {{steps.N.output}} */
  promptTemplate: z.string().min(1),
  onFailure: z.enum(["abort", "continue"]).default("abort"),
});
export type PipelineStep = z.infer<typeof pipelineStepSchema>;

export const pipelineSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  projectId: idSchema.nullable().default(null),
  teamId: idSchema.nullable().default(null),
  description: z.string().default(""),
  enabled: z.boolean().default(true),
  steps: z.array(pipelineStepSchema).default([]),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Pipeline = z.infer<typeof pipelineSchema>;

export const pipelineStepCreateSchema = pipelineStepSchema.omit({ id: true, pipelineId: true });
export const pipelineCreateSchema = pipelineSchema
  .omit({ id: true, createdAt: true, updatedAt: true, steps: true })
  .extend({ steps: z.array(pipelineStepCreateSchema).default([]) });
export type PipelineCreate = z.infer<typeof pipelineCreateSchema>;
export const pipelineUpdateSchema = pipelineCreateSchema.partial();
export type PipelineUpdate = z.infer<typeof pipelineUpdateSchema>;

export const pipelineRunSchema = z.object({
  id: idSchema,
  pipelineId: idSchema,
  status: runStatusSchema,
  trigger: z.string(),
  triggerPrompt: z.string().nullable().default(null),
  currentStep: z.number().int().default(0),
  startedAt: isoDateSchema.nullable().default(null),
  finishedAt: isoDateSchema.nullable().default(null),
});
export type PipelineRun = z.infer<typeof pipelineRunSchema>;
