import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";

/**
 * P4 project directives (§2 / P4-Q2): operator-authored, always-injected project
 * rules ("Always use Tailwind here"). Stored in a dedicated ordered, toggleable
 * table — NOT a tag convention — so the guaranteed-injection contract is explicit.
 * The injector PREPENDS enabled directives (ordered by sort) into every run in the
 * project, never trimmed by the memory token budget.
 */
export const projectDirectiveSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  body: z.string().min(1).max(2000),
  /** Ascending display + injection order. */
  sort: z.number().int().default(0),
  enabled: z.boolean().default(true),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type ProjectDirective = z.infer<typeof projectDirectiveSchema>;

export const projectDirectiveCreateSchema = z.object({
  body: z.string().min(1).max(2000),
  sort: z.number().int().optional(),
  enabled: z.boolean().optional(),
});
export type ProjectDirectiveCreate = z.infer<typeof projectDirectiveCreateSchema>;

export const projectDirectiveUpdateSchema = z.object({
  body: z.string().min(1).max(2000).optional(),
  sort: z.number().int().optional(),
  enabled: z.boolean().optional(),
});
export type ProjectDirectiveUpdate = z.infer<typeof projectDirectiveUpdateSchema>;
