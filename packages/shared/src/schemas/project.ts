import { z } from "zod";
import { idSchema, isoDateSchema, slugSchema } from "./common.js";

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().default(""),
  rootDir: z.string().nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Project = z.infer<typeof projectSchema>;

export const projectCreateSchema = projectSchema
  .omit({ id: true, slug: true, createdAt: true, updatedAt: true })
  .extend({ slug: slugSchema.optional() });
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = projectCreateSchema.partial();
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
