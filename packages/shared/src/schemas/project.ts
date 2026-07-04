import { z } from "zod";
import { idSchema, isoDateSchema, slugSchema } from "./common.js";

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().default(""),
  rootDir: z.string().nullable().default(null),
  /** P2 project-level tool policy (empty allow = inherit; deny always wins). */
  allowedTools: z.array(z.string()).default([]),
  disallowedTools: z.array(z.string()).default([]),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Project = z.infer<typeof projectSchema>;

// Tool policy is set via update (or the deferred matrix UI), not at creation.
export const projectCreateSchema = projectSchema
  .omit({
    id: true,
    slug: true,
    allowedTools: true,
    disallowedTools: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({ slug: slugSchema.optional() });
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
});
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
