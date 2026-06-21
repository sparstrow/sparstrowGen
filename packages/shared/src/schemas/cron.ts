import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";

export const cronTargetTypeSchema = z.enum(["agent", "pipeline"]);
export type CronTargetType = z.infer<typeof cronTargetTypeSchema>;

export const cronJobSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  cronExpr: z.string().min(1),
  timezone: z.string().default("system"),
  targetType: cronTargetTypeSchema,
  targetId: idSchema,
  prompt: z.string().min(1),
  projectId: idSchema.nullable().default(null),
  enabled: z.boolean().default(true),
  lastRunAt: isoDateSchema.nullable().default(null),
  nextRunAt: isoDateSchema.nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type CronJob = z.infer<typeof cronJobSchema>;

export const cronJobCreateSchema = cronJobSchema.omit({
  id: true,
  lastRunAt: true,
  nextRunAt: true,
  createdAt: true,
  updatedAt: true,
});
export type CronJobCreate = z.infer<typeof cronJobCreateSchema>;
export const cronJobUpdateSchema = cronJobCreateSchema.partial();
export type CronJobUpdate = z.infer<typeof cronJobUpdateSchema>;
